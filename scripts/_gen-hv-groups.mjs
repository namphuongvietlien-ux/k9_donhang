import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "SKU_mapping_HV_10ky_tu_v2.xlsx");
const OUT = path.join(ROOT, "src/lib/skuHvGroups.ts");

const wb = XLSX.readFile(SRC);
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Ket_qua"], { defval: "" });
const groups = new Map();
const re = /^([CMH])([A-Z\u0110]{2})([A-Z\u0110]{3})$/i;

function merchToIndustry(merch, spec) {
  const m = merch.toUpperCase();
  const s = spec.toUpperCase();
  if (m === "TP") return "TA";
  if (m === "CN") return "YT";
  if (m === "CA" || m === "VS") return "VS";
  if (m === "\u0110C") return "DC";
  if (m === "DC") return "PK";
  if (m === "PK") {
    if (s === "AQU" || s === "TTR" || s === "GIY") return "TT";
    return "PK";
  }
  if (m === "VC") return "PK";
  if (m === "\u0110T") return "YT";
  if (m === "VT") return "VT";
  if (m === "DV") return "DV";
  return "KHAC";
}

for (const r of rows) {
  const g = String(r["Nhóm HV (6 chữ)"] || "")
    .trim()
    .toUpperCase();
  const name = String(r["Tên nhóm"] || "").trim();
  if (!g) continue;
  const cur = groups.get(g) || { title: "" };
  if (name && name !== g) cur.title = name;
  groups.set(g, cur);
}

const items = [...groups.entries()].sort((a, b) =>
  a[0].localeCompare(b[0], "vi"),
);

const lines = [];
for (const [code, v] of items) {
  const m = code.match(re);
  if (!m) throw new Error(`Không parse được nhóm HV: ${code}`);
  const species = m[1].toUpperCase();
  const merch = m[2].toUpperCase();
  const spec = m[3].toUpperCase();
  const industry = merchToIndustry(merch, spec);
  const title = v.title || code;
  lines.push(
    `  ${JSON.stringify(code)}: { title: ${JSON.stringify(title)}, industry: ${JSON.stringify(industry)}, species: ${JSON.stringify(species)}, merch: ${JSON.stringify(merch)}, spec: ${JSON.stringify(spec)} },`,
  );
}

const out = `/** Nhóm HV 6 chữ — sinh từ SKU_mapping_HV_10ky_tu_v2.xlsx sheet Ket_qua. */

export type HvIndustryCode =
  | "TA"
  | "VS"
  | "DC"
  | "YT"
  | "TT"
  | "PK"
  | "VT"
  | "DV"
  | "KHAC";

export type HvGroupMeta = {
  title: string;
  industry: HvIndustryCode;
  species: string;
  merch: string;
  spec: string;
};

export const HV_GROUPS: Record<string, HvGroupMeta> = {
${lines.join("\n")}
};
`;

fs.writeFileSync(OUT, out, "utf8");
console.log("wrote", OUT, lines.length, "groups");
