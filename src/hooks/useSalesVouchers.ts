import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  generateXbCode,
  isSalesServiceLine,
  normalizeInvoiceNo,
} from "@/lib/salesVoucher";
import { notifyWarehouseEvent } from "@/lib/telegramNotify";
import { warehouseShortLabel } from "@/lib/warehouseMeta";

export type SalesLineKind = "HANG" | "DV";

export interface SalesVoucherItem {
  id: string;
  voucher_id: string;
  product_slug: string | null;
  barcode: string | null;
  product_name: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  line_kind: string;
  service_cost: number | null;
  line_notes: string | null;
  sort_order: number;
}

export interface SalesVoucher {
  id: string;
  voucher_code: string;
  invoice_no: string;
  warehouse_id: string | null;
  warehouse_code: string | null;
  warehouse_name: string | null;
  status: string;
  notes: string | null;
  total_amount?: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sales_voucher_items?: SalesVoucherItem[];
  itemCount?: number;
  totalQty?: number;
}

export interface CreateSalesLineInput {
  productName: string;
  productSlug?: string | null;
  barcode?: string | null;
  unit?: string | null;
  quantity: number;
  unitPrice?: number;
  lineKind?: string | null;
  /** Phí DV — chỉ dùng khi lineKind = DV */
  serviceCost?: number | null;
  lineNotes?: string | null;
}

export function validateSalesLines(lines: CreateSalesLineInput[]): string[] {
  const errs: string[] = [];
  if (!lines.length) errs.push("Chưa có dòng hàng/dịch vụ.");
  lines.forEach((l, i) => {
    const qty = Number(l.quantity);
    if (!(qty > 0)) errs.push(`Dòng ${i + 1}: Số lượng phải > 0.`);
    if (!String(l.productName || "").trim()) {
      errs.push(`Dòng ${i + 1}: Thiếu tên hàng/dịch vụ.`);
    }
  });
  return errs;
}

function mapVoucherRow(v: SalesVoucher): SalesVoucher {
  const items = v.sales_voucher_items || [];
  return {
    ...v,
    itemCount: items.length,
    totalQty: items.reduce((s, i) => s + (Number(i.quantity) || 0), 0),
  };
}

async function fetchSalesVouchers(opts: {
  days?: number;
  search?: string;
  status?: string;
  warehouseCode?: string;
  limit?: number;
}): Promise<SalesVoucher[]> {
  const days = opts.days ?? 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  let q = supabase
    .from("sales_vouchers")
    .select(
      `
      id, voucher_code, invoice_no, warehouse_id, warehouse_code, warehouse_name,
      status, notes, total_amount, created_by, created_at, updated_at,
      sales_voucher_items ( id, quantity, line_kind, product_name, line_total )
    `,
    )
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 300);

  if (opts.status && opts.status !== "ALL") {
    q = q.eq("status", opts.status);
  }
  if (opts.warehouseCode && opts.warehouseCode !== "ALL") {
    q = q.eq("warehouse_code", opts.warehouseCode);
  }

  const { data, error } = await q;
  if (error) {
    // Bảng chưa tạo (migration 000008) — không crash UI
    if (
      /sales_vouchers|PGRST205|schema cache|does not exist|404/i.test(
        error.message || "",
      ) ||
      (error as { code?: string }).code === "PGRST205" ||
      (error as { code?: string }).code === "42P01"
    ) {
      console.warn(
        "[sales_vouchers] bảng chưa có — chạy SQL scripts/sql-apply-all-pending.sql",
      );
      return [];
    }
    // total_amount chưa có — thử lại không cột đó
    if (/total_amount/i.test(error.message || "")) {
      const fb = await supabase
        .from("sales_vouchers")
        .select(
          `
          id, voucher_code, invoice_no, warehouse_id, warehouse_code, warehouse_name,
          status, notes, created_by, created_at, updated_at,
          sales_voucher_items ( id, quantity, line_kind, product_name, line_total )
        `,
        )
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(opts.limit ?? 300);
      if (fb.error) {
        if (/sales_vouchers|PGRST205|schema cache/i.test(fb.error.message || "")) {
          return [];
        }
        throw fb.error;
      }
      let rows = ((fb.data as SalesVoucher[]) || []).map(mapVoucherRow);
      const s = String(opts.search || "")
        .trim()
        .toUpperCase();
      if (s) {
        rows = rows.filter(
          (v) =>
            v.voucher_code.toUpperCase().includes(s) ||
            v.invoice_no.toUpperCase().includes(s) ||
            (v.warehouse_code || "").toUpperCase().includes(s),
        );
      }
      return rows;
    }
    throw error;
  }

  let rows = ((data as SalesVoucher[]) || []).map(mapVoucherRow);
  const s = String(opts.search || "")
    .trim()
    .toUpperCase();
  if (s) {
    rows = rows.filter(
      (v) =>
        v.voucher_code.toUpperCase().includes(s) ||
        v.invoice_no.toUpperCase().includes(s) ||
        (v.warehouse_code || "").toUpperCase().includes(s),
    );
  }
  return rows;
}

export function useSalesVouchers(opts?: {
  days?: number;
  search?: string;
  status?: string;
  warehouseCode?: string;
}) {
  const days = opts?.days ?? 30;
  const search = opts?.search ?? "";
  const status = opts?.status ?? "ALL";
  const warehouseCode = opts?.warehouseCode ?? "ALL";
  return useQuery({
    queryKey: ["sales-vouchers", days, search, status, warehouseCode],
    queryFn: () =>
      fetchSalesVouchers({ days, search, status, warehouseCode }),
    staleTime: 20_000,
  });
}

/** Alias cũ */
export function useRecentSalesVouchers(days = 7) {
  return useSalesVouchers({ days });
}

export function useSalesVoucher(id: string | null) {
  return useQuery({
    queryKey: ["sales-voucher", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_vouchers")
        .select(`*, sales_voucher_items ( * )`)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as SalesVoucher | null;
    },
  });
}

export function useSalesVoucherByCode(code: string | null) {
  const c = String(code || "").trim();
  return useQuery({
    queryKey: ["sales-voucher-code", c],
    enabled: !!c,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_vouchers")
        .select(`*, sales_voucher_items ( * )`)
        .eq("voucher_code", c)
        .maybeSingle();
      if (error) throw error;
      return data as SalesVoucher | null;
    },
  });
}

export function useSalesVoucherMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["sales-vouchers"] });
    void qc.invalidateQueries({ queryKey: ["sales-vouchers-recent"] });
    void qc.invalidateQueries({ queryKey: ["sales-voucher"] });
    void qc.invalidateQueries({ queryKey: ["sales-voucher-code"] });
  };

  const createVoucher = useMutation({
    mutationFn: async (input: {
      invoiceNo: string;
      warehouseId: string;
      warehouseCode: string;
      warehouseName?: string;
      createdBy?: string;
      lines: CreateSalesLineInput[];
    }) => {
      const invoiceNo = normalizeInvoiceNo(input.invoiceNo);
      if (!invoiceNo) {
        throw new Error("Vui lòng nhập Số Hóa Đơn MISA/KiotViet.");
      }
      if (!input.warehouseId) throw new Error("Thiếu chi nhánh xuất bán.");

      const lineErrs = validateSalesLines(input.lines);
      if (lineErrs.length) throw new Error(lineErrs[0]);

      let voucherCode = generateXbCode();
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: exist } = await supabase
          .from("sales_vouchers")
          .select("id")
          .eq("voucher_code", voucherCode)
          .maybeSingle();
        if (!exist) break;
        voucherCode = generateXbCode();
      }

      const rowsPrep = input.lines.map((l, idx) => {
        const isDv = isSalesServiceLine({
          productSlug: l.productSlug,
          productName: l.productName,
          unit: l.unit,
          lineKind: l.lineKind,
        });
        const qty = Number(l.quantity) || 0;
        const price = Number(l.unitPrice) || 0;
        const svc =
          Number(
            l.serviceCost != null ? l.serviceCost : isDv ? price : 0,
          ) || 0;
        const lineTotal = isDv ? svc * qty : price * qty;
        return {
          product_slug: l.productSlug || null,
          barcode: l.barcode || null,
          product_name: l.productName,
          unit: l.unit || null,
          quantity: qty,
          unit_price: isDv ? 0 : price,
          line_total: lineTotal,
          line_kind: (isDv ? "DV" : "HANG") as SalesLineKind,
          service_cost: isDv ? svc : null,
          line_notes: l.lineNotes || null,
          sort_order: idx,
        };
      });

      const totalAmount = rowsPrep.reduce(
        (s, r) => s + (Number(r.line_total) || 0),
        0,
      );

      const { data: voucher, error: vErr } = await supabase
        .from("sales_vouchers")
        .insert({
          voucher_code: voucherCode,
          invoice_no: invoiceNo,
          warehouse_id: input.warehouseId,
          warehouse_code: input.warehouseCode,
          warehouse_name: input.warehouseName || input.warehouseCode,
          status: "saved",
          total_amount: totalAmount,
          created_by: input.createdBy || null,
        } as never)
        .select("id, voucher_code, invoice_no")
        .single();
      if (vErr) throw vErr;

      const voucherId = (voucher as { id: string }).id;
      const rows = rowsPrep.map((r) => ({ ...r, voucher_id: voucherId }));

      const { error: iErr } = await supabase
        .from("sales_voucher_items")
        .insert(rows as never);
      if (iErr) {
        await supabase.from("sales_vouchers").delete().eq("id", voucherId);
        throw iErr;
      }

      void notifyWarehouseEvent({
        event: "xb_created",
        soPhieu: voucherCode,
        khoNhan: warehouseShortLabel({ code: input.warehouseCode }),
        extra: `HĐ ${invoiceNo} · ${rows.length} dòng · ${totalAmount.toLocaleString("vi-VN")}₫`,
      });

      return {
        id: voucherId,
        voucher_code: voucherCode,
        invoice_no: invoiceNo,
        total_amount: totalAmount,
      };
    },
    onSuccess: invalidate,
  });

  const cancelVoucher = useMutation({
    mutationFn: async (voucherId: string) => {
      const { data, error: loadErr } = await supabase
        .from("sales_vouchers")
        .select("id, voucher_code, warehouse_code, status")
        .eq("id", voucherId)
        .single();
      if (loadErr) throw loadErr;
      const v = data as {
        voucher_code: string;
        warehouse_code: string | null;
        status: string;
      };
      if (v.status === "cancelled") throw new Error("Phiếu đã hủy rồi.");

      const { error } = await supabase
        .from("sales_vouchers")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", voucherId);
      if (error) throw error;

      void notifyWarehouseEvent({
        event: "xb_cancelled",
        soPhieu: v.voucher_code,
        khoNhan: warehouseShortLabel({ code: v.warehouse_code }),
      });
    },
    onSuccess: invalidate,
  });

  const restoreVoucher = useMutation({
    mutationFn: async (voucherId: string) => {
      const { data, error: loadErr } = await supabase
        .from("sales_vouchers")
        .select("id, voucher_code, warehouse_code, status")
        .eq("id", voucherId)
        .single();
      if (loadErr) throw loadErr;
      const v = data as {
        voucher_code: string;
        warehouse_code: string | null;
        status: string;
      };
      if (v.status !== "cancelled") {
        throw new Error("Chỉ khôi phục phiếu đã hủy.");
      }

      const { error } = await supabase
        .from("sales_vouchers")
        .update({
          status: "saved",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", voucherId);
      if (error) throw error;

      void notifyWarehouseEvent({
        event: "xb_restored",
        soPhieu: v.voucher_code,
        khoNhan: warehouseShortLabel({ code: v.warehouse_code }),
      });
    },
    onSuccess: invalidate,
  });

  return { createVoucher, cancelVoucher, restoreVoucher };
}
