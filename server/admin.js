import { pool, one, check } from "./db.js";
import { z, uuid } from "./validate.js";
const zone = "America/Costa_Rica";
export function adminRoutes(app) {
  app.use("/api/admin", (req, res, next) => {
    check(req.user.role === "admin", "Solo para el administrador", 403);
    next();
  });
  app.get("/api/admin/overview", async (req, res) => {
    const gid = req.query.group_id ? uuid.parse(req.query.group_id) : null;
    const days = Number(
      z.enum(["7", "30", "90"]).default("30").parse(req.query.days),
    );
    if (gid)
      check(
        await one(pool, "SELECT 1 FROM groups WHERE id=$1", [gid]),
        "Grupo no disponible",
        404,
      );
    const counts = await one(
      pool,
      `SELECT
   (SELECT count(*)::int FROM groups WHERE $1::uuid IS NULL OR id=$1) AS groups,
   (SELECT count(*)::int FROM users WHERE role<>'admin' AND deleted_at IS NULL AND ($1::uuid IS NULL OR group_id=$1)) AS users,
   (SELECT count(*)::int FROM users WHERE role='owner' AND deleted_at IS NULL AND ($1::uuid IS NULL OR group_id=$1)) AS owners,
   (SELECT count(*)::int FROM users WHERE role='polaco' AND deleted_at IS NULL AND ($1::uuid IS NULL OR group_id=$1)) AS workers,
   (SELECT count(*)::int FROM clients WHERE deleted_at IS NULL AND ($1::uuid IS NULL OR group_id=$1)) AS clients,
   (SELECT count(*)::int FROM products WHERE deleted_at IS NULL AND ($1::uuid IS NULL OR group_id=$1)) AS products,
   (SELECT count(*)::int FROM purchases p JOIN clients c ON c.id=p.client_id WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL AND ($1::uuid IS NULL OR p.group_id=$1)) AS purchases,
   (SELECT count(*)::int FROM payments p JOIN purchases s ON s.id=p.purchase_id WHERE NOT p.voided AND ($1::uuid IS NULL OR s.group_id=$1)) AS payments,
   (SELECT count(*)::int FROM cash_closings WHERE $1::uuid IS NULL OR group_id=$1) AS closings,
   (SELECT count(*)::int FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.kind<>'support' AND NOT EXISTS(SELECT 1 FROM conversation_members cm JOIN users u ON u.id=cm.user_id WHERE cm.conversation_id=c.id AND u.role='admin') AND ($1::uuid IS NULL OR c.group_id=$1)) AS messages,
   (SELECT count(DISTINCT d.user_id)::int FROM platform_usage_daily d JOIN users u ON u.id=d.user_id WHERE u.deleted_at IS NULL AND d.last_seen_at>clock_timestamp()-interval '15 minutes' AND ($1::uuid IS NULL OR d.group_id=$1)) AS active_now,
   (SELECT count(DISTINCT d.user_id)::int FROM platform_usage_daily d JOIN users u ON u.id=d.user_id WHERE u.deleted_at IS NULL AND d.day>=(clock_timestamp() AT TIME ZONE $3)::date-($2::int-1) AND ($1::uuid IS NULL OR d.group_id=$1)) AS active_period,
   (SELECT count(*)::int FROM users WHERE role<>'admin' AND deleted_at IS NULL AND created_at>=(((clock_timestamp() AT TIME ZONE $3)::date-($2::int-1))::timestamp AT TIME ZONE $3) AND ($1::uuid IS NULL OR group_id=$1)) AS new_users,
   (SELECT count(*)::int FROM audit WHERE entity_type NOT IN ('conversation','admin_note') AND created_at>=(((clock_timestamp() AT TIME ZONE $3)::date-($2::int-1))::timestamp AT TIME ZONE $3) AND ($1::uuid IS NULL OR group_id=$1)) AS operations,
   (SELECT applied_at FROM schema_migrations WHERE name='005_platform_usage.sql') AS tracking_started`,
      [gid, days, zone],
    );
    const timeline = (
      await pool.query(
        `WITH dates AS (SELECT generate_series((clock_timestamp() AT TIME ZONE $3)::date-($2::int-1),(clock_timestamp() AT TIME ZONE $3)::date,interval '1 day')::date AS day),
   visits AS (SELECT d.day,count(*)::int AS users FROM platform_usage_daily d JOIN users u ON u.id=d.user_id WHERE u.deleted_at IS NULL AND d.day>=(clock_timestamp() AT TIME ZONE $3)::date-($2::int-1) AND ($1::uuid IS NULL OR d.group_id=$1) GROUP BY d.day),
   actions AS (SELECT (created_at AT TIME ZONE $3)::date AS day,count(*)::int AS operations FROM audit WHERE entity_type NOT IN ('conversation','admin_note') AND created_at>=(((clock_timestamp() AT TIME ZONE $3)::date-($2::int-1))::timestamp AT TIME ZONE $3) AND ($1::uuid IS NULL OR group_id=$1) GROUP BY 1)
   SELECT dates.day,CASE WHEN dates.day<($4::timestamptz AT TIME ZONE $3)::date THEN NULL ELSE COALESCE(visits.users,0) END AS users,COALESCE(actions.operations,0) AS operations
   FROM dates LEFT JOIN visits USING(day) LEFT JOIN actions USING(day) ORDER BY dates.day`,
        [gid, days, zone, counts.tracking_started],
      )
    ).rows;
    const groups = (
      await pool.query(
        `SELECT g.id,g.name,g.polaco_limit,
   (SELECT count(*)::int FROM users u WHERE u.group_id=g.id AND u.deleted_at IS NULL) AS users,
   (SELECT count(DISTINCT d.user_id)::int FROM platform_usage_daily d JOIN users u ON u.id=d.user_id WHERE d.group_id=g.id AND u.deleted_at IS NULL AND d.day>=(clock_timestamp() AT TIME ZONE $3)::date-($2::int-1)) AS active,
   (SELECT count(*)::int FROM audit a WHERE a.group_id=g.id AND a.entity_type NOT IN ('conversation','admin_note') AND a.created_at>=(((clock_timestamp() AT TIME ZONE $3)::date-($2::int-1))::timestamp AT TIME ZONE $3)) AS operations
   FROM groups g WHERE $1::uuid IS NULL OR g.id=$1 ORDER BY operations DESC,g.name,g.id LIMIT 10`,
        [gid, days, zone],
      )
    ).rows;
    res.json({ ...counts, days, timeline, group_activity: groups });
  });
  app.get("/api/admin/groups/:id", async (req, res) => {
    const g = await one(
      pool,
      `SELECT g.id,g.name,g.polaco_limit,g.created_at,(SELECT count(*)::int FROM users WHERE group_id=g.id AND deleted_at IS NULL) AS users FROM groups g WHERE id=$1`,
      [uuid.parse(req.params.id)],
    );
    check(g, "Grupo no disponible", 404);
    res.json(g);
  });
}
// Platform administrators manage accounts and groups. Business records and conversations
// remain with their owners; obsolete admin pages cannot recover those operations by URL.
export function adminAccess(req, res, next) {
  if (req.user.role !== "admin") return next();
  const path = req.path;
  const allowed =
    path === "/events" ||
    path === "/me" ||
    path === "/groups" ||
    /^\/groups\/[^/]+$/.test(path) ||
    path === "/users" ||
    /^\/users\/[^/]+$/.test(path) ||
    path === "/directory" ||
    path === "/admin/overview" ||
    /^\/admin\/groups\/[^/]+$/.test(path) ||
    /^\/trash\/user\/[^/]+(?:\/(?:restore|purge))?$/.test(path);
  check(
    allowed,
    "El administrador solo consulta estadísticas y administra grupos y usuarios",
    403,
  );
  next();
}
