/**
 * Dựng lại `order_items` từ tab "Lịch Sử Xuất Kho" của Google Sheet đồng bộ.
 *
 * Cột trong Sheet (do scripts/sync-to-google-sheets.mjs ghi ra, 13 cột):
 *   0 created_at  1 order_code  2 order_kind  3 kho_xuat  4 kho_nhan
 *   5 product_slug 6 barcode    7 product_name 8 unit
 *   9 qty_requested 10 qty_packed 11 status   12 updated_at
 *
 * Sheet là APPEND-ONLY: mỗi lần đơn được sửa (soạn hàng, nhận hàng) thì TOÀN BỘ
 * dòng hàng của đơn đó được ghi thêm một lần nữa với updated_at mới. Vì vậy chỉ
 * lấy block có updated_at MỚI NHẤT của từng mã đơn — nếu không sẽ nhân bản dòng.
 *
 *   node scripts/_rebuild-order-items-from-sheet.mjs                          # dry-run
 *   node scripts/_rebuild-order-items-from-sheet.mjs --apply                  # ghi thật
 *   node scripts/_rebuild-order-items-from-sheet.mjs --file=duong/dan.csv
 *   node scripts/_rebuild-order-items-from-sheet.mjs --apply --force          # bỏ chốt an toàn
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const FORCE = argv.includes("--force");
const fileArg = argv.find((a) => a.startsWith("--file="));
const SRC = fileArg ? fileArg.slice("--file=".length) : "scripts/import/lich-su-xuat-kho.csv";

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

const normCode = (v) => String(v ?? "").trim().normalize("NFC").toUpperCase();
const asQty = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
/** fmtTs của sync script: DD/MM/YYYY HH:mm:ss (giờ UTC vì Actions chạy UTC) */
const parseTs = (s) => {
  const m = String(s ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]);
};

// ---------- 1. Đọc file ----------
const srcPath = path.join(ROOT, SRC);
if (!fs.existsSync(srcPath)) {
  console.error(`Không thấy file: ${srcPath}`);
  console.error("Tải tab 'Lịch Sử Xuất Kho' → File → Download → CSV, lưu vào đường dẫn trên.");
  process.exit(1);
}
const wb = XLSX.readFile(srcPath, { raw: false, codepage: 65001 });
const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });

// Chỉ nhận dòng có mã đơn hợp lệ ở cột 1 → tự bỏ qua header và dòng rác
const RAW = [];
for (const r of matrix) {
  const code = normCode(r?.[1]);
  if (!/^(DH|DC|XB)-/.test(code)) continue;
  RAW.push({
    code,
    kind: String(r?.[2] ?? "").trim(),
    slug: normCode(r?.[5]),
    barcode: String(r?.[6] ?? "").trim() || null,
    name: String(r?.[7] ?? "").trim(),
    unit: String(r?.[8] ?? "").trim() || null,
    qtyReq: asQty(r?.[9]),
    qtyPacked: String(r?.[10] ?? "").trim() === "" ? null : asQty(r?.[10]),
    status: String(r?.[11] ?? "").trim(),
    ts: parseTs(r?.[12]),
  });
}
console.log(`File: ${SRC}`);
console.log(`  Dòng dữ liệu đọc được: ${RAW.length}`);
if (!RAW.length) { console.error("Không đọc được dòng nào — kiểm tra lại tab đã export."); process.exit(1); }

// ---------- 2. Chỉ giữ block updated_at mới nhất của mỗi đơn ----------
const byOrder = new Map();
for (const r of RAW) {
  if (!byOrder.has(r.code)) byOrder.set(r.code, []);
  byOrder.get(r.code).push(r);
}
const snapshot = new Map();
let dupDropped = 0;
for (const [code, rows] of byOrder) {
  const withTs = rows.filter((r) => r.ts != null);
  let keep;
  if (withTs.length) {
    const maxTs = Math.max(...withTs.map((r) => r.ts));
    keep = rows.filter((r) => r.ts === maxTs);
  } else {
    // không parse được updated_at → dedupe theo mã hàng + ĐVT, giữ lần xuất hiện cuối
    const last = new Map();
    for (const r of rows) last.set(`${r.slug}|${r.unit}`, r);
    keep = [...last.values()];
  }
  dupDropped += rows.length - keep.length;
  snapshot.set(code, keep);
}
console.log(`  Mã đơn trong file: ${snapshot.size} | dòng trùng do append nhiều lần đã bỏ: ${dupDropped}`);

// ---------- 3. Đối chiếu DB ----------
const { count: existingItems } = await db.from("order_items").select("*", { count: "exact", head: true });
if (existingItems && !FORCE) {
  console.error(`\nCHỐT AN TOÀN: order_items đang có ${existingItems} dòng. Script này chỉ dùng khi bảng rỗng.`);
  console.error("Nếu chắc chắn muốn chèn thêm, chạy lại với --force.");
  process.exit(1);
}

const orders = new Map();
for (let f = 0; ; f += 1000) {
  const { data, error } = await db.from("orders").select("id, order_code, order_kind, status, created_at").order("created_at").range(f, f + 999);
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
console.log(`\nDB: ${orders.size} đơn, ${products.size} mã hàng, order_items hiện có ${existingItems ?? 0}`);

// ---------- 4. Dựng payload ----------
const payload = [];
const noSuchOrder = [];
const missingSku = new Set();
for (const [code, rows] of snapshot) {
  const ord = orders.get(code);
  if (!ord) { noSuchOrder.push(code); continue; }
  let stt = 0;
  for (const r of rows) {
    if (!r.slug && !r.name) continue;
    stt += 1;
    const pid = products.get(r.slug) ?? null;
    if (!pid) missingSku.add(r.slug);
    payload.push({
      order_id: ord.id,
      product_id: pid,           // nullable từ migration 20250110000018
      stt,
      product_slug: r.slug,
      product_name: r.name || r.slug,
      barcode: r.barcode,
      unit: r.unit,
      qty_requested: r.qtyReq,
      qty_packed: r.qtyPacked,
      quantity: r.qtyReq,        // cột legacy — dùng làm fallback
      price: 0,
    });
  }
}

const coveredOrders = new Set(payload.map((p) => p.order_id));
const orphanOrders = [...orders.values()].filter((o) => !coveredOrders.has(o.id));

console.log(`\n=== KẾT QUẢ DỰNG LẠI ===`);
console.log(`Sẽ chèn: ${payload.length} dòng hàng cho ${coveredOrders.size}/${orders.size} đơn`);
console.log(`Mã đơn có trong Sheet nhưng KHÔNG có trong DB: ${noSuchOrder.length}${noSuchOrder.length ? ` (${noSuchOrder.slice(0, 5).join(", ")}…)` : ""}`);
console.log(`Mã hàng trong Sheet không có trong danh mục: ${missingSku.size} → product_id = null, vẫn giữ mã/tên dạng text`);
if (missingSku.size) console.log(`   ví dụ: ${[...missingSku].slice(0, 8).join(", ")}`);
console.log(`\n>>> ĐƠN KHÔNG CỨU ĐƯỢC TỪ SHEET (phải nhập tay từ Telegram / phiếu in): ${orphanOrders.length}`);
for (const o of orphanOrders) {
  console.log(`   ${o.order_code} | ${o.order_kind} | ${o.status} | ${String(o.created_at).slice(0, 16).replace("T", " ")} UTC`);
}

if (!APPLY) {
  console.log(`\n[DRY-RUN] Chưa ghi gì. Thêm --apply để ghi thật.`);
  process.exit(0);
}

// ---------- 5. Ghi ----------
let done = 0;
for (let i = 0; i < payload.length; i += 500) {
  const slice = payload.slice(i, i + 500);
  const { error } = await db.from("order_items").insert(slice);
  if (error) { console.error(`\nLỗi lô ${i}: ${error.message}`); continue; }
  done += slice.length;
  process.stdout.write(`\r  đã chèn ${done}/${payload.length}`);
}
console.log(`\nXong. Đã chèn ${done} dòng hàng.`);
console.log("Kiểm tra lại: node scripts/_assess-truncate-damage.mjs");
