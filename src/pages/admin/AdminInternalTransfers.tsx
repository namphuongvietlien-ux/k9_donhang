import { useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import InternalTransferBoard from "@/components/admin/InternalTransferBoard";
import TransferExcelImport from "@/components/admin/TransferExcelImport";
import SEO from "@/components/SEO";

const AdminInternalTransfers = () => {
  const queryClient = useQueryClient();

  return (
    <AdminLayout>
      <SEO title="Điều chuyển nội bộ | Kho K9" />
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Điều chuyển nội bộ</h1>
          <p className="text-muted-foreground mt-1">
            Import Excel/CSV và theo dõi luồng hàng giữa các chi nhánh K9.
          </p>
        </div>

        <TransferExcelImport
          onSuccess={() => {
            void queryClient.invalidateQueries({
              queryKey: ["internal-transfers"],
            });
          }}
        />

        <InternalTransferBoard />
      </div>
    </AdminLayout>
  );
};

export default AdminInternalTransfers;
