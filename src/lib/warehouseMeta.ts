/**
 * Fallback nhãn + địa chỉ kho khi DB chưa có cột address/short_name.
 *
 * Theo nghiệp vụ K9 (xác nhận 2026-08):
 * - Kho Địa điểm kinh doanh 06 (code Q4_275) = Q4 Cũ
 * - Kho Địa điểm kinh doanh 01 (code Q4_178) = Q4 Mới
 */
export const WAREHOUSE_PRINT_META: Record<
  string,
  { short_name: string; print_name: string; address: string }
> = {
  Q7: {
    short_name: "Q7",
    print_name: "Q7",
    address: "Kho Q7 — Lê Văn Lương, P. Tân Hưng, Q.7, TP.HCM",
  },
  Q8: {
    short_name: "Q8",
    print_name: "Q8",
    address: "86 Dương Bá Trạc, Q.8, TP.HCM",
  },
  PH: {
    short_name: "PH",
    print_name: "PH",
    address: "237 Phạm Hùng, Q.8, TP.HCM",
  },
  Q5: {
    short_name: "Q5",
    print_name: "Q5",
    address: "7 Trần Hưng Đạo, Q.5, TP.HCM",
  },
  Q1: {
    short_name: "Q1",
    print_name: "Q1",
    address: "140 Nguyễn Văn Cừ, Q.1, TP.HCM",
  },
  Q4_178: {
    short_name: "Q4 Mới",
    print_name: "Q4 Mới",
    address: "178 Hoàng Diệu, Q.4, TP.HCM",
  },
  Q4_275: {
    short_name: "Q4 Cũ",
    print_name: "Q4 Cũ",
    address: "275 Hoàng Diệu, Q.4, TP.HCM",
  },
};

export function enrichWarehouseMeta<
  T extends {
    code?: string | null;
    address?: string | null;
    short_name?: string | null;
    print_name?: string | null;
  },
>(w: T | null | undefined): T | null {
  if (!w?.code) return (w as T) || null;
  const fb = WAREHOUSE_PRINT_META[w.code];
  if (!fb) return w;
  return {
    ...w,
    short_name: w.short_name || fb.short_name,
    print_name: w.print_name || fb.print_name,
    address: w.address || fb.address,
  };
}
