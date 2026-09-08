/**
 * Apply order_kind DT constraint via Management API.
 * node scripts/apply-order-kind-don-thuoc.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(
  path.join(ROOT, "scripts/sql-order-kind-don-thuoc.sql"),
  "utf8",
);

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
  if (!url || !serviceKey) return false;
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sample = await db
    .from("products")
    .select("slug, sku_industry, sku_detail, category_group")
    .eq("slug", "HCNXXX1003")
    .maybeSingle();
  console.log("sample HCNXXX1003:", sample.data || sample.error?.message);
  const kinds = await db.from("orders").select("order_kind").in("order_kind", ["DH", "DT", "DC"]).limit(3);
  console.log("orders kinds ok:", kinds.error ? kinds.error.message : "yes");
  return !kinds.error;
}

const applied = await applySql();
const ok = await verify();
if (!applied) {
  console.log(
    "\n⚠ SQL chưa apply tự động. Mở SQL Editor và Run:\n  scripts/sql-order-kind-don-thuoc.sql\n",
  );
}
process.exit(applied && ok ? 0 : 1);
