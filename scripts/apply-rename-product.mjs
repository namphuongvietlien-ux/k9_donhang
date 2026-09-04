/**
 * Apply rename-product-everywhere SQL via Management API.
 * node scripts/apply-rename-product.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(
  path.join(ROOT, "scripts/sql-rename-product-everywhere.sql"),
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

if (!token) {
  console.error("Thiếu SUPABASE_ACCESS_TOKEN / SUPABASE_PAT");
  process.exit(1);
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
console.log("Management API:", res.status, text.slice(0, 1200));
if (!res.ok) process.exit(1);
