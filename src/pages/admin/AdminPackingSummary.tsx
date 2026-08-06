import AdminLayout from "@/components/admin/AdminLayout";
import PackingSummaryBoard from "@/components/admin/PackingSummaryBoard";
import DuplicateAlertBanner from "@/components/admin/DuplicateAlertBanner";
import SEO from "@/components/SEO";

const AdminPackingSummary = () => {
  return (
    <AdminLayout>
      <SEO title="Tổng hợp soạn hàng | Admin" />
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Tổng hợp soạn hàng</h1>
          <p className="text-muted-foreground mt-1">
            Đối chiếu tồn thực tế (<code className="text-xs">stock_on_hand</code>) với tổng đặt theo
            ca.
          </p>
        </div>

        <DuplicateAlertBanner />

        <PackingSummaryBoard />
      </div>
    </AdminLayout>
  );
};

export default AdminPackingSummary;
