/**
 * Seed tài khoản kho theo sheet GAS "Tài Khoản".
 *
 * Login: username (hoặc username@k9.local) + mật khẩu bên dưới.
 * Email nội bộ: {username}@k9.local
 *
 * Chạy (cần SUPABASE_SECRET_KEY trong .env):
 *   node scripts/seed-gas-accounts.mjs
 *
 * Vai trò:
 *   Admin / Tất cả  → super_admin, warehouse_id = null
 *   Chi nhánh       → staff, gắn warehouse theo mã kho
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
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

loadEnv();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error("Thiếu VITE_SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong .env");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EMAIL_DOMAIN = "k9.local";

/** username | password | role | warehouse_code (null = Tất cả) */
const ACCOUNTS = [
  { username: "admin", password: "123456", role: "super_admin", wh: null, name: "Admin" },
  { username: "hongvan", password: "van123", role: "super_admin", wh: null, name: "Hồng Vân" },
  { username: "thanhlam", password: "lam123456", role: "super_admin", wh: null, name: "Thanh Lâm" },
  { username: "275hd", password: "275hoangdieu", role: "staff", wh: "Q4_275", name: "CN KD 01 — Vĩnh Hội / 275 (Q4 Mới)" },
  { username: "k9178", password: "178hoangdieu", role: "staff", wh: "Q4_178", name: "CN KD 06 — 178 Hoàng Diệu (Q4 Cũ)" },
  { username: "k9thd", password: "7tranhungdao", role: "staff", wh: "Q5", name: "CN KD 04" },
  { username: "86dbt", password: "86duongbatrac", role: "staff", wh: "Q8", name: "CN KD 02" },
  { username: "140nvc", password: "140nguyenvancu", role: "staff", wh: "Q1", name: "CN KD 05" },
  { username: "237ph", password: "237phamhung", role: "staff", wh: "PH", name: "CN KD 03" },
  { username: "Q7", password: "123456", role: "staff", wh: "Q7", name: "CN Q7" },
];

async function main() {
  const { data: whRows, error: whErr } = await supabase
    .from("warehouses")
    .select("id, code");
  if (whErr) throw whErr;
  const whByCode = new Map(
    (whRows || []).map((w) => [w.code, w.id]),
  );

  console.log(`Seed ${ACCOUNTS.length} tài khoản → ${EMAIL_DOMAIN}\n`);

  for (const acc of ACCOUNTS) {
    const email = `${acc.username.toLowerCase()}@${EMAIL_DOMAIN}`;
    const warehouseId = acc.wh ? whByCode.get(acc.wh) || null : null;
    if (acc.wh && !warehouseId) {
      console.warn(`⚠ ${acc.username}: chưa có kho ${acc.wh} — bỏ qua gán kho`);
    }

    // Tìm user theo email
    const { data: listed } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    let userId = (listed?.users || []).find(
      (u) => (u.email || "").toLowerCase() === email,
    )?.id;

    if (!userId) {
      const { data: created, error: cErr } =
        await supabase.auth.admin.createUser({
          email,
          password: acc.password,
          email_confirm: true,
          user_metadata: {
            username: acc.username,
            full_name: acc.name,
            warehouse_id: warehouseId,
            warehouse_code: acc.wh,
            warehouse_label: acc.wh
              ? acc.name.replace(/^CN\s+/, "")
              : "Tất cả",
          },
        });
      if (cErr) {
        console.error(`✗ Tạo ${email}:`, cErr.message);
        continue;
      }
      userId = created.user?.id;
      console.log(`✓ Tạo auth ${email}`);
    } else {
      const { error: pErr } = await supabase.auth.admin.updateUserById(userId, {
        password: acc.password,
        email_confirm: true,
        user_metadata: {
          username: acc.username,
          full_name: acc.name,
          warehouse_id: warehouseId,
          warehouse_code: acc.wh,
          warehouse_label: acc.wh
            ? acc.name.replace(/^CN\s+/, "")
            : "Tất cả",
        },
      });
      if (pErr) console.warn(`  (mật khẩu) ${email}:`, pErr.message);
      else console.log(`↻ Cập nhật ${email}`);
    }

    if (!userId) continue;

    // Role
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error: rErr } = await supabase.from("user_roles").insert({
      user_id: userId,
      role: acc.role,
    });
    if (rErr) console.warn(`  role ${email}:`, rErr.message);

    // Profile — bảng dùng user_id (không phải id = auth uid)
    const profilePayload = {
      user_id: userId,
      full_name: acc.name,
    };
    const { data: existingProf } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    let prErr = null;
    if (existingProf?.id) {
      const r = await supabase
        .from("profiles")
        .update({
          full_name: acc.name,
          username: acc.username,
          warehouse_id: warehouseId,
        })
        .eq("user_id", userId);
      prErr = r.error;
      if (prErr && /username|warehouse_id/i.test(prErr.message || "")) {
        const r2 = await supabase
          .from("profiles")
          .update({ full_name: acc.name })
          .eq("user_id", userId);
        prErr = r2.error;
        if (!prErr) {
          console.warn(
            `  profile ${email}: thiếu cột username/warehouse_id — chạy migration 000010`,
          );
        }
      }
    } else {
      const r = await supabase.from("profiles").insert({
        ...profilePayload,
        username: acc.username,
        warehouse_id: warehouseId,
      });
      prErr = r.error;
      if (prErr && /username|warehouse_id/i.test(prErr.message || "")) {
        const r2 = await supabase.from("profiles").insert(profilePayload);
        prErr = r2.error;
        if (!prErr) {
          console.warn(
            `  profile ${email}: thiếu cột username/warehouse_id — chạy migration 000010`,
          );
        }
      }
    }
    if (prErr) console.warn(`  profile ${email}:`, prErr.message);

    console.log(
      `  → ${acc.username} / ${acc.password} · ${acc.role} · ${
        acc.wh || "Tất cả"
      }`,
    );
  }

  console.log("\nĐăng nhập portal: nhập username (admin) hoặc email (admin@k9.local)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
