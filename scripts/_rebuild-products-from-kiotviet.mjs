/**
 * Dựng lại bảng `products` từ file export KiotViet "Danh sách hàng hóa".
 * Upsert theo `slug` (UNIQUE) — KHÔNG xóa dòng nào, không đụng tới cờ
 * is_new / is_locked / is_out_stock của các dòng đang có.
 *
 *   node scripts/_rebuild-products-from-kiotviet.mjs                 # dry-run, không ghi
 *   node scripts/_rebuild-products-from-kiotviet.mjs --apply         # ghi thật
 *   node scripts/_rebuild-products-from-kiotviet.mjs --file="..."    # đổi file nguồn
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const fileArg = args.find((a) => a.startsWith("--file="));
const SRC = fileArg ? fileArg.slice("--file=".length) : "Danh sách hàng hóa (19).xlsx";

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

/** Giữ nguyên mã hàng gốc, chỉ trim + NFC + upper — khớp slugFromMaHang/normalizeOrderCodeText */
const normCode = (v) => String(v ?? "").trim().normalize("NFC").toUpperCase();
/** Mã vạch: ép về text, chặn Excel biến số dài thành 4.97656E+14 */
const asBarcode = (v) => {
  if (v == null || v === "") return null;
  let s = typeof v === "number" ? v.toFixed(0) : String(v).trim();
  if (/e\+/i.test(s)) return null; // đã mất chính xác → bỏ, không ghi rác
  s = s.replace(/\s+/g, "");
  return s || null;
};
const asNum = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// ---- 1. Đọc file nguồn ----
const wb = XLSX.readFile(path.join(ROOT, SRC), { raw: false });
const sheet = wb.Sheets["Danh sách hàng hóa"] || wb.Sheets[wb.SheetNames[0]];
const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

const HEADER_ROW = matrix.findIndex((r) => String(r?.[0] ?? "").trim() === "Mã hàng hóa");
if (HEADER_ROW < 0) throw new Error("Không tìm thấy dòng tiêu đề 'Mã hàng hóa'");
const H = matrix[HEADER_ROW];
const col = (label) => H.findIndex((h) => String(h ?? "").trim() === label);

const C = {
  slug: col("Mã hàng hóa"),
  parent: col("Mã hàng hóa cha"),
  barcode: col("Mã vạch"),
  cost: col("Giá vốn"),
  name: col("Tên hàng hóa"),
  unit: col("Đơn vị tính"),
  price: col("Giá bán"),
};
if (C.slug < 0 || C.name < 0) throw new Error("File thiếu cột Mã hàng hóa / Tên hàng hóa");

const bySlug = new Map();
let skipped = 0;
let badBarcode = 0;
for (let i = HEADER_ROW + 1; i < matrix.length; i++) {
  const r = matrix[i];
  const slug = normCode(r?.[C.slug]);
  const name = String(r?.[C.name] ?? "").trim();
  if (!slug || !name) { skipped++; continue; }
  const rawBc = r?.[C.barcode];
  const bc = asBarcode(rawBc);
  if (rawBc && !bc) badBarcode++;
  bySlug.set(slug, {
    slug,
    name,
    parent_sku: normCode(r?.[C.parent]) || null,
    barcode: bc,
    unit: String(r?.[C.unit] ?? "").trim() || null,
    price: asNum(r?.[C.price]),
    cost_price: asNum(r?.[C.cost]),
    is_active: true,
  });
}
const rows = [...bySlug.values()];
console.log(`Nguồn: ${SRC}`);
console.log(`  Dòng hợp lệ: ${rows.length} | bỏ qua (thiếu mã/tên): ${skipped} | mã vạch lỗi định dạng: ${badBarcode}`);

// ---- 2. Đối chiếu với DB hiện tại ----
const current = new Map();
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("products").select("id, slug, name, barcode, unit, parent_sku").order("id").range(from, from + 999);
  if (error) throw new Error(error.message);
  for (const r of data || []) current.set(normCode(r.slug), r);
  if (!data || data.length < 1000) break;
}
const missing = rows.filter((r) => !current.has(r.slug));
const present = rows.filter((r) => current.has(r.slug));
const orphan = [...current.keys()].filter((s) => !bySlug.has(s));

console.log(`\nDB hiện tại: ${current.size} mã`);
console.log(`  → sẽ THÊM MỚI:      ${missing.length}`);
console.log(`  → sẽ CẬP NHẬT:      ${present.length} (tên/ĐVT/mã vạch/giá theo KiotViet)`);
console.log(`  → có trong DB nhưng KHÔNG có trong file: ${orphan.length} (giữ nguyên, không xóa)`);
if (orphan.length) console.log(`     ví dụ: ${orphan.slice(0, 8).join(", ")}`);
if (missing.length) console.log(`  ví dụ mã sẽ thêm: ${missing.slice(0, 8).map((r) => r.slug).join(", ")}`);

const withBarcode = rows.filter((r) => r.barcode).length;
console.log(`\nMã vạch: ${withBarcode}/${rows.length} dòng có mã vạch`);
const bcMap = new Map();
for (const r of rows) if (r.barcode) bcMap.set(r.barcode, (bcMap.get(r.barcode) || 0) + 1);
const dupBc = [...bcMap.entries()].filter(([, n]) => n > 1);
console.log(`Mã vạch bị gắn cho >1 mã hàng: ${dupBc.length}${dupBc.length ? ` (vd ${dupBc.slice(0, 3).map(([b, n]) => `${b}×${n}`).join(", ")})` : ""}`);

if (!APPLY) {
  console.log("\n[DRY-RUN] Chưa ghi gì. Thêm --apply để ghi thật.");
  process.exit(0);
}

// ---- 3. Upsert theo slug ----
let done = 0;
for (let i = 0; i < rows.length; i += 200) {
  const slice = rows.slice(i, i + 200);
  const { error } = await db.from("products").upsert(slice, { onConflict: "slug" });
  if (error) {
    console.error(`Lỗi lô ${i}-${i + slice.length}: ${error.message}`);
    continue;
  }
  done += slice.length;
  process.stdout.write(`\r  upsert ${done}/${rows.length}`);
}
console.log(`\nXong. Đã upsert ${done} dòng.`);
