import AdminLayout from "@/components/admin/AdminLayout";
import CatalogStockImport from "@/components/admin/CatalogStockImport";
import SEO from "@/components/SEO";

const AdminCatalogStockImport = () => {
  return (
    <AdminLayout>
      <SEO title="Import danh mục & tồn kho | Kho K9" />
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Import danh mục &amp; tồn kho</h1>
          <p className="text-muted-foreground mt-1">
            Thay Google Sheets: mỗi ngày kéo file{" "}
            <strong>TỔNG HỢP TỒN KHO</strong> (MISA) — cột Cuối kỳ theo từng
            Cửa hàng. Có thể nhập khẩu danh mục riêng.
          </p>
        </div>
        <CatalogStockImport />
      </div>
    </AdminLayout>
  );
};

export default AdminCatalogStockImport;
