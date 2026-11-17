import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { pool, one, check, audit, notify, tx } from "./db.js";
import { write, list } from "./routes.js";
import { z, uuid, name, text, key } from "./validate.js";
import {
  groupAccess,
  activeUser,
  conversationAccess,
  canClient,
  getPurchase,
  ownFile,
} from "./access.js";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
const allowed = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/webm",
  "video/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "video/mp4",
  "audio/wav",
  "application/pdf",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
export function collaborationRoutes(app) {
  app.get("/api/access", async (req, res) => {
    let rows = (
      await pool.query(
        "SELECT a.*,u.name AS requester_name,t.name AS target_name FROM access_grants a JOIN users u ON u.id=a.requester_id JOIN users t ON t.id=a.target_id WHERE ($1::uuid IS NULL OR a.group_id=$1) AND ($2::uuid IS NULL OR a.requester_id=$2 OR a.target_id=$2) ORDER BY a.created_at DESC",
        [
          req.user.role === "admin"
            ? req.query.group_id || null
            : req.user.group_id,
          req.user.role === "polaco" ? req.user.id : null,
        ],
      )
    ).rows;
    rows = rows.map((g) => ({
      ...g,
      expired: new Date(g.expires_at) <= new Date(),
    }));
    if (req.query.status)
      rows = rows.filter((g) =>
        req.query.status === "expired"
          ? g.expired && g.status === "approved"
          : g.status === req.query.status &&
            !(g.status === "approved" && g.expired),
      );
    res.json(list(rows, req));
  });
  write(
    app,
    "post",
    "/api/access",
    z.object({
      target_id: uuid,
      permission: z.enum(["read", "edit"]),
      scope: z.string().min(1).max(1000),
      hours: z.coerce.number().int().min(1).max(720),
    }),
    async (db, u, b) => {
      check(u.role === "polaco", "Los dueños ya administran su grupo");
      const target = await activeUser(db, b.target_id, u.group_id);
      check(target.id !== u.id, "Elige a un compañero");
      const a = await one(
        db,
        "INSERT INTO access_grants(group_id,requester_id,target_id,permission,scope,expires_at) VALUES($1,$2,$3,$4,$5,now()+($6||' hours')::interval) RETURNING *",
        [u.group_id, u.id, target.id, b.permission, b.scope, b.hours],
      );
      await notify(
        db,
        target.id,
        "Solicitud de acceso",
        `${u.name}: ${b.scope}`,
        "/requests",
        a.id,
        `access:${a.id}`,
      );
      return a;
    },
  );
  write(
    app,
    "post",
    "/api/access/:id/decide",
    z.object({
      decision: z.enum(["approved", "rejected", "revoked"]),
      permission: z.enum(["read", "edit"]).optional(),
      all_clients: z.boolean().default(false),
      client_ids: z.array(uuid).max(1000).default([]),
      purchase_ids: z.array(uuid).max(1000).default([]),
      expires_at: z.string().optional(),
      reason: z.string().max(1000).default(""),
    }),
    async (db, u, b, req) => {
      const a = await one(db, "SELECT * FROM access_grants WHERE id=$1", [
        req.params.id,
      ]);
      check(a, "Solicitud no disponible", 404);
      groupAccess(u, a.group_id);
      check(
        u.id === a.target_id ||
          u.role === "admin" ||
          (u.role === "owner" && b.decision === "revoked"),
        "Solo el destinatario decide qué compartir",
        403,
      );
      check(
        b.decision === "revoked"
          ? ["approved", "pending"].includes(a.status)
          : a.status === "pending",
        "Solicitud ya resuelta",
        409,
      );
      let expiry = a.expires_at;
      if (b.decision === "approved") {
        expiry = new Date(b.expires_at);
        check(
          !isNaN(expiry) &&
            expiry > new Date() &&
            expiry < Date.now() + 31 * 86400000,
          "La caducidad debe estar entre ahora y 30 días",
        );
        check(
          b.all_clients || b.client_ids.length || b.purchase_ids.length,
          "Selecciona qué compartir",
        );
        for (const id of b.client_ids)
          check(
            await one(
              db,
              "SELECT 1 FROM clients WHERE id=$1 AND owner_id=$2 AND group_id=$3 AND deleted_at IS NULL",
              [id, a.target_id, a.group_id],
            ),
            "Cliente fuera del alcance",
          );
        for (const id of b.purchase_ids)
          check(
            await one(
              db,
              "SELECT 1 FROM purchases p JOIN clients c ON c.id=p.client_id WHERE p.id=$1 AND c.owner_id=$2 AND c.group_id=$3 AND p.deleted_at IS NULL AND c.deleted_at IS NULL",
              [id, a.target_id, a.group_id],
            ),
            "Compra fuera del alcance",
          );
      }
      await db.query(
        "UPDATE access_grants SET status=$2,permission=$3,all_clients=$4,client_ids=$5,purchase_ids=$6,expires_at=$7,reason=$8 WHERE id=$1",
        [
          a.id,
          b.decision,
          b.permission || a.permission,
          b.all_clients,
          JSON.stringify(b.client_ids),
          JSON.stringify(b.purchase_ids),
          expiry,
          b.reason,
        ],
      );
      await audit(db, u, "access", a.id, "Resolver acceso", a, b);
      await notify(
        db,
        a.requester_id,
        {
          approved: "Acceso concedido",
          rejected: "Acceso rechazado",
          revoked: "Acceso revocado",
        }[b.decision],
        b.reason,
        "/requests",
        a.id,
        `access:${a.id}:${b.decision}`,
      );
    },
  );
  app.get("/api/conversations", async (req, res) => {
    const rows = (
      await pool.query(
        `SELECT c.*,u.name AS creator_name,u.role AS creator_role${req.user.role === "admin" ? ",g.name AS group_name" : ""},(SELECT count(*)::int FROM messages m WHERE m.conversation_id=c.id) AS message_count,(SELECT count(*)::int FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.user_id=$1 WHERE m.conversation_id=c.id AND m.created_at>cm.read_at AND m.sender_id<>$1) AS unread,(SELECT max(created_at) FROM messages WHERE conversation_id=c.id) AS last_message_at FROM conversations c LEFT JOIN users u ON u.id=c.created_by LEFT JOIN groups g ON g.id=c.group_id WHERE ($2::boolean OR EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=c.id AND cm.user_id=$1)) AND ($3::uuid IS NULL OR c.group_id=$3) ORDER BY last_message_at DESC NULLS LAST`,
        [
          req.user.id,
          req.user.role === "admin",
          req.user.role === "admin"
            ? req.query.group_id || null
            : req.user.group_id,
        ],
      )
    ).rows;
    res.json(
      list(
        rows.filter(
          (c) =>
            (!req.query.kind || c.kind === req.query.kind) &&
            (!req.query.status ||
              req.query.status === "all" ||
              (req.query.status === "unresolved"
                ? c.support_status !== "resolved"
                : c.support_status === req.query.status)),
        ),
        req,
      ),
    );
  });
  // A support thread is created atomically with its first message.
  write(
    app,
    "post",
    "/api/conversations",
    z.object({
      kind: z.enum(["direct", "group", "support"]),
      name: name.optional(),
      members: z.array(uuid).max(100).default([]),
      body: z.string().max(5000).default(""),
      file_id: uuid.optional(),
      idempotency_key: key,
    }),
    async (db, u, b) => {
      const existing = await one(
        db,
        "SELECT conversation_id FROM messages WHERE sender_id=$1 AND idempotency_key=$2",
        [u.id, b.idempotency_key],
      );
      if (existing) {
        await conversationAccess(db, u, existing.conversation_id);
        return { id: existing.conversation_id };
      }
      let members = [...new Set([u.id, ...b.members])],
        gid = u.group_id;
      let title = b.name;
      check(b.body.trim() || b.file_id, "Escribe el primer mensaje");
      if (b.kind === "support") {
        check(u.role !== "admin", "Responde desde una conversación recibida");
        const admin = await one(
          db,
          "SELECT id FROM users WHERE role='admin' AND deleted_at IS NULL ORDER BY created_at LIMIT 1",
        );
        check(admin, "Soporte no disponible");
        members = [u.id, admin.id];
        title = `Soporte · ${u.name}`;
        const old = await one(
          db,
          "SELECT c.id FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id WHERE c.kind='support' AND c.created_by=$1 AND cm.user_id=$1",
          [u.id],
        );
        if (old) {
          await sendMessage(db, u, old.id, b);
          return old;
        }
      } else {
        check(members.length >= 2, "Selecciona al menos un compañero");
        if (b.kind === "direct")
          check(
            members.length === 2,
            "El chat individual es entre dos personas",
          );
        for (const id of members.filter((id) => id !== u.id)) {
          const target = await one(
            db,
            "SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL",
            [id],
          );
          check(target, "Participante no disponible");
          if (u.role === "admin") {
            check(
              target.role === "owner",
              "El administrador solo inicia conversaciones con dueños",
              403,
            );
            check(
              !gid || gid === target.group_id,
              "Los participantes deben pertenecer al mismo grupo",
            );
            gid = target.group_id;
          } else {
            groupAccess(u, target.group_id);
            check(target.role !== "admin", "Usa el canal Soporte");
          }
          title ||= `${u.name} · ${target.name}`;
        }
        if (b.kind === "group")
          check(b.name, "Escribe un nombre para el grupo");
      }
      const c = await one(
        db,
        "INSERT INTO conversations(group_id,kind,name,created_by) VALUES($1,$2,$3,$4) RETURNING *",
        [gid, b.kind, title, u.id],
      );
      for (const member of members)
        await db.query(
          "INSERT INTO conversation_members(conversation_id,user_id) VALUES($1,$2)",
          [c.id, member],
        );
      await sendMessage(db, u, c.id, b);
      return c;
    },
  );
  app.get("/api/conversations/:id", async (req, res) => {
    const c = await conversationAccess(pool, req.user, req.params.id);
    const rows = (
      await pool.query(
        "SELECT m.*,u.name AS sender_name,f.name AS file_name,f.mime AS file_mime,f.size AS file_size FROM messages m JOIN users u ON u.id=m.sender_id LEFT JOIN files f ON f.id=m.file_id WHERE conversation_id=$1 ORDER BY m.created_at DESC,m.id DESC",
        [c.id],
      )
    ).rows;
    const members = (
      await pool.query(
        "SELECT u.id,u.name,u.role,u.deleted_at FROM conversation_members cm JOIN users u ON u.id=cm.user_id WHERE conversation_id=$1",
        [c.id],
      )
    ).rows;
    res.json({
      ...c,
      messages: list(rows, req),
      members,
      can_send:
        (req.user.role === "admin" && c.kind === "support") ||
        members.some((m) => m.id === req.user.id && !m.deleted_at),
    });
  });
  write(
    app,
    "post",
    "/api/conversations/:id/messages",
    z.object({ body: text, file_id: uuid.optional(), idempotency_key: key }),
    async (db, u, b, req) => {
      const conversation = await conversationAccess(db, u, req.params.id);
      if (u.role === "admin" && conversation.kind === "support")
        await db.query(
          "INSERT INTO conversation_members(conversation_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [req.params.id, u.id],
        );
      check(
        await one(
          db,
          "SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2",
          [req.params.id, u.id],
        ),
        "La supervisión solo permite consultar este chat",
        403,
      );
      check(
        b.body.trim() || b.file_id,
        "Escribe un mensaje o adjunta un archivo",
      );
      return sendMessage(db, u, req.params.id, b);
    },
  );
  write(
    app,
    "post",
    "/api/conversations/:id/read",
    z.object({}),
    async (db, u, b, req) => {
      await conversationAccess(db, u, req.params.id);
      await db.query(
        "UPDATE conversation_members SET read_at=now() WHERE conversation_id=$1 AND user_id=$2",
        [req.params.id, u.id],
      );
      await db.query(
        "UPDATE notifications SET read_at=now() WHERE user_id=$1 AND subject_id=$2",
        [u.id, req.params.id],
      );
    },
  );
  app.post("/api/files", upload.single("file"), async (req, res) => {
    check(req.file, "Selecciona un archivo");
    const f = req.file;
    check(f.size > 0, "El archivo está vacío");
    const type = await fileTypeFromBuffer(f.buffer);
    let mime = type?.mime;
    if (
      !mime &&
      f.mimetype === "text/plain" &&
      !f.buffer.includes(0) &&
      !new TextDecoder("utf-8", { fatal: false })
        .decode(f.buffer)
        .includes("\uFFFD")
    )
      mime = "text/plain";
    check(
      allowed.has(mime) || mime === "text/plain",
      "Formato no permitido. Usa imágenes, audio, PDF, ZIP, Office o texto",
    );
    const saved = await tx(async (db) => {
      check(
        await one(
          db,
          "SELECT 1 FROM users WHERE id=$1 AND deleted_at IS NULL",
          [req.user.id],
        ),
        "Cuenta retirada",
        401,
      );
      return one(
        db,
        "INSERT INTO files(group_id,uploader_id,name,mime,size,data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,mime,size",
        [
          req.user.group_id,
          req.user.id,
          f.originalname.replace(/[\r\n]/g, "").slice(0, 200),
          mime,
          f.size,
          f.buffer,
        ],
      );
    }, "polacos-writes");
    res.json(saved);
  });
  app.get("/api/files/:id", async (req, res) => {
    const f = await one(
      pool,
      "SELECT f.* FROM files f WHERE f.id=$1 AND NOT EXISTS(SELECT 1 FROM groups g WHERE g.logo_id=f.id)",
      [req.params.id],
    );
    check(f, "Archivo no disponible", 404);
    let access = req.user.role === "admin";
    if (!access) {
      access = !!(await one(
        pool,
        "SELECT 1 FROM products WHERE image_id=$1 AND group_id=$2 AND deleted_at IS NULL",
        [f.id, req.user.group_id],
      ));
      if (!access) {
        const clients = (
          await pool.query(
            "SELECT * FROM clients WHERE photo_id=$1 AND deleted_at IS NULL",
            [f.id],
          )
        ).rows;
        for (const c of clients)
          if (await canClient(pool, req.user, c)) access = true;
      }
      if (!access)
        access = !!(await one(
          pool,
          "SELECT 1 FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id WHERE m.file_id=$1 AND cm.user_id=$2",
          [f.id, req.user.id],
        ));
    }
    if (!access && f.uploader_id === req.user.id)
      access = !!(await one(
        pool,
        "SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM clients WHERE photo_id=$1) AND NOT EXISTS(SELECT 1 FROM products WHERE image_id=$1) AND NOT EXISTS(SELECT 1 FROM groups WHERE logo_id=$1) AND NOT EXISTS(SELECT 1 FROM messages WHERE file_id=$1)",
        [f.id],
      ));
    check(access, "No tienes acceso a este archivo", 403);
    res
      .set({
        "Content-Type": f.mime,
        "Content-Length": f.size,
        "Content-Disposition": `${/^(image|audio|video)\//.test(f.mime) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      })
      .send(f.data);
  });
  app.get("/api/notifications", async (req, res) => {
    res.json(
      list(
        (
          await pool.query(
            "SELECT * FROM notifications WHERE user_id=$1 AND ($2='all' OR ($2='unread' AND read_at IS NULL) OR ($2='read' AND read_at IS NOT NULL)) ORDER BY created_at DESC",
            [
              req.user.id,
              ["read", "unread"].includes(req.query.status)
                ? req.query.status
                : "all",
            ],
          )
        ).rows,
        req,
      ),
    );
  });
  write(
    app,
    "post",
    "/api/notifications/read",
    z.object({ id: uuid.optional() }),
    async (db, u, b) => {
      await db.query(
        "UPDATE notifications SET read_at=now() WHERE user_id=$1 AND ($2::uuid IS NULL OR id=$2)",
        [u.id, b.id || null],
      );
    },
  );
}
async function sendMessage(db, u, id, b) {
  const old = await one(
    db,
    "SELECT * FROM messages WHERE sender_id=$1 AND idempotency_key=$2",
    [u.id, b.idempotency_key],
  );
  if (old) {
    check(
      old.conversation_id === id &&
        old.body === (b.body || "") &&
        old.file_id === (b.file_id || null),
      "Clave ya utilizada para otro mensaje",
      409,
    );
    return old;
  }
  await ownFile(db, u, b.file_id);
  const m = await one(
    db,
    "INSERT INTO messages(conversation_id,sender_id,body,file_id,idempotency_key) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [id, u.id, b.body || "", b.file_id || null, b.idempotency_key],
  );
  if (u.role !== "admin") {
    const reopened = await one(
      db,
      "UPDATE conversations SET support_status='open' WHERE id=$1 AND kind='support' AND support_status='resolved' RETURNING group_id",
      [id],
    );
    if (reopened)
      await audit(
        db,
        { ...u, group_id: reopened.group_id },
        "conversation",
        id,
        "Reabrir soporte por nuevo mensaje",
        { support_status: "resolved" },
        { support_status: "open" },
      );
  }
  const members = (
    await db.query(
      "SELECT cm.user_id FROM conversation_members cm JOIN users u ON u.id=cm.user_id WHERE cm.conversation_id=$1 AND cm.user_id<>$2 AND u.deleted_at IS NULL",
      [id, u.id],
    )
  ).rows;
  for (const member of members)
    await notify(
      db,
      member.user_id,
      "Mensaje de " + u.name,
      b.body?.slice(0, 150) || "Archivo adjunto",
      `/chats/${id}`,
      id,
      `message:${m.id}`,
    );
  return m;
}
