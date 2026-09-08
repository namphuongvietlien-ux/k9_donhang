/**
 * Chuyển TPCN / thực phẩm chức năng đang nằm nhóm thức ăn (TA/BS, HANG_HOA)
 * sang thẻ tồn kho Thuốc: sku_industry=YT, sku_detail=CN, category_group=THUOC.
 *
 *   node scripts/reclassify-tpcn-to-thuoc.mjs
 *   node scripts/reclassify-tpcn-to-thuoc.mjs --apply
 *
 * Snack Jerhigh / CIAO / miếng gà sấy giữ nguyên hàng hóa.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");
const CHUNK = 200;

function loadEnv() {
  for (const name of [".env", ".env.local"]) {
    const envPath = path.join(ROOT, name);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function foldText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function foldSlug(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function isClearlyFoodOrTreat(name, slug) {
  const n = foldText(name);
  const s = foldSlug(slug);
  if (s.startsWith("SNC")) return true;
  if (
    /jerhigh|juicy bites|ciao |mieng ga say|thuc an kho|ta hat|ta dang set|ta kho hon hop|reflex plus/.test(
      n,
    )
  ) {
    return true;
  }
  if (/stick\s*-\s*goi|banana stick|beef stick|blueberry stick|strawberry stick/.test(n)) {
    return true;
  }
  if (/huong vi/.test(n) && (/ciao|juicy|fillet|soup|tuna|chicken|nuoc thit|tabs cho meo/.test(n))) {
    return true;
  }
  if (/aller-zero/.test(n)) return true;
  if (/epioti|ear cleanser|natural core|puppy \d/.test(n)) return true;
  return false;
}

function isTpcnProduct(p) {
  const name = String(p.name || "");
  const slug = foldSlug(p.slug);
  if (isClearlyFoodOrTreat(name, slug)) return false;
  const n = foldText(name);
  if (/thuoc thu y|bromhexine|brom max|\binj\b|inj-|injection/.test(n)) {
    return false;
  }
  if (/tpcn|thuc pham chuc nang/.test(n)) return true;
  if (/CNXXX/.test(slug) || /^(H|M|C)CN/.test(slug)) {
    return true;
  }
  if (/^TCN\d/.test(slug) && !/epioti|ear cleanser|natural core/.test(n)) {
    return true;
  }
  const industry = foldSlug(p.sku_industry).slice(0, 2);
  const detail = foldSlug(p.sku_detail).slice(0, 2);
  const fromSlug10 = /^[A-Z]{6}\d{4}$/.test(slug)
    ? { industry: slug.slice(0, 2), detail: slug.slice(2, 4) }
    : null;
  const isBs =
    (industry === "TA" && detail === "BS") ||
    (fromSlug10?.industry === "TA" && fromSlug10.detail === "BS");
  if (!isBs && !/^TAC\d/.test(slug) && !/^tabs/.test(n)) return false;
  if (
    /gel|oil|omega|vitamin|men |probisol|prolax|kidney|immuno|flora|canxi|calcium|elecamin|nuvita|clostop|quad|10kd|vf\+|pet lac|birthright|probio|hairball cure|hairball solution|tabs 120g|oral drops/.test(
      n,
    )
  ) {
    return true;
  }
  if (/^tabs/.test(n) && !/stick|cookie|bacon|jerky|juicy|ciao|huong/.test(n)) {
    return true;
  }
  if (/^TAC\d/.test(slug) && /vf\+/.test(n)) return true;
  return isBs;
}

function needsMove(p) {
  if (!isTpcnProduct(p)) return false;
  const industry = foldSlug(p.sku_industry).slice(0, 2);
  if (industry === "YT" || industry === "VT") return false;
  const group = String(p.category_group || "").trim().toUpperCase();
  if (group === "THUOC") return false;
  return true;
}

function chunkList(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

loadEnv();
const url = process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("Thiếu VITE_SUPABASE_URL hoặc SUPABASE_SECRET_KEY");
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchAll() {
  const all = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await db
      .from("products")
      .select("id, slug, name, sku_industry, sku_detail, category_group")
      .range(from, from + page - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return all;
}

const products = await fetchAll();
const hits = products.filter(needsMove);
const needWrite = hits.filter(
  (p) =>
    p.sku_industry !== "YT" ||
    p.sku_detail !== "CN" ||
    p.category_group !== "THUOC",
);

console.log(`Catalog: ${products.length}`);
console.log(`TPCN nhận diện: ${hits.length}`);
console.log(`Cần ghi: ${needWrite.length}`);
console.log("Danh sách đầy đủ:");
for (const p of needWrite) {
  console.log(
    `  ${p.slug} | ${p.sku_industry || "-"}/${p.sku_detail || "-"}/${p.category_group || "-"} | ${p.name}`,
  );
}

if (!APPLY) {
  console.log("\nChưa ghi DB. Chạy lại với --apply.");
  process.exit(0);
}

let updated = 0;
for (const chunk of chunkList(needWrite, CHUNK)) {
  const ids = chunk.map((p) => p.id);
  const { error, count } = await db
    .from("products")
    .update(
      {
        sku_industry: "YT",
        sku_detail: "CN",
        category_group: "THUOC",
      },
      { count: "exact" },
    )
    .in("id", ids);
  if (error) throw error;
  updated += count ?? chunk.length;
  console.log(`  +${chunk.length} (tổng ${updated})`);
}
console.log(`Xong. ${updated} sản phẩm → YT/CN + THUOC.`);
