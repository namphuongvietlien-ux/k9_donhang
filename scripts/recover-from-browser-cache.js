/**
 * CỨU DỮ LIỆU TỪ TAB TRÌNH DUYỆT CÒN MỞ
 * =====================================
 * Dùng cho tab portal K9 đã mở TRƯỚC khi dữ liệu bị xóa và CHƯA F5 lần nào.
 *
 * App cấu hình refetchOnMount:false + refetchOnWindowFocus:false + gcTime 1h,
 * nên cache TanStack Query trong tab đó vẫn giữ nguyên dữ liệu cũ — gồm cả
 * order_items của từng phiếu.
 *
 * CÁCH DÙNG (làm trên máy đang mở tab, KHÔNG F5):
 *   1. Nhấn F12 mở DevTools → tab Console.
 *   2. Nếu Chrome bảo "Warning: Don't paste code..." thì gõ:  allow pasting  rồi Enter.
 *   3. Dán TOÀN BỘ file này vào Console → Enter.
 *   4. Trình duyệt sẽ tự tải về file k9-cache-<thời-gian>.json.
 *   5. Gửi file JSON đó về, đừng sửa gì bên trong.
 *
 * Không ghi, không sửa, không gọi mạng — chỉ đọc RAM và tải file xuống.
 */
(() => {
  const log = (...a) => console.log("%c[K9-RESCUE]", "color:#0a0;font-weight:bold", ...a);

  // ---- 1. Tìm QueryClient trong cây React (build production vẫn giữ __reactFiber$) ----
  function findQueryClient() {
    const hosts = [document.getElementById("root"), document.body, ...document.body.children];
    for (const host of hosts) {
      if (!host) continue;
      const fk = Object.keys(host).find(
        (k) => k.startsWith("__reactContainer$") || k.startsWith("__reactFiber$"),
      );
      if (!fk) continue;
      const seen = new Set();
      const stack = [host[fk]];
      while (stack.length) {
        const f = stack.pop();
        if (!f || seen.has(f)) continue;
        seen.add(f);
        for (const bag of [f.memoizedProps, f.pendingProps]) {
          const c = bag && bag.client;
          if (c && typeof c.getQueryCache === "function") return c;
        }
        // context value của QueryClientProvider
        const ctx = f.memoizedState && f.memoizedState.memoizedState;
        if (ctx && typeof ctx.getQueryCache === "function") return ctx;
        if (f.child) stack.push(f.child);
        if (f.sibling) stack.push(f.sibling);
        if (seen.size > 200000) break;
      }
    }
    return null;
  }

  const client = findQueryClient();
  if (!client) {
    console.error(
      "[K9-RESCUE] Không tìm thấy QueryClient. Tab này có thể đã F5 hoặc không phải trang portal.\n" +
        "Cách dự phòng: mở từng phiếu trên màn hình và chụp ảnh bảng dòng hàng.",
    );
    return;
  }

  // ---- 2. Xuất toàn bộ cache ----
  const all = client.getQueryCache().getAll();
  const dump = all.map((q) => ({
    queryKey: q.queryKey,
    dataUpdatedAt: q.state && q.state.dataUpdatedAt,
    dataUpdatedAtISO:
      q.state && q.state.dataUpdatedAt ? new Date(q.state.dataUpdatedAt).toISOString() : null,
    data: q.state && q.state.data,
  }));

  // ---- 3. Đếm nhanh xem cứu được gì ----
  let orders = 0;
  let lines = 0;
  const codes = new Set();
  const visit = (v, depth) => {
    if (!v || depth > 6) return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    if (typeof v !== "object") return;
    if (v.order_code && Array.isArray(v.order_items)) {
      if (!codes.has(v.order_code)) {
        codes.add(v.order_code);
        orders += 1;
        lines += v.order_items.length;
      }
    }
    for (const k of Object.keys(v)) visit(v[k], depth + 1);
  };
  visit(dump, 0);

  log(`Số query trong cache: ${all.length}`);
  log(`Phiếu tìm thấy có kèm dòng hàng: ${orders}`);
  log(`Tổng dòng hàng cứu được: ${lines}`);
  if (orders) log("Mã phiếu:", [...codes].join(", "));
  if (!orders) {
    console.warn(
      "[K9-RESCUE] Cache không chứa phiếu nào kèm dòng hàng. Tab này có thể đã load lại sau khi dữ liệu bị xóa.",
    );
  }

  // ---- 4. Tải file xuống ----
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([JSON.stringify(dump)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `k9-cache-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 5000);
  log("Đã tải file k9-cache-*.json về thư mục Downloads. Gửi file này về.");
})();
