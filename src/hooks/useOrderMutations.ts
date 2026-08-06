/**
 * GAS Phase 1 — mutations vòng đời phiếu DH/DC.
 * Re-export tên chuẩn nghiệp vụ từ useWarehouseOrders.
 */
export {
  useWarehouseOrderMutations as useOrderMutations,
  useWarehouseOrders,
  useWarehouseOrder,
  type SaveOrderInput,
  type UpdateOrderInput,
  type WarehouseOrder,
  type WarehouseOrderItem,
  type WarehouseOrderFilters,
} from "@/hooks/useWarehouseOrders";
