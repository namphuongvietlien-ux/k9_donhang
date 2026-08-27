/**
 * Nạp lại `order_items` từ file cache trình duyệt (k9-cache-*.json) do
 * scripts/recover-from-browser-cache.js xuất ra.
 *
 * Gộp được nhiều file từ nhiều máy — phiếu nào có ở nhiều máy thì lấy bản
 * dataUpdatedAt mới nhất.
 *
 *   node scripts/_restore-order-items-from-cache.mjs                       # dry-run tất cả file trong scripts/import/
 *   node scripts/_restore-order-items-from-cache.mjs --apply
 *   node scripts/_restore-order-items-from-cache.mjs --file=đường/dẫn.json
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const fileArg = argv.find((a) => a.startsWith("--file="));
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

// ---- 1. Gom file ----
let files = [];
if (fileArg) files = [path.resolve(fileArg.slice("--file=".length))];
else if (fs.existsSync(IMPORT_DIR)) {
  files = fs.readdirSync(IMPORT_DIR).filter((f) => /^k9-cache.*\.json$/i.test(f)).map((f) => path.join(IMPORT_DIR, f));
}
if (!files.length) {
  console.error(`Không thấy file k9-cache-*.json trong ${IMPORT_DIR}`);
  console.error("Chạy scripts/recover-from-browser-cache.js trên tab còn mở, rồi copy file JSON vào đó.");
  process.exit(1);
}
console.log(`Đọc ${files.length} file cache:`);

// ---- 2. Quét mọi object có order_code + order_items ----
/** order_code → { code, items[], updatedAt, src } */
const best = new Map();
for (const file of files) {
  let json;
  try { json = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.log(`  ${path.basename(file)} — LỖI đọc: ${e.message}`); continue; }

  let found = 0;
  const visit = (v, depth, updatedAt) => {
    if (!v || depth > 8) return;
    if (Array.isArray(v)) { v.forEach((x) => visit(x, depth + 1, updatedAt)); return; }
    if (typeof v !== "object") return;
    const ts = typeof v.dataUpdatedAt === "number" ? v.dataUpdatedAt : updatedAt;
    if (v.order_code && Array.isArray(v.order_items) && v.order_items.length) {
      const code = normCode(v.order_code);
      const prev = best.get(code);
      if (!prev || (ts || 0) > (prev.updatedAt || 0)) {
        best.set(code, { code, items: v.order_items, updatedAt: ts || 0, src: path.basename(file) });
      }
      found += 1;
    }
    for (const k of Object.keys(v)) visit(v[k], depth + 1, ts);
  };
  visit(json, 0, 0);
  console.log(`  ${path.basename(file)} — ${found} lần gặp phiếu`);
}
console.log(`\nPhiếu duy nhất có dòng hàng: ${best.size}`);

// ---- 3. Đối chiếu DB ----
const { count: existing } = await db.from("order_items").select("*", { count: "exact", head: true });
const orders = new Map();
for (let f = 0; ; f += 1000) {
  const { data, error } = await db.from("orders").select("id, order_code, status, created_at").order("created_at").range(f, f + 999);
  if (error) throw new Error(error.message);
  for (const o of data || []) orders.set(normCode(o.order_code), o);
  if (!data || data.length < 1000) break;
}
const products = new Map();
for (let f = 0; ; f += 1000) {
  const { data, error } = await db.from("products").select("id, slug").order("id").range(f, f + 999);
  if (error) throw new Error(error.message);
  for (const p of data || []) products.set(normCode(p.slug), p.id);
  if (!data || data.length < 1000) break;
}

// phiếu nào đã có dòng hàng rồi thì bỏ qua, không chèn trùng
const already = new Set();
for (let f = 0; ; f += 1000) {
  const { data, error } = await db.from("order_items").select("order_id").range(f, f + 999);
  if (error) break;
  for (const r of data || []) already.add(r.order_id);
  if (!data || data.length < 1000) break;
}

const payload = [];
const skippedNoOrder = [];
const skippedHasItems = [];
const missingSku = new Set();
for (const [code, rec] of best) {
  const ord = orders.get(code);
  if (!ord) { skippedNoOrder.push(code); continue; }
  if (already.has(ord.id)) { skippedHasItems.push(code); continue; }
  const sorted = [...rec.items].sort((a, b) => (Number(a.stt) || 0) - (Number(b.stt) || 0));
  let stt = 0;
  for (const it of sorted) {
    const slug = normCode(it.product_slug);
    stt += 1;
    const pid = products.get(slug) ?? null;
    if (slug && !pid) missingSku.add(slug);
    payload.push({
      order_id: ord.id,
      product_id: pid,
      stt: Number(it.stt) || stt,
      product_slug: slug || null,
      product_name: it.product_name || slug || "—",
      barcode: it.barcode ?? null,
      unit: it.unit ?? null,
      price: Number(it.price) || 0,
      quantity: Number(it.quantity ?? it.qty_requested) || 0,
      qty_requested: it.qty_requested == null ? Number(it.quantity) || 0 : Number(it.qty_requested),
      qty_packed: it.qty_packed == null ? null : Number(it.qty_packed),
      qty_received: it.qty_received == null ? null : Number(it.qty_received),
      line_notes: it.line_notes ?? null,
    });
  }
}

console.log(`\n=== KẾT QUẢ ===`);
console.log(`order_items hiện có trong DB: ${existing ?? 0}`);
console.log(`Sẽ chèn ${payload.length} dòng cho ${new Set(payload.map((p) => p.order_id)).size} phiếu`);
console.log(`Bỏ qua — không có phiếu trong DB : ${skippedNoOrder.length}${skippedNoOrder.length ? ` (${skippedNoOrder.slice(0, 6).join(", ")})` : ""}`);
console.log(`Bỏ qua — phiếu đã có dòng hàng   : ${skippedHasItems.length}`);
console.log(`Mã hàng không có trong danh mục  : ${missingSku.size} → product_id = null`);
console.log(`\nCứu được cả qty_packed / qty_received / line_notes — thứ Google Sheet không có.`);

const covered = new Set(payload.map((p) => p.order_id));
const still = [...orders.values()].filter((o) => !covered.has(o.id) && !already.has(o.id));
console.log(`\nCÒN THIẾU sau lần này: ${still.length} phiếu`);
for (const o of still.slice(0, 40)) {
  console.log(`   ${o.order_code} | ${o.status} | ${new Date(o.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false })}`);
}
if (still.length > 40) console.log(`   … và ${still.length - 40} phiếu nữa`);

if (!APPLY) { console.log("\n[DRY-RUN] Chưa ghi gì. Thêm --apply để ghi thật."); process.exit(0); }

let done = 0;
for (let i = 0; i < payload.length; i += 500) {
  const slice = payload.slice(i, i + 500);
  const { error } = await db.from("order_items").insert(slice);
  if (error) { console.error(`\nLỗi lô ${i}: ${error.message}`); continue; }
  done += slice.length;
  process.stdout.write(`\r  đã chèn ${done}/${payload.length}`);
}
console.log(`\nXong. Đã chèn ${done} dòng hàng.`);
