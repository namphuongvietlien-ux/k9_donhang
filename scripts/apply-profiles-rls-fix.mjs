/**
 * Apply profiles RLS fix + get_my_store_scope via Supabase Management API
 * (needs SUPABASE_ACCESS_TOKEN) OR print SQL for manual run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const sqlPath = path.join(ROOT, "scripts/sql-fix-profiles-rls-store-scope.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const url = process.env.VITE_SUPABASE_URL || "";
const ref = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT;
const serviceKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

async function tryManagementApi() {
  if (!token || !ref) return false;
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

async function verifyRpc() {
  if (!url || !serviceKey) return;
  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  // Sign in as branch user to test? Service role rpc with no auth.uid() returns empty.
  // Just check function exists via pg catalog — not available.
  const { error } = await sb.rpc("get_my_store_scope");
  console.log(
    "RPC get_my_store_scope:",
    error ? `missing/err: ${error.message}` : "OK (callable)",
  );
}

const ok = await tryManagementApi();
if (!ok) {
  console.log(
    "\n⚠ Chưa apply được tự động. Mở Supabase SQL Editor và chạy file:\n  scripts/sql-fix-profiles-rls-store-scope.sql\n",
  );
}
await verifyRpc();
