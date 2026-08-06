import AdminLayout from "@/components/admin/AdminLayout";
import CatalogAdminHub from "@/components/admin/CatalogAdminHub";

const AdminCatalogHub = () => {
  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Danh mục & tồn kho
          </h1>
          <p className="text-sm text-muted-foreground">
            Biến thể Parent_SKU · đồng bộ MISA · badge NEW · khóa đặt hàng · hết
            hàng
          </p>
        </div>
        <CatalogAdminHub />
      </div>
    </AdminLayout>
  );
};

export default AdminCatalogHub;
