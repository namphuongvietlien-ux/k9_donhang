import { useState, useEffect } from "react";
import { Eye, Loader2, ArrowUpFromLine, Calendar, Package, Plus } from "lucide-react";
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
import StockOutDetailDialog from "@/components/admin/StockOutDetailDialog";
import StockOutFormDialog from "@/components/admin/StockOutFormDialog";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface StockOutTransaction {
  id: string;
  code: string;
  transaction_date: string;
  type: "sale" | "return_to_supplier" | "adjustment" | "damaged" | "sample";
  order_id: string | null;
  order?: {
    order_code: string;
    customer_name: string;
  };
  supplier_id: string | null;
  supplier?: {
    name: string;
  };
  reference_number: string | null;
  sales_channel: string | null;
  ecommerce_order_id: string | null;
  total_cost: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const typeLabels: Record<string, string> = {
  sale: "Xuất bán hàng",
  return_to_supplier: "Trả nhà cung cấp",
  adjustment: "Điều chỉnh",
  damaged: "Hàng hỏng/hết hạn",
  sample: "Hàng mẫu/biếu tặng",
};

const salesChannelLabels: Record<string, string> = {
  website: "Website",
  shopee: "Shopee",
  tiktok: "TikTok Shop",
  ghn: "GHN",
  jt: "J&T Express",
};

const AdminStockOut = () => {
  const [transactions, setTransactions] = useState<StockOutTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<StockOutTransaction | null>(null);
  const { toast } = useToast();

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from("stock_out_transactions")
        .select(`
          *,
          order:orders(order_code, customer_name),
          supplier:suppliers(name)
        `)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching stock out transactions:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải danh sách phiếu xuất",
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
  }, [searchQuery, typeFilter, channelFilter]);

  const searchFilters: SearchFilter[] = [
    {
      key: "type",
      label: "Loại xuất",
      options: [
        { value: "sale", label: "Xuất bán hàng" },
        { value: "return_to_supplier", label: "Trả nhà cung cấp" },
        { value: "adjustment", label: "Điều chỉnh" },
        { value: "damaged", label: "Hàng hỏng/hết hạn" },
        { value: "sample", label: "Hàng mẫu/biếu tặng" },
      ],
    },
    {
      key: "sales_channel",
      label: "Kênh bán hàng",
      options: [
        { value: "website", label: "Website" },
        { value: "shopee", label: "Shopee" },
        { value: "tiktok", label: "TikTok Shop" },
        { value: "ghn", label: "GHN" },
        { value: "jt", label: "J&T Express" },
      ],
    },
  ];

  const filteredTransactions = transactions.filter((transaction) => {
    const matchesSearch =
      !searchQuery ||
      transaction.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transaction.order?.order_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transaction.supplier?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transaction.reference_number?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType =
      typeFilter === "all" || transaction.type === typeFilter;

    const matchesChannel =
      channelFilter === "all" || transaction.sales_channel === channelFilter;

    return matchesSearch && matchesType && matchesChannel;
  });

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price) + "₫";
  };

  const handleViewDetail = (transaction: StockOutTransaction) => {
    setSelectedTransaction(transaction);
    setIsDetailOpen(true);
  };

  if (loading) {
    return (
      <AdminLayout>
        <SEO title="Quản lý xuất kho" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SEO title="Quản lý xuất kho" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Quản lý xuất kho</h1>
            <p className="text-muted-foreground mt-1">
              Xem danh sách phiếu xuất kho (tự động từ đơn hàng hoặc thủ công)
            </p>
          </div>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Tạo phiếu xuất
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Danh sách phiếu xuất</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminSearchBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              filters={searchFilters}
              onFilterChange={(key, value) => {
                if (key === "type") setTypeFilter(value);
                if (key === "sales_channel") setChannelFilter(value);
              }}
            />

            {filteredTransactions.length === 0 ? (
              <div className="text-center py-12">
                <ArrowUpFromLine className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery || typeFilter !== "all"
                    ? "Không tìm thấy phiếu xuất nào"
                    : "Chưa có phiếu xuất nào"}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-md border mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mã phiếu</TableHead>
                        <TableHead>Ngày xuất</TableHead>
                        <TableHead>Loại</TableHead>
                        <TableHead>Kênh bán hàng</TableHead>
                        <TableHead>Đơn hàng/Nhà cung cấp</TableHead>
                        <TableHead>Tổng giá vốn</TableHead>
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
                            {transaction.sales_channel ? (
                              <Badge variant="secondary">
                                {salesChannelLabels[transaction.sales_channel] || transaction.sales_channel}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {transaction.order ? (
                              <div>
                                <div className="font-medium">{transaction.order.order_code}</div>
                                <div className="text-sm text-muted-foreground">
                                  {transaction.order.customer_name}
                                </div>
                              </div>
                            ) : transaction.supplier ? (
                              <div className="flex items-center gap-1">
                                <Package className="w-3 h-3 text-muted-foreground" />
                                {transaction.supplier.name}
                              </div>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatPrice(transaction.total_cost)}
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

      <StockOutDetailDialog
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        transaction={selectedTransaction}
      />

      <StockOutFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSuccess={() => {
          fetchTransactions();
        }}
      />
    </AdminLayout>
  );
};

export default AdminStockOut;

