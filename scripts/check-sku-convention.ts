/**
 * Kiểm tra danh mục (CSV / XLSX) theo quy ước mã HV 10 ký tự (SKU_mapping_HV_10ky_tu_v2.xlsx).
 *
 * Chạy:  npx tsx --tsconfig tsconfig.app.json scripts/check-sku-convention.ts <file1> [file2 …]
 *        (thêm --csv <out.csv> để xuất danh sách nhóm cần bổ sung quy ước)
 *
 * Nhận file "mau-nhap-khau-danh-muc" (Mã hàng / Tên hàng) hoặc "Danh sách hàng hóa"
 * KiotViet (Mã hàng hóa / Tên hàng hóa). Mã biến thể `XXX-01` được gom về mã gốc.
 */
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import {
  baseSkuOf,
  categoryGroupLabel,
  classifySkuByConvention,
  conventionGapsToCsv,
  conventionStatusLabel,
  findConventionGaps,
  type SkuConventionStatus,
} from "@/lib/skuConvention";

type Row = { sku: string; name: string };

function pickCol(header: string[], candidates: string[]): number {
  const norm = (s: string) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const h = header.map(norm);
  for (const c of candidates) {
    const idx = h.findIndex((x) => x === norm(c));
    if (idx >= 0) return idx;
  }
  for (const c of candidates) {
    const idx = h.findIndex((x) => x.includes(norm(c)));
    if (idx >= 0) return idx;
  }
  return -1;
}

function readRows(file: string): Row[] {
  const ext = path.extname(file).toLowerCase();
  let matrix: string[][] = [];
  if (ext === ".csv") {
    const text = fs.readFileSync(file, "utf8");
    matrix = Papa.parse<string[]>(text, { skipEmptyLines: true }).data;
  } else {
    const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    matrix = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
  }
  // Tìm dòng header (có cột mã hàng)
  let headerIdx = -1;
  let skuCol = -1;
  let nameCol = -1;
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const h = (matrix[i] || []).map((x) => String(x ?? ""));
    const s = pickCol(h, ["Mã hàng hóa", "Mã hàng", "SKU", "Mã SP", "Mã"]);
    if (s >= 0) {
      headerIdx = i;
      skuCol = s;
      nameCol = pickCol(h, ["Tên hàng hóa", "Tên hàng", "Tên", "Tên gốc"]);
      break;
    }
  }
  if (headerIdx < 0) throw new Error(`${file}: không tìm thấy cột Mã hàng`);
  const rows: Row[] = [];
  for (const r of matrix.slice(headerIdx + 1)) {
    const sku = String(r?.[skuCol] ?? "").trim();
    if (!sku) continue;
    rows.push({ sku, name: nameCol >= 0 ? String(r?.[nameCol] ?? "").trim() : "" });
  }
  return rows;
}

const args = process.argv.slice(2);
const csvOutIdx = args.indexOf("--csv");
const csvOut = csvOutIdx >= 0 ? args[csvOutIdx + 1] : "";
const files = args.filter(
  (a, i) => a !== "--csv" && !(csvOutIdx >= 0 && i === csvOutIdx + 1),
);
if (!files.length) {
  console.error("Cách dùng: npx tsx --tsconfig tsconfig.app.json scripts/check-sku-convention.ts <file.csv|xlsx> … [--csv out.csv]");
  process.exit(1);
}

const all: Row[] = [];
for (const f of files) {
  const rows = readRows(f);
  console.log(`# ${f}: ${rows.length} dòng`);
  all.push(...rows);
}

// Gom về mã gốc (bỏ biến thể -01, -02…)
const bySku = new Map<string, Row>();
for (const r of all) {
  const base = baseSkuOf(r.sku);
  if (!bySku.has(base)) bySku.set(base, { sku: base, name: r.name });
}
const rows = [...bySku.values()];

const byStatus: Record<SkuConventionStatus, number> = {
  hv: 0,
  "hv-unknown-group": 0,
  "hv-invalid-merch": 0,
  short: 0,
  "short-proposed": 0,
  "short-unknown": 0,
  legacy: 0,
  other: 0,
};
const byCategory: Record<string, number> = {};
const otherSamples: Row[] = [];
for (const r of rows) {
  const c = classifySkuByConvention(r.sku);
  byStatus[c.status] += 1;
  const cg = categoryGroupLabel(c.categoryGroup);
  byCategory[cg] = (byCategory[cg] || 0) + 1;
  if ((c.status === "other" || c.status === "short-unknown") && otherSamples.length < 15) {
    otherSamples.push(r);
  }
}

console.log(`\n== ${rows.length} mã gốc (đã gom biến thể)`);
console.log(`  Đúng quy ước HV            : ${byStatus.hv}`);
console.log(`  HV nhưng nhóm chưa có      : ${byStatus["hv-unknown-group"]}`);
console.log(`  HV nhưng nhóm HH ngoài QU  : ${byStatus["hv-invalid-merch"]}`);
console.log(`  Mã ngắn (Quy_tac_HV)       : ${byStatus.short}`);
console.log(`  Mã ngắn mới (tạm ánh xạ)   : ${byStatus["short-proposed"]}`);
console.log(`  Mã ngắn chưa có ánh xạ     : ${byStatus["short-unknown"]}`);
console.log(`  Mã cũ 2+2+2+4              : ${byStatus.legacy}`);
console.log(`  Không theo quy ước         : ${byStatus.other}`);
console.log(`\n== Nhóm hàng suy ra`);
for (const [k, v] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(10)}: ${v}`);
}

const gaps = findConventionGaps(rows);
console.log(`\n== Cần bổ sung vào quy ước: ${gaps.length} nhóm / tiền tố`);
for (const g of gaps) {
  console.log(
    `  ${g.key.padEnd(7)} ×${String(g.count).padStart(3)}  ${conventionStatusLabel(g.status)}  [${g.industry} → ${categoryGroupLabel(g.categoryGroup)}]  vd: ${g.samples
      .slice(0, 2)
      .map((s) => `${s.sku} ${s.name.slice(0, 40)}`)
      .join(" | ")}`,
  );
}

if (otherSamples.length) {
  console.log(`\n== Ví dụ mã không theo quy ước / chưa ánh xạ (${byStatus.other + byStatus["short-unknown"]}):`);
  for (const r of otherSamples) console.log(`  ${r.sku}  ${r.name}`);
}

if (csvOut) {
  fs.writeFileSync(csvOut, "\ufeff" + conventionGapsToCsv(gaps), "utf8");
  console.log(`\nĐã ghi ${csvOut}`);
}
