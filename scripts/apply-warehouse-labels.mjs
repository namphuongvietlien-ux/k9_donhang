/**
 * Apply warehouse address / Q4 labels + optional profile columns via Supabase REST
 * (không cần psql — dùng service role).
 *
 * node scripts/apply-warehouse-labels.mjs
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

const UPDATES = [
  {
    code: "Q7",
    short_name: "Q7",
    print_name: "Q7",
    name: "Kho Địa điểm kinh doanh Q7",
    address: "269A đường Lê Văn Lương, P. Tân Hưng, TP.HCM, Việt Nam",
  },
  {
    code: "Q8",
    short_name: "Q8",
    print_name: "Q8",
    name: "Kho Địa điểm kinh doanh 02",
    address: "86A-88 đường Dương Bá Trạc, P. Chánh Hưng, TP.HCM",
  },
  {
    code: "PH",
    short_name: "PH",
    print_name: "PH",
    name: "Kho Địa điểm kinh doanh 03",
    address: "237-239 Phạm Hùng, P.Chánh Hưng, TP.HCM",
  },
  {
    code: "Q5",
    short_name: "Q5",
    print_name: "Q5",
    name: "Kho Địa điểm kinh doanh 04",
    address: "7 Trần Hưng Đạo, Phường An Đông, TP.Hồ Chí Minh",
  },
  {
    code: "Q1",
    short_name: "Q1",
    print_name: "Q1",
    name: "Kho Địa điểm kinh doanh 05",
    address: "140 đường Nguyễn Văn Cừ, P. Cầu Ông Lãnh, TP.HCM",
  },
  {
    code: "Q4_178",
    short_name: "Q4 Cũ",
    print_name: "Q4 Cũ",
    name: "Kho Địa điểm kinh doanh 06 (Q4 Cũ)",
    address: "178 đường Hoàng Diệu, Phường Khánh Hội, TPHCM",
  },
  {
    code: "Q4_275",
    short_name: "Q4 Mới",
    print_name: "Q4 Mới",
    name: "Kho Địa điểm kinh doanh 01 (Q4 Mới)",
    address:
      "L22-24 Cư Xá Vĩnh Hội, đường Hoàng Diệu, phường Khánh Hội, TP Hồ Chí Minh, Việt Nam.",
  },
];

async function main() {
  // Thử update kèm cột address — nếu thiếu cột thì báo rõ
  for (const row of UPDATES) {
    const { code, ...patch } = row;
    const { error } = await supabase
      .from("warehouses")
      .update(patch)
      .eq("code", code);
    if (error) {
      console.error(`✗ ${code}:`, error.message);
      if (/address|short_name|print_name/i.test(error.message)) {
        console.error(
          "\n→ Cột address/short_name chưa có trên DB.\n" +
            "  Mở Supabase Dashboard → SQL Editor → dán nội dung file:\n" +
            "  supabase/migrations/20250110000010_warehouses_address_q4_profiles.sql\n" +
            "  rồi chạy lại: node scripts/apply-warehouse-labels.mjs\n",
        );
        process.exit(1);
      }
    } else {
      console.log(
        `✓ ${code} → ${patch.short_name} | ${patch.address}`,
      );
    }
  }

  const { data } = await supabase
    .from("warehouses")
    .select("code, short_name, address")
    .in("code", ["Q4_178", "Q4_275"]);
  console.log("\nKiểm tra Q4:", data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
