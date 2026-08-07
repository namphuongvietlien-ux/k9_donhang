/**
 * Đồng bộ lại warehouse_name trên sales_vouchers theo nhãn mới
 * (KD 06 = Q4 Cũ, KD 01 = Q4 Mới).
 *
 * node scripts/fix-sales-voucher-warehouse-labels.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
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

const url = process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const NAME_BY_CODE = {
  Q4_275: "Kho Địa điểm kinh doanh 01 (Q4 Mới)",
  Q4_178: "Kho Địa điểm kinh doanh 06 (Q4 Cũ)",
  Q7: "Kho Địa điểm kinh doanh Q7",
  Q8: "Kho Địa điểm kinh doanh 02",
  PH: "Kho Địa điểm kinh doanh 03",
  Q5: "Kho Địa điểm kinh doanh 04",
  Q1: "Kho Địa điểm kinh doanh 05",
};

async function main() {
  const { data: whs, error } = await supabase
    .from("warehouses")
    .select("id, code, name, short_name");
  if (error) throw error;

  for (const w of whs || []) {
    const name = NAME_BY_CODE[w.code] || w.name;
    const { count, error: uErr } = await supabase
      .from("sales_vouchers")
      .update({
        warehouse_name: name,
        warehouse_code: w.code,
      })
      .eq("warehouse_id", w.id)
      .select("id", { count: "exact", head: true });
    if (uErr) {
      // fallback without count
      const { error: u2 } = await supabase
        .from("sales_vouchers")
        .update({ warehouse_name: name, warehouse_code: w.code })
        .eq("warehouse_code", w.code);
      if (u2) console.error(`✗ ${w.code}:`, u2.message);
      else console.log(`✓ sales_vouchers by code ${w.code} → ${name}`);
      continue;
    }
    console.log(`✓ ${w.code} (${w.short_name}): updated vouchers → ${name}`);
  }

  // Also fix by warehouse_code when warehouse_id null
  for (const [code, name] of Object.entries(NAME_BY_CODE)) {
    await supabase
      .from("sales_vouchers")
      .update({ warehouse_name: name })
      .eq("warehouse_code", code);
  }

  const { data: sample } = await supabase
    .from("sales_vouchers")
    .select("voucher_code, warehouse_code, warehouse_name")
    .in("warehouse_code", ["Q4_178", "Q4_275"])
    .limit(6);
  console.log("\nSample:", sample);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
