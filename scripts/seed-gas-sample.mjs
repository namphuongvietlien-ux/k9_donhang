/**
 * Seed dữ liệu mẫu từ Excel Google Sheet cũ (GAS workbook).
 *
 * Nguồn mặc định: scripts/sample-data/transfers.xlsx
 *   - Data_Excel     → products
 *   - TON_Q7         → stock_on_hand (kho Q7)
 *   - Lịch Sử Xuất Kho → orders + order_items (DH/DC mẫu)
 *
 * Chạy:
 *   node scripts/seed-gas-sample.mjs
 *   node scripts/seed-gas-sample.mjs --skip-orders
 *   node scripts/seed-gas-sample.mjs --max-orders=40
 *
 * Cần SUPABASE_SECRET_KEY (hoặc SERVICE_ROLE) trong .env
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SAMPLE = path.join(__dirname, "sample-data", "transfers.xlsx");

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
const SKIP_ORDERS = args.includes("--skip-orders");
const SKIP_STOCK = args.includes("--skip-stock");
const SKIP_CATALOG = args.includes("--skip-catalog");
const maxOrdersArg = args.find((a) => a.startsWith("--max-orders="));
const MAX_ORDERS = maxOrdersArg
  ? Number(maxOrdersArg.split("=")[1]) || 149
  : 149;

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error(
    "Thiếu VITE_SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong .env",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Map địa chỉ / tên kho GAS → code warehouses */
const WH_RULES = [
  { code: "Q7", re: /q7|le van luong|lê văn lương|tan hung|tân hưng/i },
  { code: "Q8", re: /q8|duong ba trac|dương bá trạc|kinh doanh 02/i },
  { code: "PH", re: /\bph\b|pham hung|phạm hùng|kinh doanh 03/i },
  { code: "Q5", re: /q5|nguyen van cu|nguyễn văn từ|nguyễn văn cừ|kinh doanh 04/i },
  { code: "Q1", re: /q1|tran hung dao|trần hưng đạo|an dong|kinh doanh 05/i },
  { code: "Q4_275", re: /275|vinh hoi|vĩnh hội|kinh doanh 01|q4 mới|q4 moi/i },
  { code: "Q4_178", re: /178|kinh doanh 06|q4 cũ|q4 cu/i },
];

function resolveWhCode(raw) {
  const s = String(raw || "").trim();
  if (!s || /^không rõ$/i.test(s) || /tổng công ty/i.test(s)) return null;
  for (const r of WH_RULES) {
    if (r.re.test(s)) return r.code;
  }
  if (/địa điểm kinh doanh q7/i.test(s)) return "Q7";
  return null;
}

function normalizeCode(v) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** Excel scientific barcode → full digit string */
function cellToSku(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Math.abs(v) >= 1e11) return Math.round(v).toString();
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  const s = String(v).trim();
  if (/^\d+\.?\d*e\+\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return Math.round(n).toString();
  }
  return s;
}

function mapStatus(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s) return "pending";
  if (s.includes("hủy") || s.includes("huy")) return "cancelled";
  if (s.includes("nhận") || s.includes("nhan") || s.includes("xác nhận"))
    return "completed";
  if (s.includes("soạn") || s.includes("soan") || s.includes("đang xử"))
    return "processing";
  if (s.includes("mới") || s.includes("moi")) return "pending";
  return "pending";
}

function inferKind(soPhieu) {
  const c = String(soPhieu || "").toUpperCase();
  if (c.startsWith("DH-") || c.includes("DH-")) return "DH";
  if (c.includes("ĐC") || c.includes("DC") || c.startsWith("Q7-")) return "DC";
  return null;
}

function normalizeOrderCode(soPhieu) {
  let c = String(soPhieu || "").trim();
  c = c.replace(/^Số:\s*/i, "").trim();
  // Q7-ĐC123 → giữ nguyên (hiển thị GAS); order_kind=DC
  return c;
}

function sheetMatrix(wb, name) {
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error(`Không thấy sheet "${name}"`);
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
  });
}

async function chunked(items, size, fn) {
  let n = 0;
  for (let i = 0; i < items.length; i += size) {
    n += await fn(items.slice(i, i + size));
  }
  return n;
}

async function ensureWarehouses() {
  const seeds = [
    { code: "Q7", name: "Kho Địa điểm kinh doanh Q7", sort_order: 1 },
    { code: "Q8", name: "Kho Địa điểm kinh doanh 02", sort_order: 2 },
    { code: "PH", name: "Kho Địa điểm kinh doanh 03", sort_order: 3 },
    { code: "Q5", name: "Kho Địa điểm kinh doanh 04", sort_order: 4 },
    { code: "Q1", name: "Kho Địa điểm kinh doanh 05", sort_order: 5 },
    { code: "Q4_275", name: "Kho Địa điểm kinh doanh 01 (Q4 Mới)", sort_order: 6 },
    { code: "Q4_178", name: "Kho Địa điểm kinh doanh 06 (Q4 Cũ)", sort_order: 7 },
  ];
  const { error } = await supabase.from("warehouses").upsert(seeds, {
    onConflict: "code",
  });
  if (error) throw new Error(`warehouses: ${error.message}`);

  const { data, error: e2 } = await supabase
    .from("warehouses")
    .select("id, code");
  if (e2) throw e2;
  const byCode = new Map();
  for (const w of data || []) byCode.set(w.code, w.id);
  console.log(`✓ warehouses: ${byCode.size}`);
  return byCode;
}

async function seedCatalog(wb) {
  const rows = sheetMatrix(wb, "Data_Excel");
  if (!rows.length) throw new Error("Data_Excel trống");
  const header = rows[0].map((h) => String(h || "").toLowerCase());
  const iMa = header.findIndex((h) => h.includes("mã hàng") && !h.includes("vạch"));
  const iTen = header.findIndex((h) => h.includes("tên"));
  const iDvt = header.findIndex((h) => h === "đvt" || h.includes("đvt"));
  const iDvt2 = header.findIndex(
    (h) =>
      h.includes("donvitinh2") ||
      h.includes("đvt2") ||
      h.includes("dvt2") ||
      (h.includes("đvt") && h.includes("2")),
  );
  const iParent = header.findIndex((h) => h.includes("parent"));
  const iBarcode = header.findIndex((h) => h.includes("vạch"));

  const bySlug = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const ma = cellToSku(row[iMa >= 0 ? iMa : 0]);
    if (!ma || ma.toLowerCase() === "mã hàng") continue;
    const slug = normalizeCode(ma) || ma;
    if (bySlug.has(slug)) continue;
    const ten = String(row[iTen >= 0 ? iTen : 2] || ma).trim();
    const dvt = String(row[iDvt >= 0 ? iDvt : 3] || "cái").trim() || "cái";
    const dvt2 =
      iDvt2 >= 0 ? String(row[iDvt2] || "").trim() : "";
    const parent =
      iParent >= 0 ? cellToSku(row[iParent]) : "";
    const barcode =
      iBarcode >= 0 ? cellToSku(row[iBarcode]) : "";
    bySlug.set(slug, {
      name: ten || ma,
      slug,
      unit: dvt,
      unit_2: dvt2 || null,
      barcode: barcode || null,
      barcode_2: null,
      price: 0,
      is_active: true,
      stock_quantity: 0,
      description: parent
        ? `Seed GAS Data_Excel (Parent: ${parent})`
        : "Seed GAS Data_Excel",
    });
  }

  const list = [...bySlug.values()];
  console.log(`→ catalog unique SKUs: ${list.length}`);

  // Load existing
  const existing = new Map();
  for (let i = 0; i < list.length; i += 200) {
    const slugs = list.slice(i, i + 200).map((p) => p.slug);
    const { data } = await supabase.from("products").select("id, slug").in("slug", slugs);
    for (const p of data || []) existing.set(normalizeCode(p.slug), p.id);
  }

  // Update barcode/unit cho SP đã có
  let updatedMeta = 0;
  for (const p of list) {
    const id = existing.get(normalizeCode(p.slug));
    if (!id) continue;
    if (!p.barcode && !p.unit && !p.unit_2) continue;
    const patch = {};
    if (p.barcode) patch.barcode = p.barcode;
    if (p.unit) patch.unit = p.unit;
    if (p.unit_2) patch.unit_2 = p.unit_2;
    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (!error) updatedMeta++;
  }
  if (updatedMeta) console.log(`→ cập nhật barcode/unit: ${updatedMeta}`);

  const toCreate = list.filter((p) => !existing.has(normalizeCode(p.slug)));
  let created = 0;
  await chunked(toCreate, 80, async (slice) => {
    const { data, error } = await supabase
      .from("products")
      .insert(slice)
      .select("id, slug");
    if (error) {
      // fallback one-by-one
      for (const p of slice) {
        const { data: one, error: e1 } = await supabase
          .from("products")
          .insert(p)
          .select("id, slug")
          .single();
        if (e1) {
          const { data: found } = await supabase
            .from("products")
            .select("id, slug")
            .eq("slug", p.slug)
            .maybeSingle();
          if (found) existing.set(normalizeCode(found.slug), found.id);
        } else if (one) {
          existing.set(normalizeCode(one.slug), one.id);
          created++;
        }
      }
      return slice.length;
    }
    for (const p of data || []) {
      existing.set(normalizeCode(p.slug), p.id);
      created++;
    }
    return slice.length;
  });

  console.log(`✓ products: +${created} mới, đã có ${existing.size}`);
  return existing;
}

async function seedStock(wb, whByCode, slugToId) {
  const q7 = whByCode.get("Q7");
  if (!q7) throw new Error("Thiếu kho Q7");

  const rows = sheetMatrix(wb, "TON_Q7");
  const header = rows[0].map((h) => String(h || "").toLowerCase());
  const iKey = header.findIndex((h) => h === "key" || h.includes("mã"));
  const iQty = header.findIndex((h) => h === "qty" || h.includes("tồn") || h.includes("sl"));
  const iDvt = header.findIndex(
    (h) => h === "dvt" || h.includes("đvt") || h.includes("donvi") || h === "unit",
  );

  const allProducts = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id, slug, unit")
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    allProducts.push(...data);
    from += 1000;
    if (data.length < 1000) break;
  }
  const idBySlug = new Map(slugToId);
  const unitById = new Map();
  for (const p of allProducts) {
    idBySlug.set(normalizeCode(p.slug), p.id);
    unitById.set(p.id, p.unit || "cái");
  }

  const byProductUnit = new Map();
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const key = cellToSku(rows[r][iKey >= 0 ? iKey : 0]);
    const qtyRaw = rows[r][iQty >= 0 ? iQty : 1];
    const qty = Math.round(Number(qtyRaw) || 0);
    if (!key) continue;
    const pid =
      idBySlug.get(normalizeCode(key)) ||
      idBySlug.get(key) ||
      null;
    if (!pid) {
      skipped++;
      continue;
    }
    const dvtRaw =
      iDvt >= 0 ? String(rows[r][iDvt] || "").trim() : "";
    const unit = dvtRaw || unitById.get(pid) || "cái";
    const unitKey = String(unit)
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/\s+/g, "") || "cai";
    const mapKey = `${pid}::${unitKey}`;
    const prev = byProductUnit.get(mapKey);
    if (prev) prev.quantity += qty;
    else byProductUnit.set(mapKey, { product_id: pid, unit, unit_key: unitKey, quantity: qty });
  }

  const payload = [...byProductUnit.values()].map((r) => ({
    warehouse_id: q7,
    product_id: r.product_id,
    unit: r.unit,
    unit_key: r.unit_key,
    quantity: Math.max(0, r.quantity),
    updated_at: new Date().toISOString(),
  }));

  console.log(
    `→ TON_Q7 match ${payload.length} dòng (mã+ĐVT), skip ${skipped} key không có trong catalog`,
  );

  await chunked(payload, 200, async (slice) => {
    let { error } = await supabase.from("stock_on_hand").upsert(slice, {
      onConflict: "warehouse_id,product_id,unit_key",
    });
    if (error && /unit_key|no unique|ON CONFLICT/i.test(error.message || "")) {
      const collapsed = new Map();
      for (const r of slice) collapsed.set(r.product_id, r);
      const legacy = [...collapsed.values()].map((r) => ({
        warehouse_id: r.warehouse_id,
        product_id: r.product_id,
        quantity: r.quantity,
        updated_at: r.updated_at,
      }));
      ({ error } = await supabase.from("stock_on_hand").upsert(legacy, {
        onConflict: "warehouse_id,product_id",
      }));
      if (!error) {
        console.warn("⚠ Chưa có unit_key — chạy sql-fix-stock-unit-key.sql rồi seed lại");
      }
    }
    if (error) throw new Error(`stock_on_hand: ${error.message}`);
    return slice.length;
  });

  // Sync products.stock_quantity for Q7 = tổng mọi ĐVT
  const sumByProduct = new Map();
  for (const r of payload) {
    sumByProduct.set(
      r.product_id,
      (sumByProduct.get(r.product_id) || 0) + r.quantity,
    );
  }
  const syncPayload = [...sumByProduct.entries()].map(([product_id, quantity]) => ({
    product_id,
    quantity,
  }));
  await chunked(syncPayload, 60, async (slice) => {
    await Promise.all(
      slice.map((r) =>
        supabase
          .from("products")
          .update({ stock_quantity: r.quantity })
          .eq("id", r.product_id),
      ),
    );
    return slice.length;
  });

  console.log(`✓ stock_on_hand Q7: ${payload.length} dòng (mã+ĐVT)`);
}

function parseExcelDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + v * 86400000);
  }
  const s = String(v || "").trim();
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (m) {
    return new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4] || 0),
      Number(m[5] || 0),
      Number(m[6] || 0),
    );
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

async function seedOrders(wb, whByCode) {
  const rows = sheetMatrix(wb, "Lịch Sử Xuất Kho");
  const header = rows[0].map((h) => String(h || "").toLowerCase());
  const col = (pred) => header.findIndex(pred);

  const iTime = col((h) => h.includes("thời gian"));
  const iSo = col((h) => h.includes("số phiếu") || h.includes("so phieu"));
  const iXuat = col((h) => h.includes("xuất"));
  const iDen = col((h) => h.includes("đến") || h.includes("đối tượng"));
  const iMa = col((h) => h.includes("mã hàng") && !h.includes("vạch"));
  const iTen = col((h) => h.includes("tên"));
  const iQty = col((h) => h === "số lượng" || h.includes("số lượng"));
  const iPacked = col((h) => h.includes("soạn") || h.includes("sl giao"));
  const iStatus = col((h) => h.includes("trạng thái"));

  /** @type {Map<string, any>} */
  const groups = new Map();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const soPhieu = normalizeOrderCode(row[iSo >= 0 ? iSo : 1]);
    if (!soPhieu || /^số phiếu$/i.test(soPhieu)) continue;
    const kind = inferKind(soPhieu);
    if (!kind) continue; // skip PXK

    if (!groups.has(soPhieu)) {
      groups.set(soPhieu, {
        soPhieu,
        kind,
        createdAt: parseExcelDate(row[iTime >= 0 ? iTime : 0]),
        sourceRaw: row[iXuat >= 0 ? iXuat : 2],
        destRaw: row[iDen >= 0 ? iDen : 3],
        statusVotes: {},
        lines: [],
      });
    }
    const g = groups.get(soPhieu);
    const st = mapStatus(row[iStatus >= 0 ? iStatus : 12]);
    g.statusVotes[st] = (g.statusVotes[st] || 0) + 1;

    const ma = cellToSku(row[iMa >= 0 ? iMa : 4]);
    const ten = String(row[iTen >= 0 ? iTen : 6] || ma).trim();
    const qty = Math.round(Number(row[iQty >= 0 ? iQty : 7]) || 0);
    const packedRaw = iPacked >= 0 ? row[iPacked] : null;
    const packed =
      packedRaw === "" || packedRaw == null
        ? null
        : Math.round(Number(packedRaw) || 0);

    if (!ma && !ten) continue;
    g.lines.push({
      ma,
      ten,
      qty: qty > 0 ? qty : 0,
      packed,
    });
  }

  // Sort by createdAt desc, take MAX_ORDERS
  const all = [...groups.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const selected = all.slice(0, MAX_ORDERS);
  console.log(
    `→ phiếu DH/DC trong file: ${all.length}, seed: ${selected.length}`,
  );

  // Existing order codes
  const codes = selected.map((g) => g.soPhieu);
  const existingCodes = new Set();
  for (let i = 0; i < codes.length; i += 100) {
    const slice = codes.slice(i, i + 100);
    const { data } = await supabase
      .from("orders")
      .select("order_code")
      .in("order_code", slice);
    for (const o of data || []) existingCodes.add(o.order_code);
  }

  let inserted = 0;
  let skipped = 0;

  for (const g of selected) {
    if (existingCodes.has(g.soPhieu)) {
      skipped++;
      continue;
    }
    const srcCode =
      resolveWhCode(g.sourceRaw) || (g.kind === "DH" ? "Q7" : "Q7");
    const destCode = resolveWhCode(g.destRaw);
    if (!destCode) {
      console.warn(`  ⚠ skip ${g.soPhieu}: không map kho nhận (${g.destRaw})`);
      skipped++;
      continue;
    }
    const source_warehouse_id = whByCode.get(srcCode);
    const warehouse_id = whByCode.get(destCode);
    if (!source_warehouse_id || !warehouse_id) {
      skipped++;
      continue;
    }

    // Pick majority status
    let status = "pending";
    let best = 0;
    for (const [k, v] of Object.entries(g.statusVotes)) {
      if (v > best) {
        best = v;
        status = k;
      }
    }

    const lines = g.lines.filter((l) => l.qty > 0 || (l.packed ?? 0) > 0);
    if (!lines.length) {
      skipped++;
      continue;
    }

    const total = lines.reduce((s, l) => s + (l.qty || 0), 0);
    const createdIso = g.createdAt.toISOString();

    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        order_code: g.soPhieu,
        order_kind: g.kind,
        customer_name:
          g.kind === "DH" ? "Đơn hàng nội bộ (seed GAS)" : "Điều chuyển (seed GAS)",
        warehouse_id,
        source_warehouse_id,
        status,
        total_amount: 0,
        subtotal: 0,
        shipping_fee: 0,
        is_free_shipping: true,
        notes: `Seed từ Lịch Sử Xuất Kho · ${srcCode}→${destCode}`,
        created_at: createdIso,
        packing_date: createdIso.slice(0, 10),
        packing_shift: "main",
        duplicate_accepted: false,
      })
      .select("id")
      .single();

    if (error) {
      console.warn(`  ⚠ ${g.soPhieu}: ${error.message}`);
      skipped++;
      continue;
    }

    const items = lines.map((l) => {
      const qty = l.qty > 0 ? l.qty : l.packed || 0;
      let qty_packed = l.packed;
      let qty_received = null;
      if (status === "completed") {
        qty_packed = qty_packed ?? qty;
        qty_received = qty_packed;
      } else if (status === "processing") {
        qty_packed = qty_packed ?? qty;
      } else {
        qty_packed = null;
      }
      return {
        order_id: order.id,
        product_name: l.ten || l.ma,
        product_slug: normalizeCode(l.ma) || l.ma || null,
        product_image: null,
        price: 0,
        quantity: qty,
        qty_requested: qty,
        qty_packed,
        qty_received,
        shipping_fee: 0,
      };
    });

    const { error: itemsErr } = await supabase.from("order_items").insert(items);
    if (itemsErr) {
      await supabase.from("orders").delete().eq("id", order.id);
      console.warn(`  ⚠ items ${g.soPhieu}: ${itemsErr.message}`);
      skipped++;
      continue;
    }
    inserted++;
    if (inserted % 20 === 0) console.log(`  … ${inserted} phiếu`);
  }

  console.log(`✓ orders: +${inserted}, bỏ qua ${skipped}`);
}

function truthyFlag(v) {
  if (v === true || v === 1) return true;
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "x";
}

/** Sync IsNew (Data_Excel) + IsLocked/IsOutStock (TON_VARIANT) → products */
async function seedProductFlags(wb) {
  const flagBySlug = new Map();

  // Data_Excel IsNew @ col 10
  try {
    const rows = sheetMatrix(wb, "Data_Excel");
    const header = rows[0].map((h) => String(h || "").toLowerCase());
    const iMa = header.findIndex(
      (h) => h.includes("mã hàng") && !h.includes("vạch"),
    );
    const iNew = header.findIndex((h) => h.replace(/\s/g, "") === "isnew");
    for (let r = 1; r < rows.length; r++) {
      const ma = cellToSku(rows[r][iMa >= 0 ? iMa : 0]);
      if (!ma) continue;
      const slug = normalizeCode(ma);
      const cur = flagBySlug.get(slug) || {
        is_new: false,
        is_out_stock: false,
        is_locked: false,
      };
      if (iNew >= 0 && truthyFlag(rows[r][iNew])) cur.is_new = true;
      flagBySlug.set(slug, cur);
    }
  } catch (e) {
    console.warn("Data_Excel flags:", e.message || e);
  }

  // TON_VARIANT IsLocked / IsOutStock
  try {
    if (!wb.Sheets["TON_VARIANT"]) {
      console.log("⏭ không có sheet TON_VARIANT");
    } else {
      const rows = sheetMatrix(wb, "TON_VARIANT");
      const header = rows[0].map((h) => String(h || "").toLowerCase());
      const iKey = header.findIndex((h) => h === "key" || h.includes("mã"));
      const iLock = header.findIndex((h) => h.includes("islocked"));
      const iOut = header.findIndex((h) => h.includes("isoutstock"));
      for (let r = 1; r < rows.length; r++) {
        const key = cellToSku(rows[r][iKey >= 0 ? iKey : 0]);
        if (!key) continue;
        const slug = normalizeCode(key);
        const cur = flagBySlug.get(slug) || {
          is_new: false,
          is_out_stock: false,
          is_locked: false,
        };
        if (iLock >= 0 && truthyFlag(rows[r][iLock])) cur.is_locked = true;
        if (iOut >= 0 && truthyFlag(rows[r][iOut])) {
          cur.is_out_stock = true;
          cur.is_new = false; // GAS: hết hàng → gỡ IsNew
        }
        flagBySlug.set(slug, cur);
      }
    }
  } catch (e) {
    console.warn("TON_VARIANT flags:", e.message || e);
  }

  const entries = [...flagBySlug.entries()].filter(
    ([, f]) => f.is_new || f.is_out_stock || f.is_locked,
  );
  console.log(`→ flags khác false: ${entries.length} SKU`);

  let updated = 0;
  let missingCol = false;
  for (const [slug, f] of entries) {
    const { error } = await supabase
      .from("products")
      .update({
        is_new: f.is_new,
        is_out_stock: f.is_out_stock,
        is_locked: f.is_locked,
      })
      .eq("slug", slug);
    if (error) {
      if (/is_new|is_out_stock|is_locked|column/i.test(error.message)) {
        missingCol = true;
        break;
      }
      continue;
    }
    updated++;
  }

  if (missingCol) {
    console.warn(
      "⚠ Chưa có cột is_new/is_out_stock/is_locked — chạy migration 20250110000004 rồi seed lại --flags-only",
    );
    return;
  }
  console.log(`✓ product flags updated: ${updated}`);
}

/** Seed sheet "Xuất Bán Hàng" → sales_vouchers + sales_voucher_items */
async function seedSalesVouchers(wb, whByCode) {
  const rows = sheetMatrix(wb, "Xuất Bán Hàng");
  if (!rows.length) {
    console.log("⏭ không có sheet Xuất Bán Hàng");
    return;
  }

  const header = rows[0].map((h) => String(h || "").toLowerCase());
  const col = (pred) => header.findIndex(pred);
  const iTime = col((h) => h.includes("thời gian") || h.includes("ngay"));
  const iHd = col((h) => h.includes("hóa đơn") || h.includes("hoa don"));
  const iXb = col((h) => h.includes("mã phiếu") || h.includes("xb"));
  const iCn = col((h) => h.includes("chi nhánh") || h.includes("chi nhanh"));
  const iMa = col((h) => h.includes("mã hàng") && !h.includes("vạch"));
  const iMv = col((h) => h.includes("vạch"));
  const iTen = col((h) => h.includes("tên"));
  const iDvt = col((h) => h === "đvt" || h.includes("đvt"));
  const iSl = col((h) => h.includes("số lượng") || h === "sl");
  const iActor = col((h) => h.includes("người"));
  const iNote = col((h) => h.includes("ghi chú"));
  const iStatus = col((h) => h.includes("trạng thái"));
  const iGia = col((h) => h.includes("đơn giá"));
  const iTt = col((h) => h.includes("thành tiền"));
  const iLoai = col((h) => h.includes("loại dòng") || h.includes("loai"));
  const iChiPhi = col((h) => h.includes("chi phí") || h.includes("chi phi"));

  function mapWh(raw) {
    const code = resolveWhCode(raw);
    if (!code) return null;
    const id = whByCode.get(code);
    if (!id) return null;
    return { code, id };
  }

  // Group by XB code or (invoice + branch + day)
  const groups = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const maHang = cellToSku(row[iMa >= 0 ? iMa : 4]);
    if (!maHang) continue;
    let xb = String(row[iXb >= 0 ? iXb : 2] || "").trim();
    const hdRaw = String(row[iHd >= 0 ? iHd : 1] || "").trim();
    const hd =
      hdRaw ||
      (typeof row[iHd >= 0 ? iHd : 1] === "number"
        ? String(Math.round(row[iHd >= 0 ? iHd : 1]))
        : "");
    const cnRaw = String(row[iCn >= 0 ? iCn : 3] || "").trim();
    const wh = mapWh(cnRaw);
    const created =
      row[iTime >= 0 ? iTime : 0] instanceof Date
        ? row[iTime >= 0 ? iTime : 0]
        : new Date();
    if (!xb) {
      xb = `XB-SEED-${normalizeCode(hd || "NA")}-${formatDayKey(created)}-${wh?.code || "X"}`;
    }
    if (!groups.has(xb)) {
      groups.set(xb, {
        voucher_code: xb.startsWith("XB-") ? xb : `XB-${xb}`,
        invoice_no: String(hd || xb).trim() || xb,
        warehouse_id: wh?.id || null,
        warehouse_code: wh?.code || null,
        warehouse_name: cnRaw || wh?.code || null,
        created_by: String(row[iActor >= 0 ? iActor : 9] || "seed").trim(),
        created_at: created,
        status: String(row[iStatus >= 0 ? iStatus : 11] || "saved").trim() || "saved",
        lines: [],
      });
    }
    const g = groups.get(xb);
    const qty = Number(row[iSl >= 0 ? iSl : 8]) || 0;
    if (qty <= 0) continue;
    const ten = String(row[iTen >= 0 ? iTen : 6] || maHang).trim();
    const dvt = String(row[iDvt >= 0 ? iDvt : 7] || "cái").trim();
    const loai = String(row[iLoai >= 0 ? iLoai : 14] || "").trim().toUpperCase();
    const isDv =
      loai === "DV" ||
      normalizeCode(maHang).startsWith("DV") ||
      /dịch vụ|dich vu|phí /i.test(ten);
    const price = Number(row[iGia >= 0 ? iGia : 12]) || 0;
    const svc = Number(row[iChiPhi >= 0 ? iChiPhi : 15]) || (isDv ? price : 0);
    const lineTotal =
      Number(row[iTt >= 0 ? iTt : 13]) ||
      (isDv ? svc * qty : price * qty);
    g.lines.push({
      product_slug: normalizeCode(maHang) || maHang,
      barcode: cellToSku(row[iMv >= 0 ? iMv : 5]) || null,
      product_name: ten,
      unit: dvt,
      quantity: qty,
      unit_price: price,
      line_total: lineTotal,
      line_kind: isDv ? "DV" : "HANG",
      service_cost: isDv ? svc : null,
      line_notes: String(row[iNote >= 0 ? iNote : 10] || "").trim() || null,
    });
  }

  const list = [...groups.values()].filter((g) => g.lines.length > 0);
  console.log(`→ xuất bán groups: ${list.length}`);

  const FORCE = args.includes("--force-sales");
  if (FORCE && list.length) {
    // Xóa phiếu seed cũ / trùng mã để map lại kho + dòng hàng
    const codes = list.map((g) => g.voucher_code);
    for (let i = 0; i < codes.length; i += 80) {
      const slice = codes.slice(i, i + 80);
      const { error } = await supabase
        .from("sales_vouchers")
        .delete()
        .in("voucher_code", slice);
      if (error) console.warn(`  ⚠ xóa cũ: ${error.message}`);
    }
    // Xóa luôn các XB-SEED-* lệch kho (-X)
    const { error: e2 } = await supabase
      .from("sales_vouchers")
      .delete()
      .like("voucher_code", "XB-SEED-%");
    if (e2) console.warn(`  ⚠ xóa XB-SEED: ${e2.message}`);
    console.log("→ --force-sales: đã xóa phiếu trùng / XB-SEED trước khi ghi lại");
  }

  // Check existing
  const codes = list.map((g) => g.voucher_code);
  const existing = new Set();
  for (let i = 0; i < codes.length; i += 100) {
    const slice = codes.slice(i, i + 100);
    const { data } = await supabase
      .from("sales_vouchers")
      .select("voucher_code")
      .in("voucher_code", slice);
    for (const v of data || []) existing.add(v.voucher_code);
  }

  let inserted = 0;
  let skipped = 0;
  for (const g of list) {
    if (existing.has(g.voucher_code)) {
      skipped++;
      continue;
    }
    const total = g.lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0);
    const statusRaw = String(g.status || "").trim();
    const status =
      /hủy|huy|cancel/i.test(statusRaw)
        ? "cancelled"
        : /lưu|saved|đồng ý/i.test(statusRaw) || !statusRaw
          ? "saved"
          : statusRaw;
    const { data: voucher, error } = await supabase
      .from("sales_vouchers")
      .insert({
        voucher_code: g.voucher_code,
        invoice_no: g.invoice_no,
        warehouse_id: g.warehouse_id,
        warehouse_code: g.warehouse_code,
        warehouse_name: g.warehouse_name,
        status,
        total_amount: Math.round(total),
        created_by: g.created_by,
        created_at: g.created_at.toISOString(),
        updated_at: g.created_at.toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      if (/sales_vouchers|relation|schema/i.test(error.message)) {
        console.warn(
          "⚠ Chưa có bảng sales_vouchers — chạy migration 20250110000008 rồi seed lại",
        );
        return;
      }
      console.warn(`  ⚠ ${g.voucher_code}: ${error.message}`);
      skipped++;
      continue;
    }
    const items = g.lines.map((l, idx) => ({
      voucher_id: voucher.id,
      ...l,
      sort_order: idx,
    }));
    const { error: iErr } = await supabase
      .from("sales_voucher_items")
      .insert(items);
    if (iErr) {
      console.warn(`  ⚠ items ${g.voucher_code}: ${iErr.message}`);
      await supabase.from("sales_vouchers").delete().eq("id", voucher.id);
      skipped++;
      continue;
    }
    inserted++;
  }
  console.log(`✓ sales vouchers: +${inserted} (skip ${skipped})`);
  const mapped = list.filter((g) => g.warehouse_code).length;
  console.log(`  · có map kho: ${mapped}/${list.length}`);
}

function formatDayKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "na";
  return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}`;
}

async function main() {
  if (!fs.existsSync(SAMPLE)) {
    console.error(`Không thấy ${SAMPLE}`);
    process.exit(1);
  }
  console.log(`Đọc ${SAMPLE}`);
  const wb = XLSX.read(fs.readFileSync(SAMPLE), { type: "buffer", cellDates: true });
  console.log("Sheets:", wb.SheetNames.slice(0, 12).join(", "), "…");

  const FLAGS_ONLY = args.includes("--flags-only");
  if (FLAGS_ONLY) {
    await seedProductFlags(wb);
    console.log("\n✅ Sync flags hoàn tất.");
    return;
  }

  const whByCode = await ensureWarehouses();

  let slugToId = new Map();
  if (!SKIP_CATALOG) {
    slugToId = await seedCatalog(wb);
  } else {
    console.log("⏭ skip catalog");
  }

  if (!SKIP_STOCK) {
    await seedStock(wb, whByCode, slugToId);
  } else {
    console.log("⏭ skip stock");
  }

  // Flags sau catalog
  if (!args.includes("--skip-flags")) {
    await seedProductFlags(wb);
  }

  if (!SKIP_ORDERS) {
    await seedOrders(wb, whByCode);
  } else {
    console.log("⏭ skip orders");
  }

  if (!args.includes("--skip-sales")) {
    await seedSalesVouchers(wb, whByCode);
  } else {
    console.log("⏭ skip sales vouchers (Bán kèm DV)");
  }

  console.log("\n✅ Seed mẫu GAS hoàn tất.");
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
