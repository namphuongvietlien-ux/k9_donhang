/**
 * Gán products.sku_industry / sku_detail từ SKU_moi_10_ky_tu.xlsx (Chi_tiet).
 *
 *   node scripts/update-sku-groups.mjs
 *   node scripts/update-sku-groups.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const fileArg = args.find((a) => a.startsWith("--file="));
const DEFAULT_XLSX = path.join("D:", "danhmucsanpham", "SKU_moi_10_ky_tu.xlsx");
const WORKSPACE_XLSX = path.join(ROOT, "SKU_moi_10_ky_tu.xlsx");
const SRC = fileArg
  ? fileArg.slice("--file=".length)
  : fs.existsSync(DEFAULT_XLSX)
    ? DEFAULT_XLSX
    : WORKSPACE_XLSX;
const CHUNK = 200;
const SQL_PATH = path.join(ROOT, "scripts", "sql-sku-groups.sql");

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

const foldCode = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

function parseFromSlug(slug) {
  const f = foldCode(slug);
  if (/^[A-Z]{6}\d{4}$/.test(f)) {
    return { industry: f.slice(0, 2), detail: f.slice(2, 4) };
  }
  return null;
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
const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT;
if (!url || !key) {
  throw new Error("Thiếu VITE_SUPABASE_URL hoặc SUPABASE_SECRET_KEY");
}
if (!fs.existsSync(SRC)) {
  throw new Error(`Không tìm thấy file Excel: ${SRC}`);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function applySql() {
  if (!token) {
    console.log("Không có SUPABASE_ACCESS_TOKEN — bỏ qua apply SQL.");
    return false;
  }
  const sql = fs.readFileSync(SQL_PATH, "utf8");
  const ref =
    url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ||
    "zfzotqmksdstizmodtzz";
  console.log("Applying SQL via Management API, project", ref, "...");
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  console.log("Management API:", res.status, text.slice(0, 500));
  return res.ok;
}

async function fetchAllProducts() {
  const pageSize = 1000;
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from("products")
      .select("id, slug, sku_industry, sku_detail")
      .range(from, from + pageSize - 1);
    if (error && /sku_industry|sku_detail/i.test(error.message || "")) {
      const legacy = await db
        .from("products")
        .select("id, slug")
        .range(from, from + pageSize - 1);
      if (legacy.error) throw legacy.error;
      const rows = legacy.data || [];
      all.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
      continue;
    }
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function readExcelRows(filePath) {
  const wb = XLSX.readFile(filePath, { raw: false });
  const sheet = wb.Sheets["Chi_tiet"] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  return rows.map((row) => ({
    oldSku: foldCode(row["Mã cũ"] || row["Ma cu"] || ""),
    newSku: foldCode(
      row["SKU 10 ký tự"] ||
        row["Mã SKU Mới (6 chữ + 4 số)"] ||
        row["SKU"] ||
        "",
    ),
    industry: foldCode(row["Ngành (2)"] || row["Nganh (2)"] || "").slice(0, 2),
    detail: foldCode(row["Chi tiết (2)"] || row["Chi tiet (2)"] || "").slice(
      0,
      2,
    ),
  }));
}

const excelRows = readExcelRows(SRC);
console.log(`Excel: ${SRC} (${excelRows.length} dòng)`);
console.log(`Chế độ: ${APPLY ? "APPLY" : "DRY-RUN"}`);

const sqlOk = await applySql();
if (!sqlOk) {
  console.log("SQL có thể chưa apply. Backfill sẽ lỗi nếu thiếu cột sku_industry.");
}

const products = await fetchAllProducts();
const bySlug = new Map();
for (const p of products) {
  const slug = foldCode(p.slug);
  if (slug) bySlug.set(slug, p);
}

/** id → { industry, detail } */
const planned = new Map();

function setPlan(product, industry, detail) {
  if (!product || !industry) return;
  const ind = String(industry || "").slice(0, 2);
  const known = new Set(["TA", "VS", "DC", "YT", "TT", "PK", "VT", "DV"]);
  if (!known.has(ind)) return;
  planned.set(product.id, {
    id: product.id,
    slug: product.slug,
    industry: ind,
    detail: detail || "",
    prevI: product.sku_industry || null,
    prevD: product.sku_detail || null,
  });
}

for (const row of excelRows) {
  if (!row.industry) continue;
  const hits = [bySlug.get(row.oldSku), bySlug.get(row.newSku)].filter(Boolean);
  const seen = new Set();
  for (const p of hits) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    setPlan(p, row.industry, row.detail);
  }
}

let fromSlug = 0;
for (const p of products) {
  if (planned.has(p.id)) continue;
  const parsed = parseFromSlug(p.slug);
  if (!parsed) continue;
  setPlan(p, parsed.industry, parsed.detail);
  fromSlug += 1;
}

const items = [...planned.values()];
const changed = items.filter(
  (x) => x.prevI !== x.industry || (x.prevD || "") !== (x.detail || ""),
);
const byInd = new Map();
for (const x of items) {
  byInd.set(x.industry, (byInd.get(x.industry) || 0) + 1);
}

console.log(`Khớp: ${items.length} / ${products.length} (từ slug 10 ký tự: ${fromSlug})`);
console.log(`Cần ghi: ${changed.length}`);
console.log(
  [...byInd.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n"),
);

if (!APPLY) {
  console.log("\nChưa ghi DB. Chạy lại với --apply.");
  process.exit(0);
}

const groups = new Map();
for (const item of changed) {
  const key = `${item.industry}|${item.detail || ""}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(item.id);
}

let updated = 0;
for (const [key, ids] of groups) {
  const [industry, detail] = key.split("|");
  for (const chunk of chunkList(ids, CHUNK)) {
    const { error, count } = await db
      .from("products")
      .update(
        { sku_industry: industry, sku_detail: detail || null },
        { count: "exact" },
      )
      .in("id", chunk);
    if (error) throw new Error(`${key}: ${error.message}`);
    updated += count ?? chunk.length;
    console.log(`  ${key}: +${chunk.length} (tổng ${updated})`);
  }
}
console.log(`Xong. ${updated} sản phẩm.`);
