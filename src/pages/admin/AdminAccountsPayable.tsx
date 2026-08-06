import { useState, useEffect } from "react";
import { Plus, Eye, Loader2, AlertTriangle, Calendar, Building2, DollarSign } from "lucide-react";
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
import PaymentFormDialog from "@/components/admin/PaymentFormDialog";
import AccountsPayableDetailDialog from "@/components/admin/AccountsPayableDetailDialog";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface AccountsPayable {
  id: string;
  supplier_id: string;
  supplier: {
    name: string;
  };
  stock_in_id: string | null;
  stock_in?: {
    code: string;
  };
  reference_number: string | null;
  reference_date: string | null;
  due_date: string;
  original_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: "pending" | "partial" | "paid" | "overdue";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const AdminAccountsPayable = () => {
  const [accounts, setAccounts] = useState<AccountsPayable[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountsPayable | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const { toast } = useToast();

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from("accounts_payable")
        .select(`
          *,
          supplier:suppliers(name),
          stock_in:stock_in_transactions(code)
        `)
        .order("due_date", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching accounts payable:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải danh sách công nợ phải trả",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const searchFilters: SearchFilter[] = [
    {
      key: "status",
      label: "Trạng thái",
      options: [
        { value: "pending", label: "Chưa trả" },
        { value: "partial", label: "Trả một phần" },
        { value: "paid", label: "Đã trả đủ" },
        { value: "overdue", label: "Quá hạn" },
      ],
    },
  ];

  const filteredAccounts = accounts.filter((account) => {
    const matchesSearch =
      !searchQuery ||
      account.supplier?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.reference_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.stock_in?.code?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || account.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredAccounts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAccounts = filteredAccounts.slice(startIndex, endIndex);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price) + "₫";
  };

  const getStatusBadge = (account: AccountsPayable) => {
    const isOverdue = new Date(account.due_date) < new Date() && account.remaining_amount > 0;
    
    if (account.status === "paid") {
      return <Badge variant="default">Đã trả đủ</Badge>;
    }
    if (account.status === "partial") {
      return <Badge variant="outline">Trả một phần</Badge>;
    }
    if (isOverdue || account.status === "overdue") {
      return (
        <Badge variant="destructive">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Quá hạn
        </Badge>
      );
    }
    return <Badge variant="secondary">Chưa trả</Badge>;
  };

  const handleMakePayment = (account: AccountsPayable) => {
    setSelectedAccount(account);
    setIsPaymentOpen(true);
  };

  const handleViewDetail = (account: AccountsPayable) => {
    setSelectedAccount(account);
    setIsDetailOpen(true);
  };

  const handlePaymentSuccess = () => {
    setIsPaymentOpen(false);
    setSelectedAccount(null);
    fetchAccounts();
  };

  const totalPayable = accounts.reduce((sum, acc) => sum + acc.remaining_amount, 0);
  const overdueCount = accounts.filter(
    (acc) => new Date(acc.due_date) < new Date() && acc.remaining_amount > 0
  ).length;

  if (loading) {
    return (
      <AdminLayout>
        <SEO title="Quản lý công nợ phải trả" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SEO title="Quản lý công nợ phải trả" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Quản lý công nợ phải trả</h1>
            <p className="text-muted-foreground mt-1">
              Quản lý công nợ với nhà cung cấp và thanh toán
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tổng công nợ phải trả
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPrice(totalPayable)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Công nợ quá hạn
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{overdueCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tổng số công nợ
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{accounts.length}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Danh sách công nợ phải trả</CardTitle>
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

            {filteredAccounts.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery || statusFilter !== "all"
                    ? "Không tìm thấy công nợ nào"
                    : "Chưa có công nợ phải trả nào"}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-md border mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nhà cung cấp</TableHead>
                        <TableHead>Số hóa đơn</TableHead>
                        <TableHead>Ngày hóa đơn</TableHead>
                        <TableHead>Ngày đáo hạn</TableHead>
                        <TableHead>Số tiền</TableHead>
                        <TableHead>Đã trả</TableHead>
                        <TableHead>Còn nợ</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedAccounts.map((account) => (
                        <TableRow
                          key={account.id}
                          className={
                            new Date(account.due_date) < new Date() &&
                            account.remaining_amount > 0
                              ? "bg-destructive/5"
                              : ""
                          }
                        >
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-muted-foreground" />
                              {account.supplier?.name}
                            </div>
                          </TableCell>
                          <TableCell>{account.reference_number || "-"}</TableCell>
                          <TableCell>
                            {account.reference_date
                              ? format(new Date(account.reference_date), "dd/MM/yyyy", {
                                  locale: vi,
                                })
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-muted-foreground" />
                              {format(new Date(account.due_date), "dd/MM/yyyy", {
                                locale: vi,
                              })}
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatPrice(account.original_amount)}
                          </TableCell>
                          <TableCell>{formatPrice(account.paid_amount)}</TableCell>
                          <TableCell className="font-medium">
                            {formatPrice(account.remaining_amount)}
                          </TableCell>
                          <TableCell>{getStatusBadge(account)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {account.remaining_amount > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleMakePayment(account)}
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Thanh toán
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleViewDetail(account)}
                              >
                                <Eye className="w-4 h-4" />
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
                  totalItems={filteredAccounts.length}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <PaymentFormDialog
        open={isPaymentOpen}
        onOpenChange={setIsPaymentOpen}
        accountsPayable={selectedAccount}
        onSuccess={handlePaymentSuccess}
      />

      <AccountsPayableDetailDialog
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        account={selectedAccount}
      />
    </AdminLayout>
  );
};

export default AdminAccountsPayable;

