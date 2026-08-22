/**
 * Liệt kê user hiện có: id, email/username, role, kho.
 * node scripts/_list-users.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Thiếu VITE_SUPABASE_URL / SUPABASE_SECRET_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: listed, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
if (error) { console.error("listUsers:", error.message); process.exit(1); }
const users = listed.users || [];

const { data: whRows } = await admin.from("warehouses").select("id, code, name");
const whById = new Map((whRows || []).map((w) => [w.id, w.code || w.name]));

const { data: roleRows } = await admin.from("user_roles").select("user_id, role");
const roleByUser = new Map();
for (const r of roleRows || []) {
  const cur = roleByUser.get(r.user_id) || [];
  cur.push(r.role);
  roleByUser.set(r.user_id, cur);
}

const { data: profRows } = await admin.from("profiles").select("user_id, username, full_name, warehouse_id");
const profByUser = new Map((profRows || []).map((p) => [p.user_id, p]));

console.log(`Tổng auth users: ${users.length}\n`);
const rows = users
  .map((u) => {
    const p = profByUser.get(u.id) || {};
    const whId = p.warehouse_id ?? u.user_metadata?.warehouse_id ?? null;
    return {
      email: u.email || "(no email)",
      username: p.username || u.user_metadata?.username || "",
      name: p.full_name || u.user_metadata?.full_name || "",
      role: (roleByUser.get(u.id) || []).join(",") || "(none)",
      kho: whId ? whById.get(whId) || whId : "Tất cả",
      id: u.id,
      confirmed: !!u.email_confirmed_at,
      banned: !!u.banned_until,
      last: u.last_sign_in_at ? u.last_sign_in_at.slice(0, 10) : "-",
    };
  })
  .sort((a, b) => a.email.localeCompare(b.email));

for (const r of rows) {
  console.log(
    `${r.email.padEnd(26)} | ${String(r.username).padEnd(10)} | ${r.role.padEnd(12)} | ${String(r.kho).padEnd(8)} | conf=${r.confirmed ? "Y" : "N"} ban=${r.banned ? "Y" : "N"} | last=${r.last}`,
  );
  console.log(`  id=${r.id}  ${r.name}`);
}
