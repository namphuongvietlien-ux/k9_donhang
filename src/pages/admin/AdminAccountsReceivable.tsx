import { useState, useEffect } from "react";
import { Plus, Eye, Loader2, AlertTriangle, Calendar, User, DollarSign } from "lucide-react";
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
import CustomerPaymentFormDialog from "@/components/admin/CustomerPaymentFormDialog";
import AccountsReceivableDetailDialog from "@/components/admin/AccountsReceivableDetailDialog";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface AccountsReceivable {
  id: string;
  customer_id: string | null;
  customer?: {
    name: string;
  };
  order_id: string | null;
  order?: {
    order_code: string;
    customer_name: string;
  };
  customer_name: string;
  customer_phone: string | null;
  due_date: string;
  original_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: "pending" | "partial" | "paid" | "overdue";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const AdminAccountsReceivable = () => {
  const [accounts, setAccounts] = useState<AccountsReceivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountsReceivable | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const { toast } = useToast();

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from("accounts_receivable")
        .select(`
          *,
          customer:customers(name),
          order:orders(order_code, customer_name)
        `)
        .order("due_date", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching accounts receivable:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải danh sách công nợ phải thu",
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
  }, [searchQuery, statusFilter, dueDateFrom, dueDateTo]);

  const searchFilters: SearchFilter[] = [
    {
      key: "status",
      label: "Trạng thái",
      options: [
        { value: "pending", label: "Chưa thu" },
        { value: "partial", label: "Thu một phần" },
        { value: "paid", label: "Đã thu đủ" },
        { value: "overdue", label: "Quá hạn" },
      ],
    },
  ];

  const filteredAccounts = accounts.filter((account) => {
    const dueDate = new Date(account.due_date);

    const matchesSearch =
      !searchQuery ||
      account.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.customer_phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.order?.order_code?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || account.status === statusFilter;

    const matchesDueDateFrom =
      !dueDateFrom || dueDate >= new Date(dueDateFrom);

    const matchesDueDateTo =
      !dueDateTo || dueDate <= new Date(dueDateTo);

    return matchesSearch && matchesStatus && matchesDueDateFrom && matchesDueDateTo;
  });

  const totalPages = Math.ceil(filteredAccounts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAccounts = filteredAccounts.slice(startIndex, endIndex);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price) + "₫";
  };

  const getStatusBadge = (account: AccountsReceivable) => {
    const isOverdue = new Date(account.due_date) < new Date() && account.remaining_amount > 0;
    
    if (account.status === "paid") {
      return <Badge variant="default">Đã thu đủ</Badge>;
    }
    if (account.status === "partial") {
      return <Badge variant="outline">Thu một phần</Badge>;
    }
    if (isOverdue || account.status === "overdue") {
      return (
        <Badge variant="destructive">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Quá hạn
        </Badge>
      );
    }
    return <Badge variant="secondary">Chưa thu</Badge>;
  };

  const handleReceivePayment = (account: AccountsReceivable) => {
    setSelectedAccount(account);
    setIsPaymentOpen(true);
  };

  const handleViewDetail = (account: AccountsReceivable) => {
    setSelectedAccount(account);
    setIsDetailOpen(true);
  };

  const handlePaymentSuccess = () => {
    setIsPaymentOpen(false);
    setSelectedAccount(null);
    fetchAccounts();
  };

  const totalReceivable = accounts.reduce((sum, acc) => sum + acc.remaining_amount, 0);
  const overdueCount = accounts.filter(
    (acc) => new Date(acc.due_date) < new Date() && acc.remaining_amount > 0
  ).length;

  if (loading) {
    return (
      <AdminLayout>
        <SEO title="Quản lý công nợ phải thu" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SEO title="Quản lý công nợ phải thu" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Quản lý công nợ phải thu</h1>
            <p className="text-muted-foreground mt-1">
              Quản lý công nợ với khách hàng và thu tiền
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tổng công nợ phải thu
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPrice(totalReceivable)}</div>
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
            <CardTitle>Danh sách công nợ phải thu</CardTitle>
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

            <div className="flex flex-wrap items-center gap-4 mt-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  Ngày đáo hạn:
                </span>
                <input
                  type="date"
                  value={dueDateFrom}
                  onChange={(e) => setDueDateFrom(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                />
                <span className="text-sm text-muted-foreground">→</span>
                <input
                  type="date"
                  value={dueDateTo}
                  onChange={(e) => setDueDateTo(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                />
              </div>

              {(dueDateFrom || dueDateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDueDateFrom("");
                    setDueDateTo("");
                  }}
                >
                  Xóa lọc ngày
                </Button>
              )}
            </div>

            {filteredAccounts.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery || statusFilter !== "all"
                    ? "Không tìm thấy công nợ nào"
                    : "Chưa có công nợ phải thu nào"}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-md border mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Khách hàng</TableHead>
                        <TableHead>Đơn hàng</TableHead>
                        <TableHead>Điện thoại</TableHead>
                        <TableHead>Ngày đáo hạn</TableHead>
                        <TableHead>Số tiền</TableHead>
                        <TableHead>Đã thu</TableHead>
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
                              <User className="w-3 h-3 text-muted-foreground" />
                              {account.customer_name}
                            </div>
                          </TableCell>
                          <TableCell>
                            {account.order ? (
                              <span className="font-medium">{account.order.order_code}</span>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>{account.customer_phone || "-"}</TableCell>
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
                                  onClick={() => handleReceivePayment(account)}
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Thu tiền
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

      <CustomerPaymentFormDialog
        open={isPaymentOpen}
        onOpenChange={setIsPaymentOpen}
        accountsReceivable={selectedAccount}
        onSuccess={handlePaymentSuccess}
      />

      <AccountsReceivableDetailDialog
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        account={selectedAccount}
      />
    </AdminLayout>
  );
};

export default AdminAccountsReceivable;

