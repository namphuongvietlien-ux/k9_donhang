import { useAuth } from "@/contexts/AuthContext";

/**
 * Phạm vi kho của user đăng nhập (GAS sessionUser.store).
 * - Admin / Tất cả → warehouseId = null, isStoreScoped = false
 * - Chi nhánh → khóa cứng 1 warehouse_id trên profiles
 */
export function useStoreScope() {
  const {
    warehouseId,
    warehouseCode,
    warehouseLabel,
    username,
    isStoreScoped,
    role,
  } = useAuth();

  const isAdminScope =
    !isStoreScoped &&
    (role === "super_admin" || role === "manager" || role === null);

  return {
    warehouseId,
    warehouseCode,
    warehouseLabel,
    username,
    /** Có gắn 1 kho cụ thể — UI phải khóa chọn kho */
    isStoreScoped,
    /** Được xem/sửa mọi kho */
    isAdminScope,
  };
}
