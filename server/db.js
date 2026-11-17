import pg from "pg";
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1082, (value) => value);
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,
});
export async function tx(fn, groupId) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    if (groupId)
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        groupId,
      ]);
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function one(db, sql, args = []) {
  return (await db.query(sql, args)).rows[0];
}
export function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
export function check(value, message, status = 400) {
  if (!value) fail(message, status);
}
export async function audit(
  db,
  user,
  type,
  id,
  action,
  before = null,
  after = null,
) {
  let groupId = user.group_id || before?.group_id || after?.group_id;
  if (!groupId) {
    const table = {
      client: "clients",
      purchase: "purchases",
      product: "products",
      user: "users",
      access: "access_grants",
      conversation: "conversations",
    }[type];
    if (type === "group") groupId = id;
    else if (table)
      groupId = (
        await one(db, `SELECT group_id FROM ${table} WHERE id=$1`, [id])
      )?.group_id;
  }
  await db.query(
    "INSERT INTO audit(group_id,actor_id,entity_type,entity_id,action,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [groupId || null, user.id, type, id, action, before, after],
  );
}
export async function notify(db, userId, title, body, path, subject, dedupe) {
  const inserted = await db.query(
    "INSERT INTO notifications(user_id,title,body,path,subject_id,dedupe) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
    [userId, title, body, path, subject, dedupe],
  );
  if (inserted.rowCount)
    await db.query("SELECT pg_notify('polacos',$1)", [userId]);
}
