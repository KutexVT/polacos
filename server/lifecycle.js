import { pool, tx, one, check, audit, notify } from "./db.js";
import { write, list, cancelPending, stock, paymentRows } from "./routes.js";
import { getClient, getPurchase, manager, activeUser } from "./access.js";
import { z, uuid } from "./validate.js";
import { ledger, today } from "./money.js";
const tables = {
  user: "users",
  client: "clients",
  purchase: "purchases",
  product: "products",
};
async function trashPurchase(db, u, p, batch) {
  await cancelPending(db, u, p);
  await db.query(
    "UPDATE purchases SET deleted_at=now(),deleted_by=$2,deleted_batch=$3 WHERE id=$1",
    [p.id, u.id, batch],
  );
  await db.query("DELETE FROM notifications WHERE subject_id=$1", [p.id]);
}
async function trashClient(db, u, c, batch) {
  await db.query(
    "UPDATE clients SET deleted_at=now(),deleted_by=$2,deleted_batch=$3 WHERE id=$1",
    [c.id, u.id, batch],
  );
  for (const p of (
    await db.query(
      "SELECT * FROM purchases WHERE client_id=$1 AND deleted_at IS NULL",
      [c.id],
    )
  ).rows)
    await trashPurchase(db, u, p, batch);
  await db.query(
    "UPDATE access_grants SET status='revoked' WHERE target_id=$1",
    [c.owner_id],
  );
}
async function restorePurchase(db, u, p) {
  const c = await one(
    db,
    "SELECT * FROM clients WHERE id=$1 AND deleted_at IS NULL",
    [p.client_id],
  );
  check(c, "Restaura primero al cliente");
  check(
    Date.now() - new Date(p.deleted_at).getTime() < 30 * 86400000,
    "El plazo de restauración terminó",
  );
  let status = p.status;
  if (!p.had_assignment) {
    await stock(db, u, p, "reserve");
    status = "decision";
  } else if (p.status !== "cancelled")
    status = ledger(p, await paymentRows(db, p.id)).balance ? "active" : "paid";
  await db.query(
    "UPDATE purchases SET deleted_at=NULL,deleted_by=NULL,deleted_batch=NULL,status=$2 WHERE id=$1",
    [p.id, status],
  );
}
async function restoreClient(db, u, c) {
  await activeUser(db, c.owner_id, c.group_id);
  check(
    Date.now() - new Date(c.deleted_at).getTime() < 30 * 86400000,
    "El plazo de restauración terminó",
  );
  await db.query(
    "UPDATE clients SET deleted_at=NULL,deleted_by=NULL,deleted_batch=NULL WHERE id=$1",
    [c.id],
  );
  for (const p of (
    await db.query(
      "SELECT * FROM purchases WHERE client_id=$1 AND deleted_at IS NOT NULL AND deleted_batch=$2",
      [c.id, c.deleted_batch],
    )
  ).rows)
    await restorePurchase(db, u, p);
}
export function lifecycleRoutes(app) {
  write(
    app,
    "post",
    "/api/users/:id/retire",
    z.object({
      mode: z.enum(["transfer", "trash"]),
      owner_id: uuid.optional(),
    }),
    async (db, u, b, req) => {
      const target = await one(
        db,
        "SELECT * FROM users WHERE id=$1 AND role='polaco' AND deleted_at IS NULL",
        [req.params.id],
      );
      check(target, "Polaco no disponible", 404);
      manager(u, target.group_id);
      check(target.id !== b.owner_id, "Elige otro responsable");
      if (b.mode === "transfer")
        await activeUser(db, b.owner_id, target.group_id);
      for (const c of (
        await db.query(
          "SELECT * FROM clients WHERE owner_id=$1 AND deleted_at IS NULL",
          [target.id],
        )
      ).rows) {
        if (b.mode === "transfer") {
          await db.query("UPDATE clients SET owner_id=$2 WHERE id=$1", [
            c.id,
            b.owner_id,
          ]);
          await db.query(
            "DELETE FROM notifications WHERE subject_id=$1 OR subject_id IN (SELECT id FROM purchases WHERE client_id=$1)",
            [c.id],
          );
          await audit(
            db,
            u,
            "client",
            c.id,
            "Transferir al retirar usuario",
            { owner_id: target.id },
            { owner_id: b.owner_id },
          );
        } else await trashClient(db, u, c, target.id);
      }
      await db.query(
        "UPDATE price_requests r SET requester_id=c.owner_id FROM purchases p JOIN clients c ON c.id=p.client_id WHERE r.purchase_id=p.id AND r.requester_id=$1 AND r.status='pending'",
        [target.id],
      );
      await db.query(
        "UPDATE users SET deleted_at=now(),deleted_by=$2 WHERE id=$1",
        [target.id, u.id],
      );
      await db.query("DELETE FROM sessions WHERE user_id=$1", [target.id]);
      await db.query(
        "UPDATE access_grants SET status='revoked' WHERE requester_id=$1 OR target_id=$1",
        [target.id],
      );
      await db.query("DELETE FROM notifications WHERE user_id=$1", [target.id]);
      await audit(db, u, "user", target.id, "Retirar polaco", null, {
        mode: b.mode,
        owner_id: b.owner_id,
      });
    },
  );
  write(
    app,
    "post",
    "/api/trash/:type/:id",
    z.object({}),
    async (db, u, b, req) => {
      const type = req.params.type;
      check(["client", "purchase", "product"].includes(type), "Tipo inválido");
      let item;
      if (type === "client") item = await getClient(db, u, req.params.id, true);
      if (type === "purchase")
        item = await getPurchase(db, u, req.params.id, true);
      if (type === "product") {
        item = await one(
          db,
          "SELECT * FROM products WHERE id=$1 AND deleted_at IS NULL",
          [req.params.id],
        );
        check(item, "Producto no disponible", 404);
        manager(u, item.group_id);
        check(
          item.reserved === 0,
          "Resuelve las reservas antes de retirar el producto",
        );
      }
      if (type === "client") await trashClient(db, u, item, item.id);
      else if (type === "purchase") await trashPurchase(db, u, item, item.id);
      else
        await db.query(
          "UPDATE products SET deleted_at=now(),deleted_by=$2 WHERE id=$1",
          [item.id, u.id],
        );
      await audit(db, u, type, item.id, "Enviar a papelera");
    },
  );
  app.get("/api/trash", async (req, res) => {
    check(req.user.role !== "polaco", "Papelera disponible para el dueño", 403);
    const gid =
      req.user.role === "admin"
        ? req.query.group_id || null
        : req.user.group_id;
    const rows = [];
    for (const [type, table] of Object.entries(tables)) {
      const data = (
        await pool.query(
          `SELECT t.*,u.name AS deleted_by_name FROM ${table} t LEFT JOIN users u ON u.id=t.deleted_by WHERE t.deleted_at IS NOT NULL AND ($1::uuid IS NULL OR t.group_id=$1) ORDER BY t.deleted_at DESC`,
          [gid],
        )
      ).rows;
      rows.push(
        ...data.map(({ password_hash, ...r }) => ({
          id: r.id,
          type,
          name: r.name || r.product_name,
          deleted_at: r.deleted_at,
          deleted_by_name: r.deleted_by_name,
          group_id: r.group_id,
          days_remaining: Math.max(
            0,
            Math.ceil(
              (new Date(r.deleted_at).getTime() + 30 * 86400000 - Date.now()) /
                86400000,
            ),
          ),
        })),
      );
    }
    res.json(list(rows, req));
  });
  write(
    app,
    "post",
    "/api/trash/:type/:id/restore",
    z.object({}),
    async (db, u, b, req) => {
      const table = tables[req.params.type];
      check(table, "Tipo inválido");
      const item = await one(
        db,
        `SELECT * FROM ${table} WHERE id=$1 AND deleted_at IS NOT NULL`,
        [req.params.id],
      );
      check(item, "Registro no disponible", 404);
      manager(u, item.group_id);
      check(
        Date.now() - new Date(item.deleted_at).getTime() < 30 * 86400000,
        "El plazo de restauración terminó",
      );
      if (req.params.type === "user") {
        const g = await one(db, "SELECT * FROM groups WHERE id=$1", [
          item.group_id,
        ]);
        const used = await one(
          db,
          "SELECT count(*)::int n FROM users WHERE group_id=$1 AND role='polaco' AND deleted_at IS NULL",
          [item.group_id],
        );
        check(
          used.n < g.polaco_limit,
          `Tu cuenta permite hasta ${g.polaco_limit} polacos y ya alcanzaste ese límite`,
          409,
        );
        await db.query(
          "UPDATE users SET deleted_at=NULL,deleted_by=NULL WHERE id=$1",
          [item.id],
        );
        for (const c of (
          await db.query(
            "SELECT * FROM clients WHERE owner_id=$1 AND deleted_batch=$1 AND deleted_at IS NOT NULL",
            [item.id],
          )
        ).rows)
          await restoreClient(db, u, c);
      } else if (req.params.type === "client") await restoreClient(db, u, item);
      else if (req.params.type === "purchase")
        await restorePurchase(db, u, item);
      else
        await db.query(
          "UPDATE products SET deleted_at=NULL,deleted_by=NULL WHERE id=$1",
          [item.id],
        );
      await audit(db, u, req.params.type, item.id, "Restaurar");
    },
  );
  write(
    app,
    "post",
    "/api/trash/:type/:id/purge",
    z.object({ confirm: z.literal("ELIMINAR") }),
    async (db, u, b, req) => {
      const table = tables[req.params.type];
      check(table, "Tipo inválido");
      const item = await one(
        db,
        `SELECT * FROM ${table} WHERE id=$1 AND deleted_at IS NOT NULL`,
        [req.params.id],
      );
      check(item, "Registro no disponible", 404);
      manager(u, item.group_id);
      await purge(db, req.params.type, item);
    },
  );
}
async function clearReferences(db, id) {
  await db.query("DELETE FROM audit WHERE entity_id=$1", [id]);
  await db.query("DELETE FROM notifications WHERE subject_id=$1", [id]);
  await db.query(
    "UPDATE access_grants SET client_ids=client_ids-$1,purchase_ids=purchase_ids-$1 WHERE client_ids ? $1 OR purchase_ids ? $1",
    [id],
  );
}
async function deleteFileIfUnused(db, id) {
  if (!id) return;
  await db.query(
    "DELETE FROM files f WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM messages WHERE file_id=f.id) AND NOT EXISTS(SELECT 1 FROM clients WHERE photo_id=f.id) AND NOT EXISTS(SELECT 1 FROM products WHERE image_id=f.id) AND NOT EXISTS(SELECT 1 FROM groups WHERE logo_id=f.id)",
    [id],
  );
}
export async function purge(db, type, item) {
  if (type === "user") {
    // Transferred clients are deliberately excluded from this ownership query.
    for (const c of (
      await db.query("SELECT * FROM clients WHERE owner_id=$1", [item.id])
    ).rows)
      await purge(db, "client", c);
    const messages = (
      await db.query("SELECT id,file_id FROM messages WHERE sender_id=$1", [
        item.id,
      ])
    ).rows;
    for (const m of messages)
      await db.query("DELETE FROM notifications WHERE dedupe=$1", [
        `message:${m.id}`,
      ]);
    // Files belonging to surviving records are no longer personal uploads of this user.
    await db.query(
      "UPDATE files f SET uploader_id=NULL WHERE uploader_id=$1 AND (EXISTS(SELECT 1 FROM clients WHERE photo_id=f.id) OR EXISTS(SELECT 1 FROM products WHERE image_id=f.id) OR EXISTS(SELECT 1 FROM groups WHERE logo_id=f.id) OR EXISTS(SELECT 1 FROM messages WHERE file_id=f.id AND sender_id<>$1))",
      [item.id],
    );
    await db.query(
      "UPDATE conversations SET name='Conversación · usuario eliminado' WHERE kind IN ('direct','support') AND id IN (SELECT conversation_id FROM conversation_members WHERE user_id=$1)",
      [item.id],
    );
    await db.query(
      "DELETE FROM audit WHERE actor_id=$1 OR before_data::text LIKE '%'||$1::text||'%' OR after_data::text LIKE '%'||$1::text||'%'",
      [item.id],
    );
    await clearReferences(db, item.id);
    await db.query("DELETE FROM users WHERE id=$1", [item.id]);
    await db.query(
      "DELETE FROM conversations c WHERE NOT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id=c.id) AND NOT EXISTS(SELECT 1 FROM messages WHERE conversation_id=c.id)",
    );
  } else if (type === "client") {
    for (const p of (
      await db.query("SELECT * FROM purchases WHERE client_id=$1", [item.id])
    ).rows)
      await purge(db, "purchase", p);
    await clearReferences(db, item.id);
    await db.query("DELETE FROM clients WHERE id=$1", [item.id]);
    await deleteFileIfUnused(db, item.photo_id);
  } else if (type === "purchase") {
    if (["pending", "decision"].includes(item.status))
      await db.query(
        "UPDATE products SET reserved=reserved-$2,available=available+$2 WHERE id=$1",
        [item.product_id, item.quantity],
      );
    if (item.had_assignment)
      await db.query(
        "UPDATE products SET assigned=GREATEST(0,assigned-$2) WHERE id=$1",
        [item.product_id, item.quantity],
      );
    await db.query("DELETE FROM inventory_movements WHERE purchase_id=$1", [
      item.id,
    ]);
    await clearReferences(db, item.id);
    await db.query("DELETE FROM purchases WHERE id=$1", [item.id]);
  } else {
    check(item.reserved === 0, "Producto con reservas vigentes");
    await clearReferences(db, item.id);
    await db.query("DELETE FROM products WHERE id=$1", [item.id]);
    await deleteFileIfUnused(db, item.image_id);
  }
}
export async function runJobs(now = new Date(), groupId = null) {
  return tx(async (db) => {
    for (const [type, table] of Object.entries(tables))
      for (const item of (
        await db.query(
          `SELECT * FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at<=$1::timestamptz-interval '30 days' AND ($2::uuid IS NULL OR group_id=$2)`,
          [now, groupId],
        )
      ).rows)
        await purge(db, type, item);
    await db.query(
      "DELETE FROM sessions WHERE expires_at<$1 AND ($2::uuid IS NULL OR user_id IN (SELECT id FROM users WHERE group_id=$2))",
      [now, groupId],
    );
    await db.query("DELETE FROM login_attempts WHERE reset_at<now()");
    await db.query(
      "DELETE FROM files f WHERE created_at<$1::timestamptz-interval '1 day' AND ($2::uuid IS NULL OR f.group_id=$2) AND NOT EXISTS(SELECT 1 FROM messages WHERE file_id=f.id) AND NOT EXISTS(SELECT 1 FROM clients WHERE photo_id=f.id) AND NOT EXISTS(SELECT 1 FROM products WHERE image_id=f.id) AND NOT EXISTS(SELECT 1 FROM groups WHERE logo_id=f.id)",
      [now, groupId],
    );
    const asOf = today(now),
      soon = today(new Date(now.getTime() + 3 * 86400000));
    for (const p of (
      await db.query(
        "SELECT p.*,c.owner_id,c.name AS client_name FROM purchases p JOIN clients c ON c.id=p.client_id JOIN users u ON u.id=c.owner_id WHERE p.status='active' AND p.deleted_at IS NULL AND c.deleted_at IS NULL AND u.deleted_at IS NULL AND ($1::uuid IS NULL OR p.group_id=$1)",
        [groupId],
      )
    ).rows) {
      const l = ledger(p, await paymentRows(db, p.id), asOf);
      for (const r of l.schedule.filter(
        (r) => r.remaining > 0 && r.due <= soon,
      )) {
        const overdue = r.due < asOf;
        await notify(
          db,
          p.owner_id,
          overdue ? "Cuota atrasada" : "Próximo cobro",
          `${p.client_name} · ${r.due}`,
          `/purchases/${p.id}`,
          p.id,
          `due:${p.id}:${r.id}:${r.due}:${r.remaining}:${overdue ? "late" : "soon"}`,
        );
      }
    }
  }, "polacos-writes");
}
