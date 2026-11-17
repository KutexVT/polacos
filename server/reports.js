import { pool, one, check } from "./db.js";
import { visiblePurchases, visibleClients } from "./access.js";
import { paymentRows } from "./routes.js";
import { ledger, today, date } from "./money.js";
export function reportRoutes(app) {
  app.get("/api/reports", async (req, res) => {
    const u = req.user,
      gid = u.role === "admin" ? req.query.group_id || null : u.group_id;
    const from = req.query.from ? date(req.query.from) : "0001-01-01",
      to = req.query.to ? date(req.query.to) : "9999-12-31";
    check(from <= to, "El rango de fechas está invertido");
    let ps = await visiblePurchases(pool, u, gid);
    if (u.role === "polaco" || req.query.scope === "mine")
      ps = ps.filter((p) => p.owner_id === u.id);
    else if (req.query.owner_id)
      ps = ps.filter((p) => p.owner_id === req.query.owner_id);
    const clients = await visibleClients(pool, u, gid);
    const inDate = (d) => d >= from && d <= to;
    const sold = ps.filter(
      (p) =>
        ["active", "paid"].includes(p.status) &&
        inDate(today(new Date(p.created_at))),
    );
    let confirmed = 0,
      collected = 0,
      balance = 0,
      overdue = 0,
      paid_count = 0,
      partial_count = 0,
      overdue_count = 0;
    const calendar = [],
      evolution = {},
      workers = {},
      groups = {};
    for (const p of sold) {
      const payments = await paymentRows(pool, p.id),
        l = ledger(p, payments);
      confirmed += l.total;
      balance += l.balance;
      overdue += l.overdue;
      paid_count += l.schedule.filter(
        (r) => r.status === "paid" && r.amount > 0,
      ).length;
      partial_count += l.schedule.filter(
        (r) => r.paid > 0 && r.remaining > 0,
      ).length;
      overdue_count += l.schedule.filter((r) => r.status === "overdue").length;
      let cash = 0;
      for (const payment of payments.filter(
        (x) => !x.voided && inDate(x.paid_on),
      )) {
        cash += payment.amount;
        evolution[payment.paid_on] =
          (evolution[payment.paid_on] || 0) + payment.amount;
      }
      collected += cash;
      for (const r of l.schedule.filter((r) => r.remaining > 0))
        calendar.push({
          ...r,
          purchase_id: p.id,
          client_id: p.client_id,
          client_name: p.client_name,
          product_name: p.product_name,
          owner_id: p.owner_id,
        });
      for (const [map, id] of [
        [workers, p.owner_id],
        [groups, p.group_id],
      ]) {
        map[id] ||= { id, sold: 0, collected: 0, balance: 0, overdue: 0 };
        map[id].sold += l.total;
        map[id].collected += cash;
        map[id].balance += l.balance;
        map[id].overdue += l.overdue;
      }
    }
    // Payment dates are independent of sale dates. Cancellation keeps actual receipts.
    for (const p of ps.filter(
      (p) => p.had_assignment && !sold.some((sale) => sale.id === p.id),
    )) {
      const cash = (await paymentRows(pool, p.id)).filter(
        (x) => !x.voided && inDate(x.paid_on),
      );
      for (const payment of cash) {
        collected += payment.amount;
        evolution[payment.paid_on] =
          (evolution[payment.paid_on] || 0) + payment.amount;
        for (const [map, id] of [
          [workers, p.owner_id],
          [groups, p.group_id],
        ]) {
          map[id] ||= { id, sold: 0, collected: 0, balance: 0, overdue: 0 };
          map[id].collected += payment.amount;
        }
      }
    }
    const users = (
      await pool.query(
        "SELECT id,name,role,group_id FROM users WHERE deleted_at IS NULL AND ($1::uuid IS NULL OR group_id=$1)",
        [gid],
      )
    ).rows;
    const groupRows = (
      await pool.query(
        `SELECT id,polaco_limit${u.role === "admin" ? ",name" : ""} FROM groups WHERE $1::uuid IS NULL OR id=$1`,
        [gid],
      )
    ).rows;
    const products = (
      await pool.query(
        "SELECT available,reserved,assigned FROM products WHERE deleted_at IS NULL AND ($1::uuid IS NULL OR group_id=$1)",
        [gid],
      )
    ).rows;
    const requests = { pending: 0, approved: 0, rejected: 0 };
    const ids = ps.map((p) => p.id);
    if (ids.length)
      for (const r of (
        await pool.query(
          "SELECT status,count(*)::int n FROM price_requests WHERE purchase_id=ANY($1::uuid[]) GROUP BY status",
          [ids],
        )
      ).rows)
        if (r.status in requests) requests[r.status] = r.n;
    const ownClients = clients.filter((c) =>
      u.role === "polaco" || req.query.scope === "mine"
        ? c.owner_id === u.id
        : !req.query.owner_id || c.owner_id === req.query.owner_id,
    );
    const data = {
      as_of: today(),
      clients: ownClients.length,
      purchases: sold.length,
      confirmed,
      collected,
      balance,
      overdue,
      paid_count,
      partial_count,
      overdue_count,
      calendar: calendar.sort((a, b) => a.due.localeCompare(b.due)),
      evolution: Object.entries(evolution)
        .sort()
        .map(([date, amount]) => ({ date, amount })),
      inventory: products.reduce(
        (s, p) => ({
          available: s.available + p.available,
          reserved: s.reserved + p.reserved,
          assigned: s.assigned + p.assigned,
        }),
        { available: 0, reserved: 0, assigned: 0 },
      ),
      requests,
    };
    if (u.role !== "polaco") {
      data.workers = users
        .filter((x) => x.role !== "admin")
        .map((x) => ({
          id: x.id,
          name: x.name,
          role: x.role,
          group_id: x.group_id,
          sold: 0,
          collected: 0,
          balance: 0,
          overdue: 0,
          ...workers[x.id],
        }));
      data.slots = groupRows.map((g) => ({
        ...g,
        used: users.filter((x) => x.group_id === g.id && x.role === "polaco")
          .length,
      }));
      data.users = users.length;
    }
    if (u.role === "admin") {
      data.groups = groupRows.map((g) => ({
        id: g.id,
        name: g.name,
        sold: 0,
        collected: 0,
        balance: 0,
        overdue: 0,
        ...groups[g.id],
      }));
      data.messages = (
        await one(
          pool,
          "SELECT count(*)::int n FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE ($1::uuid IS NULL OR c.group_id=$1)",
          [gid],
        )
      ).n;
      data.support = (
        await one(
          pool,
          "SELECT count(*)::int n FROM conversations WHERE kind='support' AND ($1::uuid IS NULL OR group_id=$1)",
          [gid],
        )
      ).n;
    }
    res.json(data);
  });
}
