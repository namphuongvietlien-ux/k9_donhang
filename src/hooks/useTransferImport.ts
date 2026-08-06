import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  checkDuplicateBeforeSave,
  type DuplicatePreSaveResult,
} from "@/hooks/useOrderImport";
import {
  buildTransferOrderPayload,
  buildTransferSkuSignature,
  type ParsedTransferImport,
  type TransferVoucherDraft,
} from "@/lib/transferImport";

export interface TransferImportProgress {
  phase: "dup_check" | "orders" | "done";
  /** 0–100 */
  percent: number;
  message: string;
}

export interface TransferImportResult {
  productsCreated: number;
  vouchersCreated: number;
  itemsCreated: number;
  uniqueSkuCount: number;
  loiMaCount: number;
  orderCodes: string[];
}

export type TransferImportProgressCb = (p: TransferImportProgress) => void;

async function insertVoucher(
  voucher: TransferVoucherDraft,
  duplicateAccepted: boolean,
): Promise<{ orderCode: string; itemCount: number }> {
  const { orderRow, itemRows, orderCode } = buildTransferOrderPayload(voucher);
  if (!itemRows.length) {
    throw new Error(`Phiếu ${orderCode} không có dòng hợp lệ.`);
  }

  if (duplicateAccepted) {
    (orderRow as { duplicate_accepted: boolean }).duplicate_accepted = true;
  }

  let finalCode = orderCode;
  const { data: clash } = await supabase
    .from("orders")
    .select("id")
    .eq("order_code", finalCode)
    .maybeSingle();
  if (clash) {
    finalCode = `${orderCode}-${Math.floor(100 + Math.random() * 900)}`;
    (orderRow as { order_code: string }).order_code = finalCode;
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert(orderRow as never)
    .select("id, order_code")
    .single();

  if (orderErr || !order) {
    throw new Error(orderErr?.message || `Không tạo được phiếu ${finalCode}`);
  }

  const orderId = (order as { id: string }).id;
  const itemsPayload = itemRows.map((it) => ({ ...it, order_id: orderId }));

  const CHUNK = 200;
  for (let i = 0; i < itemsPayload.length; i += CHUNK) {
    const slice = itemsPayload.slice(i, i + CHUNK);
    const { error: itemsErr } = await supabase
      .from("order_items")
      .insert(slice as never);

    if (itemsErr) {
      await supabase.from("orders").delete().eq("id", orderId);
      throw new Error(itemsErr.message || "Không ghi được chi tiết phiếu.");
    }
  }

  return {
    orderCode: (order as { order_code: string }).order_code || finalCode,
    itemCount: itemsPayload.length,
  };
}

/** Quét trùng ≤5 phút cho từng phiếu (cùng kho nhận) trước khi insert */
export async function scanTransferDuplicates(
  vouchers: TransferVoucherDraft[],
): Promise<DuplicatePreSaveResult[]> {
  const hits: DuplicatePreSaveResult[] = [];
  for (const v of vouchers) {
    const sig = buildTransferSkuSignature(v.lines);
    const dup = await checkDuplicateBeforeSave(
      v.destWarehouseId,
      v.totalQty,
      sig,
    );
    if (dup.isDuplicate) hits.push(dup);
  }
  return hits;
}

export function useCommitTransferImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      parsed: ParsedTransferImport;
      acknowledgeDuplicate?: boolean;
      onProgress?: TransferImportProgressCb;
    }): Promise<TransferImportResult> => {
      const { parsed, onProgress } = input;
      const acknowledgeDuplicate = !!input.acknowledgeDuplicate;

      if (!parsed.vouchers.length) {
        throw new Error(
          "Không có phiếu hợp lệ để import. Kiểm tra kho xuất/nhận và số lượng.",
        );
      }

      onProgress?.({
        phase: "dup_check",
        percent: 8,
        message: "Đang kiểm tra đơn trùng (≤5 phút)…",
      });

      const dups = await scanTransferDuplicates(parsed.vouchers);
      if (dups.length > 0 && !acknowledgeDuplicate) {
        const peer = dups[0];
        const err = new Error(
          `DUP:${peer.peerOrderCode || peer.peerId}:${peer.reason || ""}`,
        );
        (err as Error & { duplicate: DuplicatePreSaveResult }).duplicate =
          peer;
        (err as Error & { duplicates: DuplicatePreSaveResult[] }).duplicates =
          dups;
        throw err;
      }

      const allLines = parsed.vouchers.flatMap((v) => v.lines);
      const uniqueSkuCount = new Set(
        allLines.map((l) => l.maHang || l.productSlug || ""),
      ).size;
      const loiMaCount = allLines.filter((l) => l.isLoiMa).length;

      // KHÔNG upsert products — LỖI MÃ giữ nguyên slug "LỖI MÃ"

      const orderCodes: string[] = [];
      let itemsCreated = 0;
      const totalV = parsed.vouchers.length;

      for (let vi = 0; vi < totalV; vi++) {
        const voucher = parsed.vouchers[vi];
        onProgress?.({
          phase: "orders",
          percent: 15 + Math.round((vi / Math.max(totalV, 1)) * 80),
          message: `Đang tạo phiếu ${vi + 1}/${totalV} (${voucher.sourceLabel} → ${voucher.destLabel})…`,
        });
        const res = await insertVoucher(voucher, acknowledgeDuplicate);
        orderCodes.push(res.orderCode);
        itemsCreated += res.itemCount;
      }

      onProgress?.({
        phase: "done",
        percent: 100,
        message: "Hoàn tất — đang làm mới dữ liệu…",
      });

      return {
        productsCreated: 0,
        vouchersCreated: parsed.vouchers.length,
        itemsCreated,
        uniqueSkuCount,
        loiMaCount,
        orderCodes,
      };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["internal-transfers"] }),
        queryClient.invalidateQueries({ queryKey: ["warehouse-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["packing-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["import-catalog-stock"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      ]);
    },
  });
}
