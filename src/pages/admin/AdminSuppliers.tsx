import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Loader2, Building2, Phone, Mail, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminSearchBar, { SearchFilter } from "@/components/admin/AdminSearchBar";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import SupplierFormDialog from "@/components/admin/SupplierFormDialog";

interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_code: string | null;
  bank_account: string | null;
  bank_name: string | null;
  payment_terms: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const AdminSuppliers = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteSupplier, setDeleteSupplier] = useState<Supplier | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const { toast } = useToast();

  const fetchSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSuppliers(data || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching suppliers:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải danh sách nhà cung cấp",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  // Reset to page 1 when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const searchFilters: SearchFilter[] = [
    {
      key: "status",
      label: "Trạng thái",
      options: [
        { value: "active", label: "Đang hoạt động" },
        { value: "inactive", label: "Ngừng hoạt động" },
      ],
    },
  ];

  const handleDelete = async () => {
    if (!deleteSupplier) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("suppliers")
        .delete()
        .eq("id", deleteSupplier.id);

      if (error) throw error;

      toast({
        title: "Đã xóa nhà cung cấp",
        description: `Nhà cung cấp "${deleteSupplier.name}" đã được xóa`,
      });
      fetchSuppliers();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error deleting supplier:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể xóa nhà cung cấp",
      });
    } finally {
      setIsDeleting(false);
      setDeleteSupplier(null);
    }
  };

  const filteredSuppliers = suppliers.filter((supplier) => {
    // Search filter
    const matchesSearch =
      !searchQuery ||
      supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      supplier.email?.toLowerCase().includes(searchQuery.toLowerCase());

    // Status filter
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && supplier.is_active) ||
      (statusFilter === "inactive" && !supplier.is_active);

    return matchesSearch && matchesStatus;
  });

  // Pagination
  const totalPages = Math.ceil(filteredSuppliers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedSuppliers = filteredSuppliers.slice(startIndex, endIndex);

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setIsFormOpen(true);
  };

  const handleAdd = () => {
    setEditingSupplier(null);
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingSupplier(null);
    fetchSuppliers();
  };

  if (loading) {
    return (
      <AdminLayout>
        <SEO title="Quản lý nhà cung cấp" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SEO title="Quản lý nhà cung cấp" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Quản lý nhà cung cấp</h1>
            <p className="text-muted-foreground mt-1">
              Quản lý thông tin nhà cung cấp và đối tác
            </p>
          </div>
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Thêm nhà cung cấp
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Danh sách nhà cung cấp</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminSearchBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              filters={searchFilters}
              onFilterChange={(key, value) => {
                if (key === "status") setStatusFilter(value);
              }}
            />

            {filteredSuppliers.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery || statusFilter !== "all"
                    ? "Không tìm thấy nhà cung cấp nào"
                    : "Chưa có nhà cung cấp nào"}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-md border mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mã</TableHead>
                        <TableHead>Tên nhà cung cấp</TableHead>
                        <TableHead>Người liên hệ</TableHead>
                        <TableHead>Điện thoại</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Số ngày nợ</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedSuppliers.map((supplier) => (
                        <TableRow key={supplier.id}>
                          <TableCell className="font-medium">
                            {supplier.code}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{supplier.name}</div>
                            {supplier.address && (
                              <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                <MapPin className="w-3 h-3" />
                                {supplier.address}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{supplier.contact_person || "-"}</TableCell>
                          <TableCell>
                            {supplier.phone ? (
                              <div className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-muted-foreground" />
                                {supplier.phone}
                              </div>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            {supplier.email ? (
                              <div className="flex items-center gap-1">
                                <Mail className="w-3 h-3 text-muted-foreground" />
                                {supplier.email}
                              </div>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>{supplier.payment_terms} ngày</TableCell>
                          <TableCell>
                            <Badge
                              variant={supplier.is_active ? "default" : "secondary"}
                            >
                              {supplier.is_active ? "Hoạt động" : "Ngừng hoạt động"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(supplier)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteSupplier(supplier)}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <AdminPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  itemsPerPage={itemsPerPage}
                  onItemsPerPageChange={setItemsPerPage}
                  totalItems={filteredSuppliers.length}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <SupplierFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        supplier={editingSupplier}
        onSuccess={handleFormClose}
      />

      <AlertDialog
        open={!!deleteSupplier}
        onOpenChange={(open) => !open && setDeleteSupplier(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa nhà cung cấp "{deleteSupplier?.name}"? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang xóa...
                </>
              ) : (
                "Xóa"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminSuppliers;

