/**
 * CHỈ ĐỌC — dump toàn bộ products hiện tại ra file local trước khi restore PITR.
 * Bảo hiểm: nếu restore ra kết quả không như mong đợi, vẫn còn bản 3062 mã này.
 *   node scripts/_dump-products-before-pitr.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("products")
    .select("*")
    .order("id", { ascending: true })
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  rows.push(...(data || []));
  if (!data || data.length < 1000) break;
}

const out = path.join(ROOT, "scripts", "_products-snapshot-pre-pitr.json");
fs.writeFileSync(out, JSON.stringify(rows, null, 0), "utf8");
console.log(`Đã dump ${rows.length} dòng products → ${out}`);
console.log(`Dung lượng: ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB`);

// CSV gọn để mở bằng Excel khi cần đối chiếu
const cols = ["id", "slug", "parent_sku", "name", "barcode", "barcode_2", "unit", "unit_2", "price", "is_active", "is_new", "created_at"];
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
const outCsv = path.join(ROOT, "scripts", "_products-snapshot-pre-pitr.csv");
fs.writeFileSync(outCsv, "﻿" + csv, "utf8");
console.log(`CSV đối chiếu → ${outCsv}`);
