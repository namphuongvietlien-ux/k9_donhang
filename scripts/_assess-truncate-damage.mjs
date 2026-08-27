/**
 * CHỈ ĐỌC — khoanh vùng thời điểm TRUNCATE để chọn mốc PITR.
 * Chạy: node scripts/_assess-truncate-damage.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
for (const f of [".env", ".env.local"]) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const hour = (iso) => (iso ? String(iso).slice(0, 13) : "?");

async function all(table, cols, orderCol) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(cols).order(orderCol, { ascending: true }).order("id", { ascending: true }).range(from, from + 999);
    if (error) { console.log(`${table}: ${error.message}`); return rows; }
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const prods = await all("products", "id, slug, name, created_at, is_new", "created_at");
console.log(`\n=== products: ${prods.length} dòng ===`);
console.log("min created_at:", prods[0]?.created_at, "| max:", prods[prods.length - 1]?.created_at);
console.log("is_new = true:", prods.filter((p) => p.is_new).length);
const byHour = new Map();
for (const p of prods) byHour.set(hour(p.created_at), (byHour.get(hour(p.created_at)) || 0) + 1);
console.log("Phân bố theo giờ (10 mốc cuối):");
for (const [h, n] of [...byHour.entries()].slice(-10)) console.log("  ", h, "→", n);

const ords = await all("orders", "id, order_code, order_kind, status, created_at", "created_at");
console.log(`\n=== orders: ${ords.length} dòng (order_items = 0) ===`);
console.log("min created_at:", ords[0]?.created_at, "| max:", ords[ords.length - 1]?.created_at);
const ordHour = new Map();
for (const o of ords) ordHour.set(hour(o.created_at), (ordHour.get(hour(o.created_at)) || 0) + 1);
console.log("Đơn theo giờ (8 mốc cuối):");
for (const [h, n] of [...ordHour.entries()].slice(-8)) console.log("  ", h, "→", n);
console.log("Đơn hôm nay 2026-08-22:", ords.filter((o) => String(o.created_at).startsWith("2026-08-22")).map((o) => `${o.order_code}@${String(o.created_at).slice(11, 16)}`).join(", ") || "(không có)");
