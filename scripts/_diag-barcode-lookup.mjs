/**
 * Chẩn đoán tra cứu mã vạch: so sánh catalog client tải được vs DB.
 * node scripts/_diag-barcode-lookup.mjs [maVachCanTra]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const COLS = "id,name,slug,barcode,unit,unit_2,barcode_2,unit_2_ratio,price,price_2,parent_sku,is_active";

// --- 1) Tổng số dòng thật ---
const { count: total } = await db.from("products").select("id", { count: "exact", head: true });
console.log("Tổng products trong DB:", total);

// --- 2) Mô phỏng CHÍNH XÁC cách useProducts.ts phân trang: order('name') + range ---
async function paginate(orderCols) {
  let all = [];
  let from = 0;
  const step = 1000;
  for (;;) {
    let q = db.from("products").select(COLS);
    for (const c of orderCols) q = q.order(c, { ascending: true });
    const { data, error } = await q.range(from, from + step - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < step) break;
    from += step;
  }
  return all;
}

const byName = await paginate(["name"]);
const byId = await paginate(["id"]);

const idsName = new Set(byName.map((r) => r.id));
const idsId = new Set(byId.map((r) => r.id));

console.log(`\nPhân trang order('name')  → ${byName.length} dòng, ${idsName.size} id duy nhất`);
console.log(`Phân trang order('id')    → ${byId.length} dòng, ${idsId.size} id duy nhất`);

const missing = [...idsId].filter((id) => !idsName.has(id));
console.log(`\n❗ Dòng BỊ MẤT khi order('name'): ${missing.length}`);
const byIdMap = new Map(byId.map((r) => [r.id, r]));
for (const id of missing.slice(0, 40)) {
  const r = byIdMap.get(id);
  console.log(`  - ${String(r.slug).padEnd(16)} | ${r.name} | bc=${r.barcode || "-"} bc2=${r.barcode_2 || "-"}`);
}
if (missing.length > 40) console.log(`  … và ${missing.length - 40} dòng nữa`);

const dupInPage = byName.length - idsName.size;
console.log(`Dòng BỊ LẶP khi order('name'): ${dupInPage}`);

// --- 3) Bao nhiêu tên bị trùng (nguyên nhân phân trang lệch) ---
const nameCount = new Map();
for (const r of byId) nameCount.set(r.name, (nameCount.get(r.name) || 0) + 1);
const dupNames = [...nameCount.values()].filter((n) => n > 1).length;
console.log(`\nSố TÊN bị trùng (>=2 dòng cùng name): ${dupNames}`);

// --- 4) Dòng bị client lọc bỏ: thiếu slug hoặc is_active=false ---
const noSlug = byId.filter((r) => !r.slug);
const inactive = byId.filter((r) => r.is_active === false);
console.log(`Dòng KHÔNG có slug (client bỏ qua): ${noSlug.length}`);
for (const r of noSlug.slice(0, 15)) console.log(`  - ${r.name} | bc=${r.barcode || "-"} bc2=${r.barcode_2 || "-"}`);
console.log(`Dòng is_active=false (client bỏ qua): ${inactive.length}`);
for (const r of inactive.slice(0, 15)) console.log(`  - ${r.slug} | ${r.name} | bc=${r.barcode || "-"}`);

// --- 5) Mã vạch trùng giữa các dòng khác nhau ---
const bcMap = new Map();
const addBc = (v, r, field) => {
  const s = String(v ?? "").trim();
  if (!s) return;
  const cur = bcMap.get(s) || [];
  cur.push({ slug: r.slug, name: r.name, field, unit: field === "barcode" ? r.unit : r.unit_2 });
  bcMap.set(s, cur);
};
for (const r of byId) {
  addBc(r.barcode, r, "barcode");
  addBc(r.barcode_2, r, "barcode_2");
}
const collisions = [...bcMap.entries()].filter(([, v]) => {
  const slugs = new Set(v.map((x) => x.slug));
  return slugs.size > 1;
});
console.log(`\n❗ Mã vạch trỏ về NHIỀU SKU khác nhau: ${collisions.length}`);
for (const [bc, v] of collisions.slice(0, 25)) {
  console.log(`  ${bc}:`);
  for (const x of v) console.log(`     ${String(x.slug).padEnd(16)} [${x.field} / ${x.unit || "-"}] ${x.name}`);
}
if (collisions.length > 25) console.log(`  … và ${collisions.length - 25} mã nữa`);

// --- 6) barcode === barcode_2 trên cùng 1 dòng ---
const sameBoth = byId.filter((r) => r.barcode && r.barcode_2 && String(r.barcode).trim() === String(r.barcode_2).trim());
console.log(`\nDòng có barcode === barcode_2: ${sameBoth.length}`);
for (const r of sameBoth.slice(0, 15)) console.log(`  - ${r.slug} | ${r.name} | ${r.barcode} | ${r.unit}/${r.unit_2}`);

// --- 7) Tra 1 mã cụ thể nếu truyền tham số ---
const probe = process.argv[2];
if (probe) {
  console.log(`\n=== Tra "${probe}" trực tiếp trên DB ===`);
  const { data } = await db
    .from("products")
    .select(COLS)
    .or(`barcode.eq.${probe},barcode_2.eq.${probe},slug.eq.${probe}`);
  console.log(JSON.stringify(data, null, 2));
  console.log(`\n=== Có trong catalog client (order name) không? ===`);
  const inName = byName.filter((r) => [r.barcode, r.barcode_2, r.slug].map((x) => String(x ?? "").trim()).includes(probe));
  console.log(inName.length ? JSON.stringify(inName, null, 2) : "❗ KHÔNG có — client sẽ khớp nhầm sang mã khác");
}
