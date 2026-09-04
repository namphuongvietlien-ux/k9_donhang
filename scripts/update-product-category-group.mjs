/**
 * Cập nhật hàng loạt products.category_group từ file SKU 10 ký tự.
 *
 *   node scripts/update-product-category-group.mjs
 *   node scripts/update-product-category-group.mjs --apply
 *   node scripts/update-product-category-group.mjs --file="D:\danhmucsanpham\SKU_moi_10_ky_tu.xlsx" --apply
 *
 * Phân nhóm:
 *   THUOC     — YT (thuốc) + VT (vật tư y tế) + mã thuốc bắt buộc / heuristic
 *   DICH_VU   — ngành DV (không cho nhập vào phiếu)
 *   HANG_HOA  — TA, VS, PK, TT, DC và mọi mã còn lại
 *
 * Ẩn (is_active=false): mã vạch/slug trùng name và name không phải dạng chữ.
 *
 * Khớp record: slug = Mã cũ, rồi slug = SKU 10 ký tự, rồi tên (nếu tên không trùng).
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
const SRC = fileArg ? fileArg.slice("--file=".length) : DEFAULT_XLSX;
const CHUNK = 200;

/** Thuốc bắt buộc (kể cả slug có dấu / không dấu). */
const FORCE_THUOC = [
  "CĐTTGV1007",
  "CDTTGV1007",
  "HĐTHTR2012",
  "HDTHTR2012",
  "IT13V01",
  "IT23V01",
  "IT23V02",
  "MTH1001",
  "R01",
  "PC51O01",
  "PD51O01",
];

const THUOC_PREFIXES = [
  "TGV",
  "VAC",
  "TKS",
  "HVTK",
  "HVTXNC",
  "MTH",
  "CDTTGV",
  "HDTHTR",
  "HDTTKS",
  "IT13",
  "IT23",
];

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
    .toUpperCase();

const normName = (v) =>
  String(v ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

function isNonLetterCodeName(name) {
  const t = String(name || "").trim();
  if (!t) return false;
  return !/[A-Za-zÀ-ỹ]/.test(t);
}

function isGarbageAlias(p) {
  const name = String(p.name || "").trim();
  if (!isNonLetterCodeName(name)) return false;
  const slug = String(p.slug || "").trim();
  const bc = String(p.barcode || "").trim();
  const bc2 = String(p.barcode_2 || "").trim();
  if (name === slug || name === bc || name === bc2) return true;
  return Boolean(slug) && isNonLetterCodeName(slug);
}

function classifyExcel(industryCode, industryName) {
  const code = foldCode(industryCode);
  const name = String(industryName ?? "").normalize("NFC").trim().toLowerCase();
  if (code === "YT" || code === "VT") return "THUOC";
  if (code === "DV") return "DICH_VU";
  if (
    name.includes("dịch vụ") ||
    name.includes("dich vu") ||
    name.includes("service")
  ) {
    return "DICH_VU";
  }
  if (
    name.includes("y tế") ||
    name.includes("y te") ||
    name.includes("thuốc") ||
    name.includes("thuoc") ||
    name.includes("vật tư") ||
    name.includes("vat tu")
  ) {
    return "THUOC";
  }
  return "HANG_HOA";
}

function isForcedThuoc(slug, name) {
  const folded = foldCode(slug);
  if (FORCE_THUOC.some((s) => foldCode(s) === folded)) return true;
  if (THUOC_PREFIXES.some((p) => folded.startsWith(p))) return true;
  const n = String(name || "").normalize("NFC").toLowerCase();
  if (
    /thuốc|thuoc|vắc\s*xin|vac\s*xin|vắc-xin|vaccine|vắc xin/.test(n)
  ) {
    return true;
  }
  return false;
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
  throw new Error("Thiếu VITE_SUPABASE_URL hoặc SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY");
}
if (!fs.existsSync(SRC)) {
  throw new Error(`Không tìm thấy file Excel: ${SRC}`);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchAllProducts() {
  const pageSize = 1000;
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from("products")
      .select("id, slug, name, barcode, barcode_2, category_group, is_active")
      .range(from, from + pageSize - 1);
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
  const sheet =
    wb.Sheets["Chi_tiet"] ||
    wb.Sheets["Ket_qua"] ||
    wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  return rows.map((row, index) => {
    const oldSku = foldCode(row["Mã cũ"] || row["Ma cu"] || "");
    const newSku = foldCode(
      row["SKU 10 ký tự"] ||
        row["Mã SKU Mới (6 chữ + 4 số)"] ||
        row["SKU"] ||
        "",
    );
    const name = String(row["Tên gốc"] || row["Ten goc"] || "").trim();
    const industryCode = row["Ngành (2)"] || row["Nganh (2)"] || "";
    const industryName = row["Ngành hàng"] || row["Nganh hang"] || "";
    return {
      excelRow: index + 2,
      oldSku,
      newSku,
      name,
      group: classifyExcel(industryCode, industryName),
      industry: String(industryCode || industryName || "").trim(),
    };
  });
}

function matchProduct(row, bySlug, byName) {
  const hits = [];
  const seen = new Set();
  const push = (p, how) => {
    if (!p || seen.has(p.id)) return;
    seen.add(p.id);
    hits.push({ product: p, how });
  };
  if (row.oldSku) push(bySlug.get(row.oldSku), "slug=mã cũ");
  if (row.newSku) push(bySlug.get(row.newSku), "slug=SKU mới");
  const nameKey = normName(row.name);
  if (nameKey) {
    const named = byName.get(nameKey) || [];
    if (named.length === 1) push(named[0], "tên");
    else if (named.length > 1 && !hits.length) {
      return { status: "ambiguous_name", named };
    }
  }
  if (!hits.length) return { status: "missing" };
  if (hits.length > 1) return { status: "ambiguous_sku", hits };
  return { status: "ok", hit: hits[0] };
}

const excelRows = readExcelRows(SRC);
console.log(`Excel: ${SRC}`);
console.log(`Dòng Chi_tiet/Ket_qua: ${excelRows.length}`);
console.log(`Chế độ: ${APPLY ? "APPLY — ghi database" : "DRY-RUN — không ghi"}`);

let products;
try {
  products = await fetchAllProducts();
} catch (error) {
  if (/category_group/i.test(error.message || "")) {
    console.error(
      "Thiếu cột products.category_group. Chạy SQL:\n  scripts/sql-product-category-group.sql",
    );
  }
  throw error;
}

const bySlug = new Map();
const byName = new Map();
for (const p of products) {
  const slug = foldCode(p.slug);
  if (slug) bySlug.set(slug, p);
  const nameKey = normName(p.name);
  if (!nameKey) continue;
  if (!byName.has(nameKey)) byName.set(nameKey, []);
  byName.get(nameKey).push(p);
}

/** id → { group, how, prev } */
const planned = new Map();
const ok = [];
const missing = [];
const ambiguous = [];
const errors = [];

function setPlan(product, group, how) {
  const prevPlan = planned.get(product.id);
  const rank = { DICH_VU: 3, THUOC: 2, HANG_HOA: 1 };
  if (prevPlan && (rank[prevPlan.group] || 0) > (rank[group] || 0)) return;
  planned.set(product.id, {
    id: product.id,
    slug: product.slug,
    name: product.name,
    group,
    how,
    prev: product.category_group || null,
  });
}

for (const row of excelRows) {
  try {
    const result = matchProduct(row, bySlug, byName);
    if (result.status === "missing") {
      missing.push(row);
      continue;
    }
    if (result.status === "ambiguous_name" || result.status === "ambiguous_sku") {
      ambiguous.push({ row, result });
      continue;
    }
    const { product, how } = result.hit;
    let group = row.group;
    if (isForcedThuoc(product.slug, product.name) && group !== "DICH_VU") {
      group = "THUOC";
    }
    setPlan(product, group, how);
    ok.push({
      sku: row.oldSku || row.newSku,
      name: row.name,
      slug: product.slug,
      group,
      how,
    });
  } catch (error) {
    errors.push({
      sku: row.oldSku || row.newSku,
      name: row.name,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

// Mã không có trong Excel: thuốc bắt buộc / heuristic, còn lại hàng hóa
for (const p of products) {
  if (planned.has(p.id)) {
    const cur = planned.get(p.id);
    if (cur.group !== "DICH_VU" && isForcedThuoc(p.slug, p.name)) {
      setPlan(p, "THUOC", "force/heuristic");
    }
    continue;
  }
  if (isForcedThuoc(p.slug, p.name)) {
    setPlan(p, "THUOC", "force/heuristic");
  } else {
    setPlan(p, "HANG_HOA", "còn lại");
  }
}

const hideRows = products.filter(isGarbageAlias);
const hideIds = hideRows.map((p) => p.id);

const byGroup = { THUOC: [], HANG_HOA: [], DICH_VU: [] };
for (const item of planned.values()) {
  byGroup[item.group].push(item);
}

const countUnchanged = (list, group) =>
  list.filter((x) => x.prev === group).length;

console.log("\n--- Kế hoạch ---");
console.log(`Khớp Excel:    ${ok.length} dòng (thiếu ${missing.length}, mơ hồ ${ambiguous.length}, lỗi ${errors.length})`);
console.log(
  `  THUOC:       ${byGroup.THUOC.length} (đã đúng ${countUnchanged(byGroup.THUOC, "THUOC")})`,
);
console.log(
  `  HANG_HOA:    ${byGroup.HANG_HOA.length} (đã đúng ${countUnchanged(byGroup.HANG_HOA, "HANG_HOA")})`,
);
console.log(
  `  DICH_VU:     ${byGroup.DICH_VU.length} (đã đúng ${countUnchanged(byGroup.DICH_VU, "DICH_VU")})`,
);
console.log(`Ẩn mã rác:     ${hideIds.length}`);

const sampleForce = ["CĐTTGV1007", "HĐTHTR2012", "IT13V01", "IT23V01", "IT23V02", "MTH1001"];
console.log("\n--- Mã thuốc bắt buộc ---");
for (const sku of sampleForce) {
  const p = bySlug.get(foldCode(sku));
  if (!p) {
    console.log(`  ${sku}: KHÔNG TÌM THẤY`);
    continue;
  }
  const plan = planned.get(p.id);
  console.log(`  ${sku} → slug=${p.slug} | ${p.name} | ${plan?.group || "?"}`);
}

if (hideRows.length) {
  console.log("\n--- Ẩn (mã vạch/slug trùng name, không phải chữ) — tối đa 30 ---");
  for (const p of hideRows.slice(0, 30)) {
    console.log(`  ${p.slug} | ${p.name}`);
  }
  if (hideRows.length > 30) console.log(`  … và ${hideRows.length - 30} mã nữa`);
}

if (missing.length) {
  console.log("\n--- Không tìm thấy trong database (tối đa 20) ---");
  for (const row of missing.slice(0, 20)) {
    console.log(
      `  [${row.excelRow}] ${row.oldSku || "—"} | ${row.newSku || "—"} | ${row.name || "—"} | ${row.industry}`,
    );
  }
  if (missing.length > 20) console.log(`  … và ${missing.length - 20} dòng nữa`);
}

if (!APPLY) {
  console.log("\nChưa ghi DB. Chạy lại với --apply để cập nhật.");
  process.exit(0);
}

async function updateGroup(ids, group) {
  let updated = 0;
  for (const chunk of chunkList(ids, CHUNK)) {
    const { error, count } = await db
      .from("products")
      .update({ category_group: group }, { count: "exact" })
      .in("id", chunk);
    if (error) {
      throw new Error(`${group} batch ${chunk.length}: ${error.message}`);
    }
    updated += count ?? chunk.length;
    console.log(`  ${group}: +${chunk.length} (tổng ${updated})`);
  }
  return updated;
}

async function hideProducts(ids) {
  let updated = 0;
  for (const chunk of chunkList(ids, CHUNK)) {
    const { error, count } = await db
      .from("products")
      .update({ is_active: false }, { count: "exact" })
      .in("id", chunk);
    if (error) {
      throw new Error(`hide batch ${chunk.length}: ${error.message}`);
    }
    updated += count ?? chunk.length;
    console.log(`  Ẩn: +${chunk.length} (tổng ${updated})`);
  }
  return updated;
}

console.log("\n--- Ghi database ---");
try {
  const nThuoc = await updateGroup(
    byGroup.THUOC.map((x) => x.id),
    "THUOC",
  );
  const nHang = await updateGroup(
    byGroup.HANG_HOA.map((x) => x.id),
    "HANG_HOA",
  );
  const nDv = await updateGroup(
    byGroup.DICH_VU.map((x) => x.id),
    "DICH_VU",
  );
  const nHide = await hideProducts(hideIds);
  console.log(
    `\nXong. THUOC=${nThuoc}, HANG_HOA=${nHang}, DICH_VU=${nDv}, ẩn=${nHide}`,
  );
  if (missing.length) {
    console.log(`Còn ${missing.length} dòng Excel không khớp — xem log phía trên.`);
  }
} catch (error) {
  console.error("Update thất bại:", error instanceof Error ? error.message : error);
  process.exit(1);
}
