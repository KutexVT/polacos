import { one, check } from "./db.js";
export function groupAccess(user, groupId) {
  check(
    user.role === "admin" || user.group_id === groupId,
    "No tienes acceso a este grupo",
    403,
  );
}
export function manager(user, groupId) {
  groupAccess(user, groupId);
  check(user.role !== "polaco", "Esta acción corresponde al dueño", 403);
}
export async function grants(db, user) {
  return (
    await db.query(
      "SELECT * FROM access_grants WHERE requester_id=$1 AND status='approved' AND expires_at>clock_timestamp()",
      [user.id],
    )
  ).rows;
}
export async function canClient(
  db,
  user,
  client,
  edit = false,
  purchaseId = null,
) {
  if (user.role === "admin") return true;
  if (user.group_id !== client.group_id) return false;
  if (user.role === "owner" || user.id === client.owner_id) return true;
  return (await grants(db, user)).some(
    (g) =>
      g.target_id === client.owner_id &&
      (!edit || g.permission === "edit") &&
      (g.all_clients ||
        g.client_ids.includes(client.id) ||
        (purchaseId && g.purchase_ids.includes(purchaseId))),
  );
}
export async function getClient(
  db,
  user,
  id,
  edit = false,
  includeDeleted = false,
) {
  const c = await one(db, "SELECT * FROM clients WHERE id=$1", [id]);
  check(c && (includeDeleted || !c.deleted_at), "Cliente no disponible", 404);
  check(
    await canClient(db, user, c, edit),
    "No tienes permiso sobre este cliente",
    403,
  );
  return c;
}
export async function getPurchase(
  db,
  user,
  id,
  edit = false,
  includeDeleted = false,
) {
  const p = await one(
    db,
    "SELECT p.*,c.owner_id,c.deleted_at AS client_deleted FROM purchases p JOIN clients c ON c.id=p.client_id WHERE p.id=$1",
    [id],
  );
  check(
    p && (includeDeleted || (!p.deleted_at && !p.client_deleted)),
    "Compra no disponible",
    404,
  );
  check(
    await canClient(
      db,
      user,
      { id: p.client_id, owner_id: p.owner_id, group_id: p.group_id },
      edit,
      p.id,
    ),
    "No tienes permiso sobre esta compra",
    403,
  );
  return p;
}
export async function visibleClients(db, user, groupId) {
  if (user.role === "admin")
    return (
      await db.query(
        "SELECT * FROM clients WHERE deleted_at IS NULL AND ($1::uuid IS NULL OR group_id=$1)",
        [groupId || null],
      )
    ).rows;
  const all = (
    await db.query(
      "SELECT * FROM clients WHERE group_id=$1 AND deleted_at IS NULL",
      [user.group_id],
    )
  ).rows;
  if (user.role === "owner") return all;
  const gg = await grants(db, user);
  return all.filter(
    (c) =>
      c.owner_id === user.id ||
      gg.some(
        (g) =>
          g.target_id === c.owner_id &&
          (g.all_clients || g.client_ids.includes(c.id)),
      ),
  );
}
export async function visiblePurchases(db, user, groupId) {
  const all = (
    await db.query(
      "SELECT p.*,c.name AS client_name,c.owner_id FROM purchases p JOIN clients c ON c.id=p.client_id WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL AND ($1::uuid IS NULL OR p.group_id=$1)",
      [user.role === "admin" ? groupId || null : user.group_id],
    )
  ).rows;
  if (user.role !== "polaco") return all;
  const gg = await grants(db, user);
  return all.filter(
    (p) =>
      p.owner_id === user.id ||
      gg.some(
        (g) =>
          g.target_id === p.owner_id &&
          (g.all_clients ||
            g.client_ids.includes(p.client_id) ||
            g.purchase_ids.includes(p.id)),
      ),
  );
}
export async function conversationAccess(db, user, id) {
  const c = await one(db, "SELECT * FROM conversations WHERE id=$1", [id]);
  check(c, "Conversación no disponible", 404);
  if (user.role !== "admin") {
    groupAccess(user, c.group_id);
    check(
      await one(
        db,
        "SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2",
        [id, user.id],
      ),
      "Esta conversación es privada",
      403,
    );
  }
  return c;
}
export async function activeUser(db, id, groupId) {
  const u = await one(
    db,
    "SELECT * FROM users WHERE id=$1 AND group_id=$2 AND deleted_at IS NULL",
    [id, groupId],
  );
  check(u, "Responsable no disponible en este grupo");
  return u;
}
export async function ownFile(db, user, id) {
  if (!id) return null;
  const f = await one(
    db,
    "SELECT id FROM files f WHERE id=$1 AND uploader_id=$2 AND NOT EXISTS(SELECT 1 FROM clients WHERE photo_id=f.id) AND NOT EXISTS(SELECT 1 FROM products WHERE image_id=f.id) AND NOT EXISTS(SELECT 1 FROM groups WHERE logo_id=f.id) AND NOT EXISTS(SELECT 1 FROM messages WHERE file_id=f.id)",
    [id, user.id],
  );
  check(f, "Adjunta un archivo nuevo para esta operación");
  return id;
}
