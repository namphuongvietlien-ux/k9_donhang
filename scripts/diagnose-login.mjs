/**
 * Diagnose GAS account login issues.
 * node scripts/diagnose-login.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(ROOT, ".env");
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

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const anon =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!url || !key || !anon) {
  console.error("Missing URL / SECRET / ANON key");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: listed, error } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 200,
});
if (error) {
  console.error("listUsers:", error.message);
  process.exit(1);
}

const users = listed.users || [];
console.log("Total auth users:", users.length);
const gas = users.filter(
  (u) =>
    (u.email || "").endsWith("@k9.local") ||
    u.user_metadata?.username,
);
console.log("GAS-like (@k9.local / username meta):", gas.length);
for (const u of gas) {
  console.log(
    "-",
    u.email,
    "confirmed=",
    !!u.email_confirmed_at,
    "banned=",
    !!u.banned_until,
  );
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", u.id);
  console.log("  roles:", roles);
  const { data: can, error: canErr } = await admin.rpc("can_access_admin", {
    _user_id: u.id,
  });
  console.log("  can_access_admin:", can, canErr?.message || "");
}

const client = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const trials = [
  ["admin@k9.local", "123456"],
  ["Q7@k9.local", "123456"],
  ["hongvan@k9.local", "van123"],
];

console.log("\nPassword login tests:");
for (const [email, pass] of trials) {
  const { data, error: e } = await client.auth.signInWithPassword({
    email,
    password: pass,
  });
  if (e) {
    console.log("FAIL", email, "→", e.message, e.status || "");
  } else {
    console.log("OK  ", email, "id=", data.user?.id?.slice(0, 8));
    const uid = data.user?.id;
    const { data: can } = await client.rpc("can_access_admin", {
      _user_id: uid,
    });
    console.log("     can_access_admin (as user):", can);
    await client.auth.signOut();
  }
}

// Also list any admin* emails that are NOT k9.local
console.log("\nOther admin-like emails:");
for (const u of users) {
  const em = (u.email || "").toLowerCase();
  if (em.includes("admin") || em.includes("hongvan") || em === "q7@k9.local") {
    if (!(u.email || "").endsWith("@k9.local")) {
      console.log("-", u.email);
    }
  }
}
