/**
 * Apply sql-fix-backend-upload.sql via Management API, then verify columns/write.
 * node scripts/apply-backend-upload-fix.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = path.join(ROOT, "scripts/sql-fix-backend-upload.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

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
loadEnv();

const url = process.env.VITE_SUPABASE_URL || "";
const ref =
  url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ||
  "zfzotqmksdstizmodtzz";
const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT;
const serviceKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function admin() {
  if (!url || !serviceKey) {
    throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function applySql() {
  if (!token) {
    console.log("No SUPABASE_ACCESS_TOKEN — skip Management API apply.");
    return false;
  }
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
  console.log("Management API:", res.status, text.slice(0, 800));
  return res.ok;
}

async function verify() {
  const db = admin();
  const slug = `__upload_probe_${Date.now()}`;
  const insert = await db
    .from("products")
    .insert({
      name: "PROBE upload fix",
      slug,
      price: 0,
      is_active: false,
      unit: "cái",
      stock_quantity: 0,
      is_new: true,
      unit_2: "Hộp",
      barcode_2: null,
      price_2: 1000,
      unit_2_ratio: 10,
    })
    .select("id, slug, unit_2, price_2, unit_2_ratio")
    .single();

  if (insert.error) {
    console.log("VERIFY insert products FAIL:", insert.error.message);
    const cols = await db
      .from("products")
      .select("id, slug, unit_2, barcode_2, price_2, unit_2_ratio, is_new")
      .limit(1);
    console.log(
      "products extra cols:",
      cols.error ? cols.error.message : Object.keys(cols.data?.[0] || {}),
    );
    return false;
  }

  console.log("VERIFY insert products OK:", insert.data);

  const soh = await db.from("stock_on_hand").select("*").limit(1);
  console.log(
    "stock_on_hand cols:",
    soh.error ? soh.error.message : Object.keys(soh.data?.[0] || {}),
  );

  await db.from("products").delete().eq("id", insert.data.id);
  console.log("VERIFY cleanup probe product OK");
  return true;
}

const applied = await applySql();
const ok = await verify();
if (!applied) {
  console.log(
    "\n⚠ SQL chưa apply tự động. Mở SQL Editor và Run:\n  scripts/sql-fix-backend-upload.sql\n",
  );
}
process.exit(ok ? 0 : 1);
