import { pool, one, check, audit } from "./db.js";
import { date } from "./money.js";
import { write } from "./routes.js";
import { z, uuid, name } from "./validate.js";
const admin = (u) =>
  check(u.role === "admin", "Solo para el administrador", 403);
const noteSchema = z.object({
  title: name,
  body: z.string().max(5000).default(""),
  group_id: uuid.nullable().default(null),
  conversation_id: uuid.nullable().default(null),
  pinned: z.boolean().default(false),
  done: z.boolean().default(false),
});
const paging = (req) => ({
  page: Math.max(1, parseInt(req.query.page) || 1),
  limit: 20,
});
const envelope = (rows, total, page) => ({
  items: rows,
  total,
  page,
  pages: Math.max(1, Math.ceil(total / 20)),
});
export function adminRoutes(app) {
  app.use("/api/admin", (req, res, next) => {
    admin(req.user);
    next();
  });
  app.get("/api/admin/overview", async (req, res) => {
    const gid = req.query.group_id || null;
    const counts = await one(
      pool,
      `SELECT (SELECT count(*)::int FROM groups WHERE $1::uuid IS NULL OR id=$1) AS groups,(SELECT count(*)::int FROM users WHERE deleted_at IS NULL AND role<>'admin' AND ($1::uuid IS NULL OR group_id=$1)) AS users,(SELECT count(*)::int FROM conversations WHERE kind='support' AND support_status<>'resolved' AND ($1::uuid IS NULL OR group_id=$1)) AS open_support,(SELECT count(*)::int FROM conversations c WHERE c.kind='support' AND c.support_status<>'resolved' AND ($1::uuid IS NULL OR c.group_id=$1) AND (SELECT u.role FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1)<>'admin') AS waiting_reply`,
      [gid],
    );
    const queue = (
      await pool.query(
        `SELECT c.id,c.name,c.group_id,c.support_status,g.name AS group_name,u.name AS creator_name,u.role AS creator_role,l.body AS last_body,l.created_at AS last_message_at,l.sender_role FROM conversations c LEFT JOIN groups g ON g.id=c.group_id LEFT JOIN users u ON u.id=c.created_by LEFT JOIN LATERAL(SELECT m.body,m.created_at,s.role AS sender_role FROM messages m JOIN users s ON s.id=m.sender_id WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) l ON true WHERE c.kind='support' AND c.support_status<>'resolved' AND ($1::uuid IS NULL OR c.group_id=$1) ORDER BY (l.sender_role<>'admin') DESC,l.created_at ASC NULLS LAST LIMIT 8`,
        [gid],
      )
    ).rows;
    res.json({ ...counts, queue });
  });
  app.get("/api/admin/groups/:id", async (req, res) => {
    const g = await one(
      pool,
      `SELECT g.id,g.name,g.polaco_limit,g.created_at,(SELECT count(*)::int FROM users WHERE group_id=g.id AND deleted_at IS NULL) AS users,(SELECT count(*)::int FROM clients WHERE group_id=g.id AND deleted_at IS NULL) AS clients,(SELECT count(*)::int FROM products WHERE group_id=g.id AND deleted_at IS NULL) AS products,(SELECT count(*)::int FROM conversations WHERE group_id=g.id AND kind='support' AND support_status<>'resolved') AS open_support FROM groups g WHERE id=$1`,
      [req.params.id],
    );
    check(g, "Grupo no disponible", 404);
    res.json(g);
  });
  app.get("/api/admin/activity", async (req, res) => {
    const { page, limit } = paging(req),
      args = [
        req.query.group_id || null,
        String(req.query.q || ""),
        req.query.from ? date(req.query.from) : null,
        req.query.to ? date(req.query.to) : null,
      ];
    check(
      !args[2] || !args[3] || args[2] <= args[3],
      "El rango de fechas está invertido",
    );
    const from = `FROM audit a JOIN users u ON u.id=a.actor_id LEFT JOIN groups g ON g.id=a.group_id WHERE ($1::uuid IS NULL OR a.group_id=$1) AND ($2='' OR concat_ws(' ',a.action,u.name,u.username,g.name,a.entity_type) ILIKE '%'||$2||'%') AND ($3::date IS NULL OR a.created_at>=($3::date::timestamp AT TIME ZONE 'America/Costa_Rica')) AND ($4::date IS NULL OR a.created_at<(($4::date+1)::timestamp AT TIME ZONE 'America/Costa_Rica'))`;
    const total = (await one(pool, `SELECT count(*)::int AS n ${from}`, args))
      .n;
    const rows = (
      await pool.query(
        `SELECT a.id,a.group_id,a.entity_type,a.entity_id,a.action,a.created_at,u.name AS actor_name,u.role AS actor_role,g.name AS group_name ${from} ORDER BY a.created_at DESC,a.id DESC LIMIT $5 OFFSET $6`,
        [...args, limit, (page - 1) * limit],
      )
    ).rows;
    res.json(envelope(rows, total, page));
  });
  app.get("/api/admin/notes", async (req, res) => {
    const { page, limit } = paging(req),
      args = [
        req.user.id,
        req.query.group_id || null,
        req.query.conversation_id || null,
        String(req.query.q || ""),
        req.query.status || "all",
      ];
    const from = `FROM admin_notes n LEFT JOIN groups g ON g.id=n.group_id LEFT JOIN conversations c ON c.id=n.conversation_id WHERE n.admin_id=$1 AND ($2::uuid IS NULL OR n.group_id=$2) AND ($3::uuid IS NULL OR n.conversation_id=$3) AND ($4='' OR concat_ws(' ',n.title,n.body,g.name) ILIKE '%'||$4||'%') AND ($5='all' OR ($5='open' AND NOT n.done) OR ($5='done' AND n.done))`;
    const total = (await one(pool, `SELECT count(*)::int AS n ${from}`, args))
      .n;
    const rows = (
      await pool.query(
        `SELECT n.*,g.name AS group_name,c.name AS conversation_name ${from} ORDER BY n.pinned DESC,n.updated_at DESC,n.id DESC LIMIT $6 OFFSET $7`,
        [...args, limit, (page - 1) * limit],
      )
    ).rows;
    res.json(envelope(rows, total, page));
  });
  for (const method of ["post", "patch"])
    write(
      app,
      method,
      "/api/admin/notes" + (method === "patch" ? "/:id" : ""),
      noteSchema,
      async (db, u, b, req) => {
        admin(u);
        if (b.group_id)
          check(
            await one(db, "SELECT id FROM groups WHERE id=$1", [b.group_id]),
            "Grupo no disponible",
            404,
          );
        if (b.conversation_id) {
          const c = await one(
            db,
            "SELECT group_id FROM conversations WHERE id=$1",
            [b.conversation_id],
          );
          check(c, "Conversación no disponible", 404);
          check(
            !b.group_id || b.group_id === c.group_id,
            "La conversación pertenece a otro grupo",
          );
          b.group_id = c.group_id;
        }
        const values = [
          u.id,
          b.group_id,
          b.conversation_id,
          b.title,
          b.body,
          b.pinned,
          b.done,
        ];
        const n = await one(
          db,
          method === "post"
            ? "INSERT INTO admin_notes(admin_id,group_id,conversation_id,title,body,pinned,done) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *"
            : "UPDATE admin_notes SET group_id=$2,conversation_id=$3,title=$4,body=$5,pinned=$6,done=$7,updated_at=now() WHERE admin_id=$1 AND id=$8 RETURNING *",
          method === "post" ? values : [...values, req.params.id],
        );
        check(n, "Nota no disponible", 404);
        return n;
      },
    );
  write(
    app,
    "delete",
    "/api/admin/notes/:id",
    z.object({}),
    async (db, u, b, req) => {
      admin(u);
      check(
        (
          await db.query(
            "DELETE FROM admin_notes WHERE id=$1 AND admin_id=$2",
            [req.params.id, u.id],
          )
        ).rowCount,
        "Nota no disponible",
        404,
      );
    },
  );
  write(
    app,
    "patch",
    "/api/admin/support/:id",
    z.object({ status: z.enum(["open", "in_progress", "resolved"]) }),
    async (db, u, b, req) => {
      admin(u);
      const c = await one(
        db,
        "SELECT * FROM conversations WHERE id=$1 AND kind='support'",
        [req.params.id],
      );
      check(c, "Caso no disponible", 404);
      const next = await one(
        db,
        "UPDATE conversations SET support_status=$2 WHERE id=$1 RETURNING *",
        [c.id, b.status],
      );
      if (c.support_status !== b.status)
        await audit(
          db,
          { ...u, group_id: c.group_id },
          "conversation",
          c.id,
          "Cambiar estado de soporte",
          { support_status: c.support_status },
          { support_status: b.status },
        );
      return next;
    },
  );
}
