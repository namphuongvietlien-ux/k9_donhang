import { useState, useEffect } from "react";
import { Plus, Eye, Loader2, ArrowDownToLine, Calendar, Building2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import StockInFormDialog from "@/components/admin/StockInFormDialog";
import StockInDetailDialog from "@/components/admin/StockInDetailDialog";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface StockInTransaction {
  id: string;
  code: string;
  transaction_date: string;
  type: "purchase" | "return" | "adjustment" | "production";
  supplier_id: string | null;
  supplier?: {
    name: string;
  };
  reference_number: string | null;
  reference_date: string | null;
  total_amount: number;
  is_paid: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const typeLabels: Record<string, string> = {
  purchase: "Nhập từ nhà cung cấp",
  return: "Nhập hàng trả lại",
  adjustment: "Điều chỉnh",
  production: "Từ sản xuất",
};

const AdminStockIn = () => {
  const [transactions, setTransactions] = useState<StockInTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<StockInTransaction | null>(null);
  const { toast } = useToast();

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from("stock_in_transactions")
        .select(`
          *,
          supplier:suppliers(name)
        `)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching stock in transactions:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải danh sách phiếu nhập",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, typeFilter]);

  const searchFilters: SearchFilter[] = [
    {
      key: "type",
      label: "Loại nhập",
      options: [
        { value: "purchase", label: "Nhập từ nhà cung cấp" },
        { value: "return", label: "Nhập hàng trả lại" },
        { value: "adjustment", label: "Điều chỉnh" },
        { value: "production", label: "Từ sản xuất" },
      ],
    },
  ];

  const filteredTransactions = transactions.filter((transaction) => {
    const matchesSearch =
      !searchQuery ||
      transaction.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transaction.supplier?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transaction.reference_number?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType =
      typeFilter === "all" || transaction.type === typeFilter;

    return matchesSearch && matchesType;
  });

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price) + "₫";
  };

  const handleViewDetail = (transaction: StockInTransaction) => {
    setSelectedTransaction(transaction);
    setIsDetailOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    fetchTransactions();
  };

  if (loading) {
    return (
      <AdminLayout>
        <SEO title="Quản lý nhập kho" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SEO title="Quản lý nhập kho" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Quản lý nhập kho</h1>
            <p className="text-muted-foreground mt-1">
              Quản lý các phiếu nhập kho và cập nhật tồn kho
            </p>
          </div>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Tạo phiếu nhập
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Danh sách phiếu nhập</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminSearchBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              filters={searchFilters}
              onFilterChange={(key, value) => {
                if (key === "type") setTypeFilter(value);
              }}
            />

            {filteredTransactions.length === 0 ? (
              <div className="text-center py-12">
                <ArrowDownToLine className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery || typeFilter !== "all"
                    ? "Không tìm thấy phiếu nhập nào"
                    : "Chưa có phiếu nhập nào"}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-md border mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mã phiếu</TableHead>
                        <TableHead>Ngày nhập</TableHead>
                        <TableHead>Loại</TableHead>
                        <TableHead>Nhà cung cấp</TableHead>
                        <TableHead>Số hóa đơn</TableHead>
                        <TableHead>Tổng tiền</TableHead>
                        <TableHead>Thanh toán</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedTransactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell className="font-medium">
                            {transaction.code}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-muted-foreground" />
                              {format(new Date(transaction.transaction_date), "dd/MM/yyyy", {
                                locale: vi,
                              })}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {typeLabels[transaction.type] || transaction.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {transaction.supplier ? (
                              <div className="flex items-center gap-1">
                                <Building2 className="w-3 h-3 text-muted-foreground" />
                                {transaction.supplier.name}
                              </div>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>{transaction.reference_number || "-"}</TableCell>
                          <TableCell className="font-medium">
                            {formatPrice(transaction.total_amount)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={transaction.is_paid ? "default" : "secondary"}
                            >
                              {transaction.is_paid ? "Đã trả" : "Chưa trả"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleViewDetail(transaction)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
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
                  totalItems={filteredTransactions.length}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <StockInFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSuccess={handleFormClose}
      />

      <StockInDetailDialog
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        transaction={selectedTransaction}
      />
    </AdminLayout>
  );
};

export default AdminStockIn;

