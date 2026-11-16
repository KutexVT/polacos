// Only IDs from this run's isolated group are removed, including admin-side notices.
export async function cleanupGroup(db, id) {
  const { rows } = await db.query(
    `SELECT id FROM groups WHERE id=$1
    UNION SELECT id FROM users WHERE group_id=$1
    UNION SELECT id FROM clients WHERE group_id=$1
    UNION SELECT id FROM purchases WHERE group_id=$1
    UNION SELECT id FROM products WHERE group_id=$1
    UNION SELECT id FROM access_grants WHERE group_id=$1
    UNION SELECT id FROM conversations WHERE group_id=$1
    UNION SELECT p.id FROM payments p JOIN purchases s ON s.id=p.purchase_id WHERE s.group_id=$1
    UNION SELECT r.id FROM price_requests r JOIN purchases s ON s.id=r.purchase_id WHERE s.group_id=$1`,
    [id],
  );
  const ids = rows.map((r) => r.id);
  await db.query("DELETE FROM notifications WHERE subject_id=ANY($1::uuid[])", [
    ids,
  ]);
  await db.query("DELETE FROM audit WHERE entity_id=ANY($1::uuid[])", [ids]);
  await db.query(
    "DELETE FROM files WHERE id IN (SELECT logo_id FROM groups WHERE id=$1)",
    [id],
  );
  await db.query("DELETE FROM groups WHERE id=$1", [id]);
}
