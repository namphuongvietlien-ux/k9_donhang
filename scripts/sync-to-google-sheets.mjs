/**
 * Đồng bộ delta mới từ Supabase → Google Sheet (1 lần/ngày hoặc on-demand).
 *
 * Cài dependency (một lần):
 *   npm i googleapis
 *
 * Env (.env):
 *   SUPABASE_URL
 *   SUPABASE_SECRET_KEY
 *   GOOGLE_SHEETS_ID
 *   GOOGLE_SERVICE_ACCOUNT_JSON=./secrets/google-service-account.json
 *
 * Chạy:
 *   node scripts/sync-to-google-sheets.mjs --dry-run
 *   node scripts/sync-to-google-sheets.mjs
 *   node scripts/sync-to-google-sheets.mjs --since=2026-08-01T00:00:00.000Z
 *
 * Lịch hàng ngày 02:00 VN (cron UTC 19:00 hôm trước):
 *   0 19 * * * cd /path/vinon-master && node scripts/sync-to-google-sheets.mjs >> logs/sheets-sync.log 2>&1
 *
 * Cursor lưu trên sheet tab `sync_cursor` (key | last_synced_at) — chỉ APPEND dòng mới.
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

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const sinceArg = args.find((a) => a.startsWith("--since="));
const FORCE_SINCE = sinceArg ? sinceArg.slice("--since=".length) : null;

const CURSOR_SHEET = "sync_cursor";
const SHEET_ORDERS = "Lịch Sử Xuất Kho";
const SHEET_SALES = "Xuất Bán Hàng";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fmtTs(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || "");
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

async function getSheetsApi() {
  let google;
  try {
    google = await import("googleapis");
  } catch {
    throw new Error(
      "Chưa cài googleapis. Chạy: npm i googleapis\nRồi tạo Service Account + share Sheet với client_email.",
    );
  }
  const jsonPath =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    path.join(ROOT, "secrets", "google-service-account.json");
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Thiếu file credentials: ${jsonPath}`);
  }
  const creds = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const auth = new google.google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.google.sheets({ version: "v4", auth });
}

async function readCursor(sheets, spreadsheetId) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${CURSOR_SHEET}!A2:B20`,
    });
    const map = {};
    for (const r of res.data.values || []) {
      if (r[0]) map[String(r[0])] = String(r[1] || "");
    }
    return map;
  } catch {
    return {};
  }
}

async function writeCursor(sheets, spreadsheetId, patch) {
  const cur = await readCursor(sheets, spreadsheetId);
  Object.assign(cur, patch);
  const values = [["key", "last_synced_at"], ...Object.entries(cur)];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${CURSOR_SHEET}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

async function appendRows(sheets, spreadsheetId, sheetName, rows) {
  if (!rows.length) return 0;
  if (DRY || !sheets) {
    console.log(`  [dry-run] ${rows.length} dòng → ${sheetName}`);
    return rows.length;
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:P`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
  return rows.length;
}

async function syncOrders(supabase, sheets, spreadsheetId, sinceIso) {
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id, order_code, order_kind, status, created_at, updated_at,
      source_warehouse:source_warehouse_id ( code ),
      warehouse:warehouse_id ( code ),
      order_items ( product_name, product_slug, barcode, unit, quantity, qty_requested, qty_packed )
    `,
    )
    .gte("updated_at", sinceIso)
    .order("updated_at", { ascending: true })
    .limit(2000);
  if (error) throw error;

  const out = [];
  let maxTs = sinceIso;
  for (const o of data || []) {
    const ts = o.updated_at || o.created_at;
    if (ts > maxTs) maxTs = ts;
    for (const it of o.order_items || []) {
      out.push([
        fmtTs(o.created_at),
        o.order_code || "",
        o.order_kind || "",
        o.source_warehouse?.code || "",
        o.warehouse?.code || "",
        it.product_slug || "",
        it.barcode || "",
        it.product_name || "",
        it.unit || "",
        it.qty_requested ?? it.quantity ?? 0,
        it.qty_packed ?? "",
        o.status || "",
        fmtTs(ts),
      ]);
    }
  }
  const n = await appendRows(sheets, spreadsheetId, SHEET_ORDERS, out);
  console.log(`→ DH/DC: ${n} dòng (max ${maxTs})`);
  return maxTs;
}

async function syncSales(supabase, sheets, spreadsheetId, sinceIso) {
  const { data, error } = await supabase
    .from("sales_vouchers")
    .select(
      `
      voucher_code, invoice_no, warehouse_code, warehouse_name,
      status, created_by, created_at, updated_at,
      sales_voucher_items (
        product_slug, barcode, product_name, unit, quantity,
        unit_price, line_total, line_kind, service_cost, line_notes
      )
    `,
    )
    .gte("updated_at", sinceIso)
    .order("updated_at", { ascending: true })
    .limit(2000);
  if (error) {
    if (/sales_vouchers|relation/i.test(error.message)) {
      console.warn("⚠ Chưa migration sales_vouchers — bỏ qua XB");
      return sinceIso;
    }
    throw error;
  }

  const out = [];
  let maxTs = sinceIso;
  for (const v of data || []) {
    const ts = v.updated_at || v.created_at;
    if (ts > maxTs) maxTs = ts;
    for (const it of v.sales_voucher_items || []) {
      out.push([
        fmtTs(v.created_at),
        v.invoice_no || "",
        v.voucher_code || "",
        v.warehouse_name || v.warehouse_code || "",
        it.product_slug || "",
        it.barcode || "",
        it.product_name || "",
        it.unit || "",
        it.quantity ?? 0,
        v.created_by || "",
        it.line_notes || "",
        v.status || "Đã lưu",
        it.unit_price ?? "",
        it.line_total ?? "",
        it.line_kind || "HANG",
        it.service_cost ?? "",
      ]);
    }
  }
  const n = await appendRows(sheets, spreadsheetId, SHEET_SALES, out);
  console.log(`→ Xuất bán: ${n} dòng (max ${maxTs})`);
  return maxTs;
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!url || !key) throw new Error("Thiếu SUPABASE_URL / SUPABASE_SECRET_KEY");

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  let sheets = null;
  if (!DRY) {
    if (!spreadsheetId) throw new Error("Thiếu GOOGLE_SHEETS_ID");
    sheets = await getSheetsApi();
  }

  const cursor = sheets ? await readCursor(sheets, spreadsheetId) : {};
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - 1);
  const sinceOrders =
    FORCE_SINCE || cursor.orders || fallback.toISOString();
  const sinceSales = FORCE_SINCE || cursor.sales || fallback.toISOString();

  console.log(
    `Sync orders≥${sinceOrders} | sales≥${sinceSales}${DRY ? " [dry-run]" : ""}`,
  );

  const maxOrders = await syncOrders(
    supabase,
    sheets,
    spreadsheetId,
    sinceOrders,
  );
  const maxSales = await syncSales(
    supabase,
    sheets,
    spreadsheetId,
    sinceSales,
  );

  if (sheets && !DRY) {
    await writeCursor(sheets, spreadsheetId, {
      orders: maxOrders,
      sales: maxSales,
    });
  }

  console.log("✅ Xong. Lịch gợi ý 02:00 VN: cron `0 19 * * *` (UTC).");
}

main().catch((e) => {
  console.error("❌", e.message || e);
  process.exit(1);
});
