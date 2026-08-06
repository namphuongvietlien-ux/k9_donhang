import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import PackingWeekCalendar from "@/components/admin/PackingWeekCalendar";
import DuplicateAlertBanner from "@/components/admin/DuplicateAlertBanner";
import WarehouseOrderDetail from "@/components/admin/WarehouseOrderDetail";
import SEO from "@/components/SEO";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const AdminPackingCalendar = () => {
  const [detailId, setDetailId] = useState<string | null>(null);

  return (
    <AdminLayout>
      <SEO title="Lịch gom đơn đa kho | Admin" />
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Lịch gom đơn & phân ca</h1>
          <p className="text-muted-foreground mt-1">
            Theo dõi đơn theo mã kho — bấm phiếu để nhập SL soạn hàng.
          </p>
        </div>

        <DuplicateAlertBanner />

        <PackingWeekCalendar onSelectOrder={(id) => setDetailId(id)} />
      </div>

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Soạn hàng / chi tiết phiếu</DialogTitle>
          </DialogHeader>
          {detailId && (
            <WarehouseOrderDetail
              orderId={detailId}
              onClose={() => setDetailId(null)}
              variant="packing"
            />
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminPackingCalendar;
