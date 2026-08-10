/**
 * Apply warehouse address / Q4 labels + optional profile columns via Supabase REST
 * (không cần psql — dùng service role).
 *
 * node scripts/apply-warehouse-labels.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
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
const key =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});


const KEYWORDS = ["kinh doanh 06", "275", "178", "Q4 Cu", "Q4 Moi", "KD 06", "KD 01", "Q4 Cũ", "Q4 Mới"];

function hitFields(row, extra = {}) {
  const hay = { notes: row.notes, customer_name: row.customer_name, ...extra };
  const hits = [];
  for (const [field, val] of Object.entries(hay)) {
    if (val == null) continue;
    const s = String(val);
    for (const kw of KEYWORDS) {
      if (s.toLowerCase().includes(kw.toLowerCase())) hits.push({ field, kw, snippet: s.slice(0, 200) });
    }
  }
  return hits;
}

async function main() {
  let orders, orderSelectNote;
  {
    const r1 = await supabase.from("orders").select("id, order_code, warehouse_id, source_warehouse_id, customer_name, created_at, notes, packing_date").or("order_code.eq.977191,order_code.ilike.%977191%");
    if (r1.error) throw r1.error;
    orders = r1.data;
    orderSelectNote = "ok";
  }
  const { data: warehouses, error: e2 } = await supabase.from("warehouses").select("id, code, name, short_name, print_name, address").order("code");
  if (e2) throw e2;
  const byId = Object.fromEntries((warehouses || []).map((w) => [w.id, w]));
  const byCode = Object.fromEntries((warehouses || []).map((w) => [w.code, w]));
  const q4_178 = byCode["Q4_178"] || null;
  const q4_275 = byCode["Q4_275"] || null;
  const ordersEnriched = (orders || []).map((o) => ({ ...o, warehouse: o.warehouse_id ? byId[o.warehouse_id] || null : null, source_warehouse: o.source_warehouse_id ? byId[o.source_warehouse_id] || null : null, keyword_hits: hitFields(o) }));
  async function countFor(wh) {
    if (!wh) return { warehouse_code: null, count: null, error: "missing" };
    const { count, error } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("warehouse_id", wh.id);
    if (error) return { warehouse_code: wh.code, count: null, error: error.message };
    return { warehouse_code: wh.code, short_name: wh.short_name, warehouse_id: wh.id, count };
  }
  const counts = { Q4_178: await countFor(q4_178), Q4_275: await countFor(q4_275) };
  async function sampleRecent(wh) {
    if (!wh) return [];
    const { data, error } = await supabase.from("orders").select("id, order_code, warehouse_id, created_at, customer_name, notes, packing_date").eq("warehouse_id", wh.id).order("created_at", { ascending: false }).limit(5);
    if (error) return [{ error: error.message }];
    return (data || []).map((o) => ({ order_code: o.order_code, created_at: o.created_at, packing_date: o.packing_date, customer_name: o.customer_name, warehouse_code: wh.code, warehouse_short_name: wh.short_name, keyword_hits: hitFields(o) }));
  }
  const samples = { Q4_178: await sampleRecent(q4_178), Q4_275: await sampleRecent(q4_275) };
  const keywordScan = {};
  const scanKws = ["kinh doanh 06", "275", "178", "KD 06", "KD 01"];
  for (const kw of scanKws) {
    const { data, error, count } = await supabase.from("orders").select("id, order_code, warehouse_id, customer_name, notes", { count: "exact" }).or("notes.ilike.%" + kw + "%,customer_name.ilike.%" + kw + "%").limit(5);
    keywordScan[kw] = { count: count ?? null, error: error ? error.message : null, sample: (data || []).map((o) => ({ order_code: o.order_code, warehouse_code: byId[o.warehouse_id]?.code, warehouse_short: byId[o.warehouse_id]?.short_name, customer_name: o.customer_name, notes: o.notes })) };
  }
  const warehouseKeywordHits = (warehouses || []).map((w) => ({ code: w.code, hits: hitFields({}, { name: w.name, short_name: w.short_name, print_name: w.print_name, address: w.address }) })).filter((x) => x.hits.length);
  const primary = ordersEnriched[0] || null;
  let recommendation = null;
  if (primary) {
    const whCode = primary.warehouse?.code;
    let labelMeans = "other";
    let action = "Unexpected warehouse";
    if (whCode === "Q4_178") { labelMeans = "Q4 Moi = KD 01 = 178"; action = "UPDATE warehouse_id to Q4_275; labels alone NOT enough"; }
    else if (whCode === "Q4_275") { labelMeans = "Q4 Cu = KD 06 = 275"; action = "Already Q4_275 = Q4 Cu; labels enough; no order UPDATE"; }
    recommendation = { order_code: primary.order_code, current_warehouse_code: whCode, current_short_name: primary.warehouse?.short_name, current_is_Q4_178: whCode === "Q4_178", current_label_means: labelMeans, if_user_expects_Q4_Cu: action, historical_seed: { Q4_178: "KD 01", Q4_275: "KD 06", note: "migrations 010/011 swapped Cu/Moi; fixed by 015 and warehouseMeta" } };
  }
  const out = { order_select_note: orderSelectNote, order_977191: ordersEnriched, warehouses_all: warehouses, q4_focus: { Q4_178: q4_178, Q4_275: q4_275 }, order_counts_by_warehouse_code: counts, keyword_scan_orders: keywordScan, warehouse_keyword_hits: warehouseKeywordHits, sample_recent_orders: samples, recommendation };
  console.log(JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(ROOT, "scripts/_q4_977191_report.json"), JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
