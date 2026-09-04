import * as XLSX from "xlsx";
import type { WarehouseOrder } from "@/hooks/useWarehouseOrders";
import { warehouseShortLabel } from "@/lib/warehouseMeta";
import { WAREHOUSE_STATUS_LABELS } from "@/lib/warehouseOrders";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function flattenOrders(orders: WarehouseOrder[]) {
  const rows: Record<string, string | number>[] = [];
  for (const order of orders) {
    const items = order.order_items.length ? order.order_items : [null];
    for (const item of items) {
      rows.push({
        "Mã đơn": order.order_code || "",
        Loại: order.order_kind || "",
        "Trạng thái": WAREHOUSE_STATUS_LABELS[order.status] || order.status,
        "Kho xuất": warehouseShortLabel(order.source_warehouse),
        "Kho nhận": warehouseShortLabel(order.warehouse),
        "Ngày tạo": order.created_at
          ? new Date(order.created_at).toLocaleString("vi-VN")
          : "",
        "Ngày soạn": order.packing_date || "",
        "Mã hàng": item?.product_slug || "",
        "Tên hàng": item?.product_name || "",
        ĐVT: item?.unit || "",
        "SL đặt": item?.qty_requested ?? item?.quantity ?? "",
        "SL soạn": item?.qty_packed ?? "",
        "SL nhận": item?.qty_received ?? "",
        "Đơn giá": item?.price ?? "",
        "Ghi chú dòng": item?.line_notes || "",
        "Ghi chú đơn": order.notes || "",
      });
    }
  }
  return rows;
}

export function exportWarehouseOrdersExcel(
  orders: WarehouseOrder[],
  filename: string,
) {
  const rows = flattenOrders(orders);
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "Mã đơn": "" }]);
  sheet["!cols"] = [
    { wch: 18 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 36 }, { wch: 8 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 24 }, { wch: 28 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Don hang");
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export function exportWarehouseOrdersCsv(
  orders: WarehouseOrder[],
  filename: string,
) {
  const rows = flattenOrders(orders);
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "Mã đơn": "" }]);
  const csv = XLSX.utils.sheet_to_csv(sheet);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const name = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  downloadBlob(name, blob);
}
