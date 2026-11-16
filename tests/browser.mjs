import { chromium, request as playwrightRequest } from "@playwright/test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cleanupGroup } from "./cleanup.js";
import { mkdir, writeFile } from "node:fs/promises";
import { pool } from "../server/db.js";
import { createApp } from "../server/index.js";
const suffix = Date.now().toString(36),
  password = randomBytes(18).toString("hex");
let app,
  server,
  base = process.env.TEST_BASE_URL;
const groups = [];
let redeploy = null;
if (!base) {
  app = await createApp();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
  process.env.APP_ORIGIN = base;
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["microphone"],
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await mkdir(".local/screenshots", { recursive: true });
async function signIn(user, pw = password) {
  await page.goto(base);
  await page.getByLabel("Usuario", { exact: true }).fill(user);
  await page.getByLabel("Contraseña", { exact: true }).fill(pw);
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await page.getByRole("heading", { name: /Hola / }).waitFor();
  if (await page.getByRole("dialog").isVisible())
    await page
      .getByRole("button", { name: "Continuar con estos colores" })
      .click();
}
async function signOut() {
  await page.goto(base + "/settings");
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await page.getByRole("heading", { name: "Qué bueno verte" }).waitFor();
}
async function api(path, body, method = body ? "POST" : "GET") {
  const r = await context.request.fetch(base + "/api" + path, {
    method,
    data: body,
  });
  assert.equal(r.status(), 200, await r.text());
  return r.json();
}
async function closed() {
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
async function snap(name, width, height) {
  await page.setViewportSize({ width, height });
  await page.getByRole("heading", { name: /Hola / }).waitFor();
  await page.getByText("Vendido confirmado", { exact: true }).waitFor();
  await page.screenshot({
    path: ".local/screenshots/" + name + ".png",
    fullPage: true,
    animations: "disabled",
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  assert.equal(overflow, false, "Sin overflow en " + name);
}
try {
  await page.goto(base);
  await page.screenshot({
    path: ".local/screenshots/login.png",
    fullPage: true,
    animations: "disabled",
  });
  await signIn(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
  await page.goto(base + "/groups");
  await page.getByRole("button", { name: "Crear grupo", exact: true }).click();
  await page.getByLabel("Nombre del grupo").fill("QA Navegador " + suffix);
  await page.getByLabel("Cupos de polacos").fill("2");
  await page.getByLabel("Nombre del dueño").fill("María Vargas");
  await page.getByLabel("Usuario del dueño").fill("browser_owner_" + suffix);
  await page.getByLabel("Contraseña inicial").fill(password);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crear grupo", exact: true })
    .click();
  await closed();
  const group = (await api("/groups?limit=100")).items.find(
    (g) => g.name === "QA Navegador " + suffix,
  );
  assert(group);
  groups.push(group.id);
  await signOut();
  await signIn("browser_owner_" + suffix);
  await page.goto(base + "/team");
  await page.getByRole("button", { name: "Nuevo polaco", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Carlos Solano");
  await page.getByLabel("Nombre de usuario").fill("browser_worker_" + suffix);
  await page.getByLabel("Contraseña inicial").fill(password);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await closed();
  const worker = (await api("/directory")).find((u) => u.role === "polaco");
  await page.goto(base + "/inventory");
  await page
    .getByRole("button", { name: "Nuevo producto", exact: true })
    .click();
  await page.getByLabel("Nombre", { exact: true }).fill("Licuadora Oster");
  await page.getByLabel("Descripción").fill("Vaso de vidrio · 3 velocidades");
  await page.getByLabel("Precio unitario (₡)").fill("100000");
  await page.getByLabel("Unidades disponibles").fill("5");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await closed();
  await page.goto(base + "/clients");
  await page
    .getByRole("button", { name: "Nuevo cliente", exact: true })
    .click();
  await page.getByLabel("Nombre o identificador").fill("Andrea Jiménez");
  await page.getByLabel("Responsable").selectOption(worker.id);
  await page.getByLabel("Teléfono", { exact: true }).fill("8888 1234");
  await page.getByLabel("Dirección").fill("San Ramón · Centro");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crear cliente", exact: true })
    .click();
  await closed();
  await signOut();
  await signIn("browser_worker_" + suffix);
  await page.goto(base + "/clients");
  await page.getByRole("button", { name: /Andrea Jiménez/ }).click();
  await page.getByRole("button", { name: "Nueva compra", exact: true }).click();
  await page
    .getByLabel("Producto", { exact: true })
    .selectOption({ label: "Licuadora Oster · ₡100 000,00 · 5 disponibles" })
    .catch(async () => {
      await page
        .getByLabel("Producto", { exact: true })
        .selectOption({ index: 1 });
    });
  await page.getByLabel("Precio", { exact: true }).selectOption("custom");
  await page.getByLabel("Precio unitario (₡)").fill("90000");
  await page.getByLabel("Monto de la cuota (₡)").fill("10000");
  await page
    .getByRole("button", { name: "Ver calendario", exact: true })
    .click();
  await page.getByText("9 cuotas ·").waitFor();
  await page
    .getByRole("button", { name: "Solicitar precio y reservar" })
    .click();
  await closed();
  await page
    .getByRole("heading", { name: "Pendiente de aprobación" })
    .waitFor();
  const pendingId = new URL(page.url()).pathname.split("/")[2];
  await signOut();
  await signIn("browser_owner_" + suffix);
  await page.goto(base + "/requests");
  await page.getByRole("button", { name: "Revisar y aprobar" }).click();
  await page
    .getByRole("button", { name: "Ver calendario", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Aprobar compra", exact: true })
    .click();
  await closed();
  await page.goto(base + "/purchases/" + pendingId);
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.getByLabel("Tipo de pago").selectOption("capital");
  await page.getByLabel("Monto recibido (₡)").fill("20000");
  await page
    .getByRole("button", { name: "Confirmar y registrar pago" })
    .click();
  await closed();
  await page.getByText("₡70 000,00", { exact: true }).waitFor();
  const p = await api("/purchases/" + pendingId);
  assert.equal(p.ledger.balance, 7000000);
  assert.equal(p.ledger.remaining_count, 7);
  assert.equal(p.ledger.schedule[0].remaining, 1000000);
  await page.goto(base + "/chats");
  await page
    .getByRole("button", { name: "Nueva conversación", exact: true })
    .click();
  await page.getByLabel("Tipo de conversación").selectOption("direct");
  await page.getByLabel("Compañero", { exact: true }).selectOption(worker.id);
  await page
    .getByLabel("Primer mensaje")
    .fill("Cobro revisado. Todo está en orden");
  await page.getByRole("button", { name: "Enviar primer mensaje" }).click();
  await closed();
  await page
    .getByText("Cobro revisado. Todo está en orden", { exact: true })
    .waitFor();
  const chatId = new URL(page.url()).pathname.split("/")[2];
  await page
    .getByLabel("Mensaje", { exact: true })
    .fill("Segunda nota persistente");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await page.getByText("Segunda nota persistente", { exact: true }).waitFor();
  await page.reload();
  await page.getByText("Segunda nota persistente", { exact: true }).waitFor();
  await page
    .getByLabel("Adjuntar archivo", { exact: true })
    .filter({ visible: true })
    .last()
    .setInputFiles({
      name: "nota.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Archivo persistente de navegador"),
    });
  await page.getByText("nota.txt", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await page
    .locator(".message")
    .getByRole("link", { name: "nota.txt" })
    .waitFor();
  await page.getByRole("button", { name: "Grabar audio" }).click();
  await page.getByRole("button", { name: "Terminar grabación" }).waitFor();
  await new Promise((r) => setTimeout(r, 350));
  await page.getByRole("button", { name: "Terminar grabación" }).click();
  await page.locator(".attached").waitFor();
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await page.locator("audio").waitFor();
  await page
    .getByLabel("Adjuntar archivo", { exact: true })
    .filter({ visible: true })
    .last()
    .setInputFiles({
      name: "foto.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPAcAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await page.locator(".attached").waitFor();
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await page.getByRole("img", { name: "foto.png" }).waitFor();
  await page.reload();
  await page.locator("audio").waitFor();
  await page.getByRole("img", { name: "foto.png" }).waitFor();
  await page.goto(base + "/");
  await snap("desktop", 1440, 1000);
  await snap("tablet", 820, 1180);
  await snap("mobile", 390, 844);
  await page.goto(base + "/calendar");
  await page.getByRole("heading", { name: "Cobros", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  await page.screenshot({
    path: ".local/screenshots/mobile-cobros.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto(base + "/purchases/" + pendingId);
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.getByLabel("Monto recibido (₡)").fill("3000");
  await page
    .getByRole("button", { name: "Confirmar y registrar pago" })
    .click();
  await closed();
  assert.equal(
    (await api("/purchases/" + pendingId)).ledger.schedule[0].remaining,
    700000,
  );
  await page.screenshot({
    path: ".local/screenshots/mobile-compra.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto(base + "/settings");
  await page.getByRole("button", { name: "Océano", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".palette-ocean"));
  await page.reload();
  await page.waitForFunction(() => document.querySelector(".palette-ocean"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signOut();
  await signIn("browser_worker_" + suffix);
  await page.goto(base + "/chats");
  await page
    .getByRole("button", { name: "Nueva conversación", exact: true })
    .click();
  await page.getByLabel("Tipo de conversación").selectOption("support");
  await page.getByLabel("Primer mensaje").fill("Consulta privada de prueba");
  await page.getByRole("button", { name: "Enviar primer mensaje" }).click();
  await closed();
  await page.getByText("Consulta privada de prueba", { exact: true }).waitFor();
  await signOut();
  await signIn(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
  await page.goto(base + "/chats");
  await page.getByLabel("Tipo de conversación").selectOption("support");
  await page.getByRole("button", { name: /Soporte · Carlos Solano/ }).click();
  await page
    .getByLabel("Mensaje", { exact: true })
    .fill("Respuesta de soporte verificada");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await page
    .getByText("Respuesta de soporte verificada", { exact: true })
    .waitFor();
  if (process.env.VERIFY_REDEPLOY === "1") {
    assert(
      process.env.TEST_BASE_URL,
      "El redespliegue requiere una URL pública explícita",
    );
    const run = promisify(execFile);
    const deployments = async () =>
      JSON.parse(
        (
          await run("railway", [
            "deployment",
            "list",
            "--service",
            "polacos",
            "--json",
          ])
        ).stdout,
      );
    const before = (await deployments())[0].id;
    const chatBefore = await api("/conversations/" + chatId);
    const attachments = chatBefore.messages.items.filter((m) => m.file_id);
    assert.equal(attachments.length, 3);
    const hashes = new Map();
    const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
    for (const m of attachments) {
      const response = await context.request.get(
        base + "/api/files/" + m.file_id,
      );
      assert.equal(response.status(), 200);
      hashes.set(m.file_id, hash(await response.body()));
    }
    await run("railway", [
      "redeploy",
      "--service",
      "polacos",
      "--yes",
      "--json",
    ]);
    console.log(
      "Redespliegue solicitado para verificar texto, imagen, audio y archivo",
    );
    for (let i = 0; i < 36; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const current = (await deployments())[0];
      if (current.id === before) continue;
      assert(
        !["FAILED", "CRASHED", "REMOVED"].includes(current.status),
        "Falló el redespliegue: " + current.status,
      );
      if (current.status === "SUCCESS") {
        redeploy = { id: current.id, status: current.status };
        break;
      }
    }
    assert(redeploy, "El redespliegue no terminó dentro del plazo");
    await page.goto(base + "/chats/" + chatId);
    await page.getByText("Segunda nota persistente", { exact: true }).waitFor();
    await page.getByRole("img", { name: "foto.png" }).waitFor();
    await page.locator("audio").waitFor();
    for (const m of attachments) {
      const response = await context.request.get(
        base + "/api/files/" + m.file_id,
      );
      assert.equal(response.status(), 200);
      assert.equal(hash(await response.body()), hashes.get(m.file_id));
    }
    console.log(
      "Persistencia tras redespliegue: sesión, texto y bytes de los 3 adjuntos idénticos",
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "Navegador: grupo, cupos, usuarios, inventario, cliente, reserva, aprobación, capital, parcial, chat, archivo, audio, soporte, paleta, recarga y 3 tamaños: OK",
  );
  await writeFile(
    ".local/browser-result.json",
    JSON.stringify(
      {
        ok: true,
        base,
        viewports: [1440, 820, 390],
        screenshots: ".local/screenshots",
        errors,
        redeploy,
      },
      null,
      2,
    ),
  );
} catch (e) {
  await page.screenshot({
    path: ".local/screenshots/failure.png",
    fullPage: true,
    animations: "disabled",
  });
  console.error("Browser failure:", e.message);
  throw e;
} finally {
  await browser.close();
  for (const id of groups) await cleanupGroup(pool, id);
  if (app) await app.locals.shutdown();
  if (server) await new Promise((r) => server.close(r));
  await pool.end();
}
