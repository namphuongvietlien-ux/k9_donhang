# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo actually is

`README.md` describes a Vietnamese e-commerce storefront ("Tăm Nhựa Vinon"). That storefront is **switched off**: `src/App.tsx` routes `/` to `WarehousePortal` and sends every unmatched path to `StorefrontLockedRedirect`. Only `/`, `/sitemap.xml`, and `/admin/*` are live.

What is actively developed is an **internal multi-warehouse operations system ("K9")** — branch stores raise transfer/order slips, head office packs them, branches confirm receipt. Much of `src/lib` is a **direct port of a legacy Google Apps Script app**; comments say so explicitly (`port GAS …`, `khớp GAS …`) and the ported behaviour, including its quirks, is the spec. When changing that logic, preserve GAS parity unless told otherwise.

Read `README.md` for Supabase/OAuth/deployment setup, but treat its feature list and folder tree as partly historical.

## Commands

```bash
npm run dev            # Vite dev server on port 8080 (not 5173)
npm run build          # production build → dist/
npm run lint           # eslint
npm run preview        # serve dist/ on 4173
npm run prepare-deploy # build + copy .htaccess into dist/ (Apache hosting)
npx tsc -b             # the only real typecheck — see below
```

- **`npm run build` does not typecheck.** It uses `@vitejs/plugin-react-swc`, which strips types without checking them. Type errors reach production silently.
- **`npx tsc --noEmit` is a no-op here — it always exits 0.** Root `tsconfig.json` is solution-style (`"files": []` + `references`), so a bare `tsc` invocation checks **zero** files. Use `npx tsc -b` (or `npx tsc --noEmit -p tsconfig.app.json`), which reports the ~45 pre-existing errors in `src`. Don't read a clean `npx tsc --noEmit` as "types are fine".
- **There is no test framework.** No vitest/jest, no `*.test.*` files, no `npm test`. `TEST_PLAN.md` / `TEST_CHECKLIST.md` / `QC_REPORT.md` are manual QA checklists, not automated suites. Do not claim tests pass; verify by running the app.
- `tsconfig.app.json` has `strict: false`, `noImplicitAny: false`, and `@typescript-eslint/no-unused-vars` is off. Existing code leans on this; new code doesn't have to.

### Database

Migrations live in `supabase/migrations/` (~120 files, applied in filename order; `supabase/migrations_backup_20260109_000000/` is a frozen archive — don't edit it). Timestamps are intentionally in the future (`20260819…`) to sort after the legacy `2025…` batch.

```bash
supabase db push                  # apply migrations
node scripts/<name>.mjs           # ad-hoc data fixes via Supabase REST + service key
```

Migration conventions actually followed by recent files:
- Mutations go through `SECURITY DEFINER … SET search_path = public` RPCs that re-check `public.has_role(auth.uid(), '<role>'::app_role)` and `RAISE EXCEPTION` with a Vietnamese message.
- Every new table gets `ENABLE ROW LEVEL SECURITY` plus explicit policies.
- End the file with `GRANT EXECUTE … TO authenticated;` and `NOTIFY pgrst, 'reload schema';` so PostgREST picks up new functions.

`scripts/*.mjs` are one-off operational scripts (apply SQL, diagnose login, seed, reconcile labels). They read `.env` themselves and need `SUPABASE_SECRET_KEY`. `scripts/*.sql` are the same fixes as pasteable SQL. `scripts/sync-to-google-sheets.mjs` runs daily via `.github/workflows/sync-google-sheets.yml` (02:00 VN) and append-syncs deltas to a Sheet, tracking a cursor in a `sync_cursor` tab.

## Architecture

### Two front-ends, two gates

| Surface | Entry | Gate |
| --- | --- | --- |
| Warehouse portal | `src/pages/WarehousePortal.tsx` (route `/`) | `WarehouseLoginGate` inside the page — requires `user && isAdmin` |
| Admin panel | `src/pages/admin/*` (lazy, `/admin/*`) | Each page wraps itself in `AdminLayout`, which redirects on `!user` / `!isAdmin` |

`src/components/admin/AdminRoute.tsx` supports per-permission/per-role route guards but is only used by `AdminUsers`; **routes in `App.tsx` are unguarded** and rely on the layout/page gate above. Fine-grained gating is done ad hoc via `usePermissions()` inside components.

The portal is a single page with tabs (`create`, `xb`, `dashboard`, `manage`, `receive`, `packing`, `internal-dispatch`, `admin`) selected by the `?tab=` query param, which is also how Telegram deep links open a specific slip (`?tab=manage&soPhieu=…`).

### Auth, roles, and store scope

`src/contexts/AuthContext.tsx` is the single source of truth and is unusually defensive — read it before touching auth. It resolves three orthogonal things:

1. **Role** — `super_admin | manager | staff | null`, via RPCs `can_access_admin` → `get_user_role` → `get_user_permissions`, with fallbacks to querying `user_roles` / `role_permissions` + `permissions` directly when RLS or a missing function breaks the RPC. Legacy role `'admin'` maps to `super_admin`.
2. **Store scope** — `loadProfileStore` tries RPC `get_my_store_scope`, then `profiles` (with a joined `warehouses`), then a bare `profiles` select, then `user_metadata`. It caches "RPC missing" in `sessionStorage` to stop retrying. `warehouseId === null` means "all warehouses" (head office); a non-null value **hard-locks** the user to one branch. `useStoreScope()` exposes `isStoreScoped` / `isAdminScope`; scoped users must not be able to pick a warehouse in the UI.
3. **Local dev bypass** — on `localhost`, `localStorage.localAdminSession = "1"` plus a `localAdminEmail` matching `local.dev`/`test.admin+local` fabricates a super_admin session with a hardcoded permission list. Any change to the permission vocabulary must be mirrored in the three copies of that array in `AuthContext.tsx`.

`signIn` accepts a bare GAS-era username and appends `@k9.local` when there's no `@`.

`AdminContext` / `usePermissions` are thin re-exports of `useAuth`; `super_admin` short-circuits every permission check.

### Warehouse slips reuse the e-commerce tables

There is no separate transfers table. Internal slips are rows in **`orders` / `order_items`**, distinguished by `order_kind` and `order_code` prefix (`src/lib/warehouseOrders.ts`):

- `DH-` = branch order, `DC-` = internal transfer, `XB-` = sales/service voucher, else `OTHER`.
- `warehouse_id` = receiving warehouse, `source_warehouse_id` = issuing warehouse.
- Status vocabulary is `pending | processing | completed | cancelled`, displayed as Mới / Đã soạn hàng / Đã nhận hàng / Đã hủy.
- Line quantities are a three-stage funnel: `qty_requested` → `qty_packed` → `qty_received`. `quantity` is the legacy column and only a fallback. Mismatches drive row colouring (`src/lib/productFlags.ts`) and transfer status (`mapOrderStatusToTransfer` in `src/lib/internalTransfers.ts`).
- Printing uses `resolvePrintQty` (`src/lib/orderPrint.ts`): packed qty wins, cancelled prints 0. Printing is HTML + `window.print()`, deliberately not jsPDF.
- Slips lock (`is_locked` / `locked_at`) once printed; only `admin_unlock_order` (super_admin + audited reason) reopens one.

`src/hooks/useWarehouseOrders.ts` (~1300 lines) is the hub: the two `ORDER_SELECT` constants, duplicate detection, product-flag joins, Telegram notifications, and all mutations. `src/lib/ensureOrderProducts.ts` auto-upserts unknown SKUs into `products` with `is_new = true` before writing `order_items`, rather than rejecting them.

Other domain areas: `ecommerce_orders` / `ecommerce_order_items` / `ecommerce_tracking_events` for marketplace imports (Shopee/TikTok/GHN/J&T under `src/utils/*Api.ts`), `sales_vouchers` for XB, `internal_dispatches` + `branch_manager_scopes` + weekly orders for the approve→process flow (RPCs `create_internal_dispatch`, `approve_internal_dispatch`, `reject_internal_dispatch`, `mark_weekly_order_printed`, `complete_weekly_order`), and the older `stock_in_*` / `stock_out_*` / `inventory_lots` FIFO inventory tables.

### Ported GAS rules you must not casually "clean up"

- **`src/lib/packingWindows.ts`** — the packing-day model. Day N2's main window is `[N1 10:00, N2 08:00)`, supplement is `[N2 08:00, N2 10:00)`, both half-open, all in `Asia/Ho_Chi_Minh`. An order created at ≥10:00 belongs to the *next* packing day. `toHoChiMinhMillis` distinguishes offset-bearing ISO strings (parse absolutely) from naive ones (treat as VN wall time) — a past bug shifted supplement-shift orders by 7 hours. Use `getHoChiMinhParts` / `vnWallTimeToMillis` rather than raw `Date` parts so behaviour is stable on non-VN machines.
- **`src/lib/warehouseMeta.ts`** — warehouse codes `Q4_178` / `Q4_275` must **never** surface in the UI; they render as "Q4 Cũ" / "Q4 Mới". `warehouseShortLabel()` and `enrichWarehouseMeta()` deliberately *override* `short_name`/`address` from the database, because DB values are known-wrong. Always label through these helpers.
- **`src/lib/stockKeys.ts`** — stock is keyed by code + unit, as `CODE|DV:<normalized-unit>`, matching GAS. Unit normalization (`normalizeUnitKey`: lowercase, strip diacritics, `đ`→`d`, strip spaces) lives in `src/lib/softLineValidation.ts`. Live quantities are in `stock_on_hand` keyed by that unit key, with `products` as fallback.
- **`src/lib/softLineValidation.ts`** — import validation is *non-blocking by design*: bad quantity, bad unit, or unknown SKU append a Vietnamese note (`Lỗi SL`, `Lỗi ĐVT`, `Mã không tồn tại`) to `line_notes` and let the slip save. Don't convert these into thrown errors.
- **`src/lib/catalogUnitBarcode.ts`** — one SKU has several unit options drawn from `unit`/`unit_2` and child rows (`parent_sku`). A unit option is kept even when its barcode is empty, and changing unit must resync barcode (including to empty).
- **`src/lib/importMapping.ts`** — fuzzy, score-based Excel/CSV header matching for Vietnamese column names; extend the scoring tables rather than hardcoding column indexes.
- **Duplicate detection** — `attachDuplicateSuspects` flags two slips from the same branch within the same day or 60 minutes that share a total quantity or an identical SKU signature. Suspicion is advisory and can be acknowledged (`duplicateAccepted`).

### Supabase typing

`src/integrations/supabase/types.ts` is stale — it covers only ~11 tables (`orders`, `order_items`, `products`, `profiles`, `banners`, `categories`, `coupons`, `page_contents`, `posts`, `site_settings`, `user_roles`). Everything newer is reached with `.from("table" as never)` / `.rpc("fn" as never)` and hand-written result interfaces; there are ~112 such casts, 43 in `useWarehouseOrders.ts` alone. Follow the local pattern (cast + explicit interface) unless you regenerate the types wholesale.

The client (`src/integrations/supabase/client.ts`) refuses `sb_secret_*` keys in the browser and falls back to `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`. Never put a service-role key in a `VITE_*` variable.

### Notifications

`src/lib/telegramNotify.ts` calls the `notify-telegram` Edge Function and must never block the UI on failure. Links are built from `VITE_SITE_URL`, falling back to the production portal URL when running on localhost so notifications never carry a `localhost` link. Edge functions live in `supabase/functions/` (Deno): telegram webhook/register/weekly-reminder, marketplace tracking sync, `send-admin-otp`, `create-admin-user`, `ai-chatbot`, `sitemap`.

## Conventions

- **UI strings, toasts, error messages, and code comments are Vietnamese.** Match that; don't translate existing text to English.
- Path alias `@/*` → `src/*`.
- UI is shadcn/ui in `src/components/ui` (generated — regenerate via `components.json` rather than hand-editing). Feature components are in `src/components/admin`, several over 1000 lines; extend in place rather than starting parallel implementations.
- Data access is TanStack Query with deliberately lazy defaults set in `App.tsx` (`staleTime` 5 min, `gcTime` 1 h, no refetch on focus or mount) to hold down PostgREST egress. Invalidate explicitly after mutations instead of loosening these.
- `vite.config.ts` intentionally uses esbuild minify with **no `manualChunks`** — both comments record that terser and custom chunk splitting produced empty bundles and TDZ crashes. Don't reintroduce them.
- Wrap `console.*` in `process.env.NODE_ENV === 'development'`, as existing code does.
- `RECOVERY_GUIDE.md` documents how to restore a locked-out super_admin (`/admin/recovery`, or `restore_super_admin_role(...)`); `AdminUsers` blocks self-demotion and demoting a `super_admin`.
[TASK: VERIFY TELEGRAM WEBHOOK & BUTTON SYNC]
Hãy kiểm tra nhanh file `supabase/functions/telegram-webhook/index.ts` và đảm bảo:
1. Khi quản lý bấm nút "Chấp nhận" hoặc "Từ chối" trên Telegram cá nhân, hàm RPC `telegram_decide_internal_dispatch` thực thi thành công.
2. Trạng thái đơn hàng trong bảng `internal_dispatches` được cập nhật đúng để giao diện Web tự động đồng bộ thay đổi mà không cần reload thủ công.
3. Chạy `npx tsc --noEmit` để rà soát xem có lỗi TypeScript nào phát sinh từ các thay đổi vừa rồi không. 
Không quét lại toàn bộ repo để tiết kiệm token. Hãy báo cáo kết quả ngắn gọn.