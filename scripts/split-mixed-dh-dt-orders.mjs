/**
 * One-time: tách dòng thuốc / hàng hóa bị trộn trong đơn DH**** và DT****.
 *
 *   node scripts/split-mixed-dh-dt-orders.mjs
 *   node scripts/split-mixed-dh-dt-orders.mjs --apply
 *   node scripts/split-mixed-dh-dt-orders.mjs --fix-dates
 *
 * Không trừ/hoàn tồn lần 2. Không đổi mã đơn còn lại. Mã mới luôn DH-/DT-xxxxxx.
 * STT dòng chuyển sang phiếu mới giữ số cũ (không chèn giữa phiếu gốc).
 * Phiếu tách giữ created_at / packing_date của phiếu gốc (không lấy ngày hôm nay).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");
const FIX_DATES = process.argv.includes("--fix-dates");
const NOTE_TAG = "[Tách DH/DT 2026-09-08]";
const FROM_CODE_RE = /Tách từ\s+(D[HT]-\d+)/i;

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

function foldText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function foldSlug(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function isClearlyFoodOrTreat(name, slug) {
  const n = foldText(name);
  const s = foldSlug(slug);
  if (s.startsWith("SNC")) return true;
  if (
    /jerhigh|juicy bites|ciao |mieng ga say|thuc an kho|ta hat|ta dang set|ta kho hon hop|reflex plus/.test(
      n,
    )
  ) {
    return true;
  }
  if (/stick\s*-\s*goi|banana stick|beef stick|blueberry stick|strawberry stick/.test(n)) {
    return true;
  }
  if (/huong vi/.test(n) && (/ciao|juicy|fillet|soup|tuna|chicken|nuoc thit|tabs cho meo/.test(n))) {
    return true;
  }
  if (/aller-zero/.test(n)) return true;
  if (/epioti|ear cleanser|natural core|puppy \d/.test(n)) return true;
  return false;
}

function isTpcnProduct(p) {
  const name = String(p.name || "");
  const slug = foldSlug(p.slug);
  if (isClearlyFoodOrTreat(name, slug)) return false;
  const n = foldText(name);
  if (/thuoc thu y|bromhexine|brom max|\binj\b|inj-|injection/.test(n)) {
    return false;
  }
  if (/tpcn|thuc pham chuc nang/.test(n)) return true;
  if (/CNXXX/.test(slug) || /^(H|M|C)CN/.test(slug)) return true;
  if (/^TCN\d/.test(slug) && !/epioti|ear cleanser|natural core/.test(n)) {
    return true;
  }
  const industry = foldSlug(p.sku_industry).slice(0, 2);
  const detail = foldSlug(p.sku_detail).slice(0, 2);
  const fromSlug10 = /^[A-Z]{6}\d{4}$/.test(slug)
    ? { industry: slug.slice(0, 2), detail: slug.slice(2, 4) }
    : null;
  const isBs =
    (industry === "TA" && detail === "BS") ||
    (fromSlug10?.industry === "TA" && fromSlug10.detail === "BS");
  if (!isBs && !/^TAC\d/.test(slug) && !/^tabs/.test(n)) return false;
  if (
    /gel|oil|omega|vitamin|men |probisol|prolax|kidney|immuno|flora|canxi|calcium|elecamin|nuvita|clostop|quad|10kd|vf\+|pet lac|birthright|probio|hairball cure|hairball solution|tabs 120g|oral drops/.test(
      n,
    )
  ) {
    return true;
  }
  if (/^tabs/.test(n) && !/stick|cookie|bacon|jerky|juicy|ciao|huong/.test(n)) {
    return true;
  }
  if (/^TAC\d/.test(slug) && /vf\+/.test(n)) return true;
  return isBs;
}

function isMedicineProduct(p) {
  if (!p) return false;
  if (String(p.category_group || "").trim().toUpperCase() === "THUOC") return true;
  const industry = foldSlug(p.sku_industry).replace(/[^A-Z0-9]/g, "").slice(0, 2);
  if (industry === "YT" || industry === "VT") return true;
  return isTpcnProduct(p);
}

function hasCategorySignal(p) {
  if (!p) return false;
  if (String(p.category_group || "").trim()) return true;
  if (String(p.sku_industry || "").trim()) return true;
  return isMedicineProduct(p);
}

function chunkList(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function lineTotal(it) {
  return (Number(it.price) || 0) * (Number(it.quantity) || 0);
}

loadEnv();
const url = process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("Thiếu VITE_SUPABASE_URL hoặc SUPABASE_SECRET_KEY");
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchAllProducts() {
  const all = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await db
      .from("products")
      .select("id, slug, name, sku_industry, sku_detail, category_group")
      .range(from, from + page - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return all;
}

async function fetchOrders() {
  const all = [];
  let from = 0;
  const page = 200;
  for (;;) {
    const { data, error } = await db
      .from("orders")
      .select(
        "id, order_code, order_kind, status, is_locked, locked_at, warehouse_id, source_warehouse_id, customer_name, notes, packing_date, packing_shift, total_amount, subtotal, shipping_fee, is_free_shipping, printed_at, stt_locked_at, stock_posted_at, created_at, updated_at",
      )
      .in("order_kind", ["DH", "DT"])
      .neq("status", "cancelled")
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (error) {
      if (/printed_at|stt_locked_at|stock_posted_at/i.test(error.message || "")) {
        const retry = await db
          .from("orders")
          .select(
            "id, order_code, order_kind, status, is_locked, locked_at, warehouse_id, source_warehouse_id, customer_name, notes, packing_date, packing_shift, total_amount, subtotal, shipping_fee, is_free_shipping, created_at, updated_at",
          )
          .in("order_kind", ["DH", "DT"])
          .neq("status", "cancelled")
          .order("id", { ascending: true })
          .range(from, from + page - 1);
        if (retry.error) throw retry.error;
        const rows = retry.data || [];
        all.push(...rows);
        if (rows.length < page) break;
        from += page;
        continue;
      }
      throw error;
    }
    const rows = data || [];
    all.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return all;
}

async function fetchItems(orderIds) {
  const all = [];
  for (const chunk of chunkList(orderIds, 25)) {
    let from = 0;
    const page = 1000;
    for (;;) {
      const { data, error } = await db
        .from("order_items")
        .select(
          "id, order_id, stt, product_id, product_slug, product_name, quantity, price",
        )
        .in("order_id", chunk)
        .order("id", { ascending: true })
        .range(from, from + page - 1);
      if (error) throw error;
      const rows = data || [];
      all.push(...rows);
      if (rows.length < page) break;
      from += page;
    }
  }
  return all;
}

function classifyLine(item, byId, bySlug) {
  const product =
    (item.product_id && byId.get(item.product_id)) ||
    bySlug.get(foldSlug(item.product_slug)) ||
    bySlug.get(foldSlug(item.product_name)) || {
      slug: item.product_slug,
      name: item.product_name,
    };
  return {
    medicine: isMedicineProduct(product),
    known: hasCategorySignal(product),
    product,
  };
}

async function allocCode(kind) {
  for (let i = 0; i < 30; i++) {
    const code = `${kind}-${Math.floor(100000 + Math.random() * 900000)}`;
    const { data, error } = await db
      .from("orders")
      .select("id")
      .eq("order_code", code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return code;
  }
  throw new Error(`Không tạo được mã ${kind}-xxxxxx`);
}

async function unlockOrder(order) {
  if (!order.is_locked) return;
  const { error } = await db
    .from("orders")
    .update({ is_locked: false, locked_at: null })
    .eq("id", order.id);
  if (error) throw error;
}

async function relockOrder(orderId, order) {
  if (!order.is_locked && !order.stt_locked_at && !order.printed_at) return;
  const patch = {};
  if (order.is_locked) {
    patch.is_locked = true;
    patch.locked_at = order.locked_at || new Date().toISOString();
  }
  if (order.stt_locked_at) patch.stt_locked_at = order.stt_locked_at;
  if (order.printed_at) patch.printed_at = order.printed_at;
  if (!Object.keys(patch).length) return;
  const { error } = await db.from("orders").update(patch).eq("id", orderId);
  if (error && !/stt_locked_at|printed_at/i.test(error.message || "")) throw error;
}

async function thawOrder(order) {
  await unlockOrder(order);
  if (order.status === "completed" || order.status === "cancelled") {
    const { error } = await db
      .from("orders")
      .update({ status: "pending" })
      .eq("id", order.id);
    if (error) throw error;
  }
}

async function freezeOrder(orderId, order, { cancelledEmpty }) {
  if (cancelledEmpty) {
    await relockOrder(orderId, { ...order, is_locked: false, stt_locked_at: null, printed_at: null });
    return;
  }
  if (order.status === "completed" || order.status === "cancelled") {
    const { error } = await db
      .from("orders")
      .update({ status: order.status })
      .eq("id", orderId);
    if (error) throw error;
  }
  await relockOrder(orderId, order);
}

function appendNote(existing, extra) {
  const cur = String(existing || "").trim();
  if (cur.includes(NOTE_TAG)) return cur;
  return cur ? `${cur}\n${extra}` : extra;
}

async function fetchSplitSiblings() {
  const all = [];
  let from = 0;
  const page = 200;
  for (;;) {
    const { data, error } = await db
      .from("orders")
      .select(
        "id, order_code, notes, created_at, updated_at, packing_date, packing_shift, status, is_locked, locked_at, stt_locked_at, printed_at",
      )
      .ilike("notes", `%${NOTE_TAG}%Tách từ%`)
      .order("id", { ascending: true })
      .range(from, from + page - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < page) break;
    from += page;
  }
  return all;
}

async function fetchOriginalsByCodes(codes) {
  const map = new Map();
  const unique = [...new Set(codes.filter(Boolean))];
  for (const chunk of chunkList(unique, 80)) {
    const { data, error } = await db
      .from("orders")
      .select("id, order_code, created_at, updated_at, packing_date, packing_shift")
      .in("order_code", chunk);
    if (error) throw error;
    for (const row of data || []) {
      map.set(String(row.order_code || "").toUpperCase(), row);
    }
  }
  return map;
}

async function stampSiblingDates(siblingId, original, sibling) {
  await thawOrder(sibling);
  const patch = {
    created_at: original.created_at,
    packing_date: original.packing_date,
    packing_shift: original.packing_shift,
    updated_at: original.updated_at || original.created_at,
  };
  const { error } = await db.from("orders").update(patch).eq("id", siblingId);
  if (error) throw error;
  await freezeOrder(siblingId, sibling, { cancelledEmpty: false });
}

async function fixSplitOrderDates() {
  const siblings = await fetchSplitSiblings();
  const codes = siblings.map((row) => {
    const m = String(row.notes || "").match(FROM_CODE_RE);
    return m ? m[1].toUpperCase() : null;
  });
  const originals = await fetchOriginalsByCodes(codes);
  let need = 0;
  let done = 0;
  let missing = 0;
  for (const sibling of siblings) {
    const m = String(sibling.notes || "").match(FROM_CODE_RE);
    if (!m) continue;
    const original = originals.get(m[1].toUpperCase());
    if (!original?.created_at) {
      missing += 1;
      console.log(`  thiếu gốc ${m[1]} cho ${sibling.order_code}`);
      continue;
    }
    const sameCreated =
      Date.parse(sibling.created_at) === Date.parse(original.created_at);
    const samePack =
      String(sibling.packing_date || "") === String(original.packing_date || "");
    if (sameCreated && samePack) continue;
    need += 1;
    console.log(
      `  ${sibling.order_code} ${sibling.created_at} → ${original.created_at} (gốc ${original.order_code})`,
    );
    if (!FIX_DATES && !APPLY) continue;
    await stampSiblingDates(sibling.id, original, sibling);
    done += 1;
  }
  console.log(
    `Phiếu tách: ${siblings.length}. Lệch ngày: ${need}. Đã sửa: ${done}. Thiếu gốc: ${missing}.`,
  );
}

if (FIX_DATES) {
  await fixSplitOrderDates();
  process.exit(0);
}

const products = await fetchAllProducts();
const byId = new Map(products.map((p) => [p.id, p]));
const bySlug = new Map(
  products
    .filter((p) => foldSlug(p.slug))
    .map((p) => [foldSlug(p.slug), p]),
);

const orders = await fetchOrders();
const items = await fetchItems(orders.map((o) => o.id));
const itemsByOrder = new Map();
for (const it of items) {
  const list = itemsByOrder.get(it.order_id) || [];
  list.push(it);
  itemsByOrder.set(it.order_id, list);
}

const plans = [];
for (const order of orders) {
  const kind = String(order.order_kind || "").toUpperCase();
  if (kind !== "DH" && kind !== "DT") continue;
  const rows = itemsByOrder.get(order.id) || [];
  if (!rows.length) continue;

  const keep = [];
  const move = [];
  const unknown = [];
  for (const it of rows) {
    const cls = classifyLine(it, byId, bySlug);
    if (!cls.known) {
      unknown.push(it);
      keep.push(it);
      continue;
    }
    const belongsHere =
      kind === "DH" ? !cls.medicine : cls.medicine;
    if (belongsHere) keep.push(it);
    else move.push(it);
  }

  if (!move.length) continue;
  const siblingKind = kind === "DH" ? "DT" : "DH";
  plans.push({
    order,
    kind,
    siblingKind,
    keep,
    move,
    unknown,
    allWrong: keep.length === 0,
  });
}

console.log(`Đơn DH/DT (chưa hủy): ${orders.length}`);
console.log(`Catalog: ${products.length}`);
console.log(`Đơn cần tách: ${plans.length}`);
for (const p of plans.slice(0, 40)) {
  console.log(
    `  ${p.order.order_code} ${p.kind} keep=${p.keep.length} move=${p.move.length} unknown=${p.unknown.length}${p.allWrong ? " [toàn bộ sai loại → hủy gốc]" : ""}`,
  );
  for (const it of p.move.slice(0, 8)) {
    console.log(`     → ${it.stt || "?"} ${it.product_slug || ""} ${it.product_name}`);
  }
}
if (plans.length > 40) console.log(`  … +${plans.length - 40} đơn nữa`);

if (!APPLY) {
  console.log("\nChưa ghi DB. Chạy lại với --apply để tách.");
  process.exit(0);
}

let created = 0;
let cancelled = 0;
for (const plan of plans) {
  const { order } = plan;
  await thawOrder(order);
  const siblingCode = await allocCode(plan.siblingKind);
  const keepTotal = plan.keep.reduce((s, it) => s + lineTotal(it), 0);
  const moveTotal = plan.move.reduce((s, it) => s + lineTotal(it), 0);
  const siblingRow = {
    order_code: siblingCode,
    order_kind: plan.siblingKind,
    customer_name: order.customer_name || (plan.siblingKind === "DT" ? "Đơn thuốc" : "Đơn hàng"),
    warehouse_id: order.warehouse_id,
    source_warehouse_id: order.source_warehouse_id,
    packing_date: order.packing_date,
    packing_shift: order.packing_shift,
    created_at: order.created_at,
    updated_at: order.updated_at || order.created_at,
    status: order.status,
    total_amount: moveTotal,
    subtotal: moveTotal,
    shipping_fee: order.shipping_fee || 0,
    is_free_shipping: order.is_free_shipping !== false,
    notes: appendNote(
      null,
      `${NOTE_TAG} Tách từ ${order.order_code} (${plan.move.length} dòng). Không trừ tồn lần 2.`,
    ),
    is_locked: false,
  };
  if (order.stock_posted_at) siblingRow.stock_posted_at = order.stock_posted_at;
  if (order.printed_at) siblingRow.printed_at = order.printed_at;
  if (order.stt_locked_at) siblingRow.stt_locked_at = order.stt_locked_at;

  let inserted;
  {
    const { data, error } = await db
      .from("orders")
      .insert(siblingRow)
      .select("id, order_code")
      .single();
    if (error && /printed_at|stt_locked_at|stock_posted_at/i.test(error.message || "")) {
      delete siblingRow.printed_at;
      delete siblingRow.stt_locked_at;
      delete siblingRow.stock_posted_at;
      const retry = await db
        .from("orders")
        .insert(siblingRow)
        .select("id, order_code")
        .single();
      if (retry.error) throw retry.error;
      inserted = retry.data;
    } else if (error) {
      throw error;
    } else {
      inserted = data;
    }
  }
  const siblingId = inserted.id;
  if (order.created_at) {
    const { error: dateErr } = await db
      .from("orders")
      .update({
        created_at: order.created_at,
        packing_date: order.packing_date,
        packing_shift: order.packing_shift,
        updated_at: order.updated_at || order.created_at,
      })
      .eq("id", siblingId);
    if (dateErr) {
      console.log(`  ⚠ không ghi ngày ${siblingCode}: ${dateErr.message}`);
    }
  }

  for (const chunk of chunkList(plan.move.map((it) => it.id), 80)) {
    const { error } = await db
      .from("order_items")
      .update({ order_id: siblingId })
      .in("id", chunk);
    if (error) throw error;
  }

  if (plan.allWrong || plan.keep.length === 0) {
    const { error } = await db
      .from("orders")
      .update({
        status: "cancelled",
        total_amount: 0,
        subtotal: 0,
        notes: appendNote(
          order.notes,
          `${NOTE_TAG} Toàn bộ dòng đã chuyển sang ${siblingCode}. Không hoàn tồn.`,
        ),
      })
      .eq("id", order.id);
    if (error) throw error;
    cancelled += 1;
  } else {
    const { error } = await db
      .from("orders")
      .update({
        total_amount: keepTotal,
        subtotal: keepTotal,
        notes: appendNote(
          order.notes,
          `${NOTE_TAG} Đã tách ${plan.move.length} dòng sang ${siblingCode}.`,
        ),
      })
      .eq("id", order.id);
    if (error) throw error;
    await freezeOrder(order.id, order, { cancelledEmpty: false });
  }

  await freezeOrder(siblingId, order, { cancelledEmpty: false });
  created += 1;
  console.log(`OK ${order.order_code} → ${siblingCode} (${plan.move.length} dòng)`);
}

console.log(`Xong. Tạo ${created} phiếu mới, hủy ${cancelled} phiếu gốc rỗng/sai loại.`);
