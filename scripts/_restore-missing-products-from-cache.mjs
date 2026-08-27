/**
 * Nạp bù các mã hàng được dòng hàng cứu được tham chiếu nhưng thiếu trong
 * danh mục hiện tại. Nguồn: query `shared-products-list` (6505 SP kèm uuid gốc)
 * trong file cache trình duyệt.
 *
 * Giữ nguyên uuid gốc để các bảng khác (stock_on_hand…) map lại được về sau.
 *
 *   node scripts/_restore-missing-products-from-cache.mjs           # dry-run
 *   node scripts/_restore-missing-products-from-cache.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const IMPORT_DIR = path.join(process.cwd(), "scripts", "import");

for (const f of [".env", ".env.local"]) {
  const p = path.join(process.cwd(), f);
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
const normCode = (v) => String(v ?? "").trim().normalize("NFC").toUpperCase();

// ---- 1. Đọc cache: mã hàng được dòng hàng tham chiếu + danh mục 6505 ----
const referenced = new Set();
const catalog = new Map(); // slug chuẩn hóa → row gốc
for (const f of fs.readdirSync(IMPORT_DIR).filter((x) => /^k9-cache.*\.json$/i.test(x))) {
  const j = JSON.parse(fs.readFileSync(path.join(IMPORT_DIR, f), "utf8"));
  for (const q of j) {
    const key = JSON.stringify(q.queryKey || "");
    if (key.includes("shared-products-list") && Array.isArray(q.data)) {
      for (const p of q.data) {
        const s = normCode(p.slug);
        if (s && !catalog.has(s)) catalog.set(s, p);
      }
    }
  }
  const visit = (v, d) => {
    if (!v || d > 8) return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, d + 1));
    if (typeof v !== "object") return;
    if (v.order_code && Array.isArray(v.order_items)) {
      for (const it of v.order_items) {
        const s = normCode(it.product_slug);
        if (s) referenced.add(s);
      }
    }
    for (const k in v) visit(v[k], d + 1);
  };
  visit(j, 0);
}
console.log(`Danh mục trong cache: ${catalog.size} mã | mã hàng được dòng hàng tham chiếu: ${referenced.size}`);

// ---- 2. Đối chiếu DB ----
const haveSlug = new Set();
const haveId = new Set();
for (let f = 0; ; f += 1000) {
  const { data, error } = await db.from("products").select("id, slug").order("id").range(f, f + 999);
  if (error) throw new Error(error.message);
  for (const p of data || []) { haveSlug.add(normCode(p.slug)); haveId.add(p.id); }
  if (!data || data.length < 1000) break;
}

const missing = [...referenced].filter((s) => !haveSlug.has(s));
const found = missing.filter((s) => catalog.has(s));
const notInCache = missing.filter((s) => !catalog.has(s));

const COLS = [
  "id", "name", "slug", "barcode", "unit", "unit_name", "unit_2", "barcode_2",
  "unit_2_ratio", "price_2", "price", "original_price", "category", "parent_sku",
  "cost_price", "stock_quantity", "is_active", "is_new", "is_out_stock", "is_locked", "created_at",
];
const payload = [];
const idClash = [];
for (const s of found) {
  const src = catalog.get(s);
  if (haveId.has(src.id)) { idClash.push(s); continue; }
  const row = {};
  for (const c of COLS) if (src[c] !== undefined) row[c] = src[c];
  row.price = Number(row.price) || 0;
  payload.push(row);
}

console.log(`\nDB đang có ${haveSlug.size} mã`);
console.log(`Mã hàng bị thiếu: ${missing.length}`);
console.log(`  → có trong cache, sẽ nạp: ${payload.length}`);
console.log(`  → không có cả trong cache: ${notInCache.length}${notInCache.length ? ` (${notInCache.join(", ")})` : ""}`);
if (idClash.length) console.log(`  → trùng uuid, bỏ qua: ${idClash.join(", ")}`);
console.log("");
for (const r of payload) {
  console.log(`  ${String(r.slug).padEnd(16)} | ${String(r.unit || "—").padEnd(6)} | MV ${String(r.barcode || "—").padEnd(16)} | ${r.is_new ? "MỚI " : "    "} | ${String(r.name).slice(0, 46)}`);
}

if (!APPLY) { console.log("\n[DRY-RUN] Chưa ghi gì. Thêm --apply để ghi thật."); process.exit(0); }

const { error } = await db.from("products").insert(payload);
if (error) { console.error(`\nLỗi khi nạp: ${error.message}`); process.exit(1); }
console.log(`\nXong. Đã nạp ${payload.length} mã hàng (giữ nguyên uuid gốc).`);
