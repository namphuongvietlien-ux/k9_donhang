import { useState, useEffect } from "react";
import { Loader2, Calendar, User, FileText, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface CustomerPayment {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  bank_account: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

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
  status: string;
  notes: string | null;
  created_at: string;
}

interface AccountsReceivableDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountsReceivable | null;
}

const AccountsReceivableDetailDialog = ({
  open,
  onOpenChange,
  account,
}: AccountsReceivableDetailDialogProps) => {
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && account) {
      fetchPayments();
    } else {
      setPayments([]);
    }
  }, [open, account]);

  const fetchPayments = async () => {
    if (!account) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("customer_payments")
        .select("*")
        .eq("accounts_receivable_id", account.id)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPayments(data || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching payments:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price) + "₫";
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      cash: "Tiền mặt",
      bank_transfer: "Chuyển khoản",
      check: "Séc",
      other: "Khác",
    };
    return labels[method] || method;
  };

  if (!account) return null;

  const isOverdue = new Date(account.due_date) < new Date() && account.remaining_amount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chi tiết công nợ phải thu</DialogTitle>
          <DialogDescription>
            Xem thông tin chi tiết và lịch sử thu tiền công nợ phải thu từ khách hàng
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Khách hàng</div>
              <div className="flex items-center gap-1 mt-1">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="text-lg font-medium">{account.customer_name}</span>
              </div>
            </div>
            {account.order && (
              <div>
                <div className="text-sm text-muted-foreground">Đơn hàng</div>
                <div className="mt-1 font-medium">{account.order.order_code}</div>
              </div>
            )}
            {account.customer_phone && (
              <div>
                <div className="text-sm text-muted-foreground">Điện thoại</div>
                <div className="mt-1">{account.customer_phone}</div>
              </div>
            )}
            <div>
              <div className="text-sm text-muted-foreground">Ngày đáo hạn</div>
              <div className="flex items-center gap-1 mt-1">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                {format(new Date(account.due_date), "dd/MM/yyyy", { locale: vi })}
                {isOverdue && (
                  <Badge variant="destructive" className="ml-2">
                    Quá hạn
                  </Badge>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Số tiền ban đầu</div>
              <div className="text-lg font-bold mt-1">
                {formatPrice(account.original_amount)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Đã thu</div>
              <div className="text-lg font-medium text-green-600 mt-1">
                {formatPrice(account.paid_amount)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Còn nợ</div>
              <div className="text-lg font-bold text-destructive mt-1">
                {formatPrice(account.remaining_amount)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Trạng thái</div>
              <div className="mt-1">
                {account.status === "paid" && <Badge variant="default">Đã thu đủ</Badge>}
                {account.status === "partial" && <Badge variant="outline">Thu một phần</Badge>}
                {account.status === "overdue" && (
                  <Badge variant="destructive">Quá hạn</Badge>
                )}
                {account.status === "pending" && <Badge variant="secondary">Chưa thu</Badge>}
              </div>
            </div>
          </div>

          {account.notes && (
            <div>
              <div className="text-sm text-muted-foreground">Ghi chú</div>
              <div className="mt-1 p-3 bg-muted rounded-md">{account.notes}</div>
            </div>
          )}

          <div>
            <div className="text-sm font-medium mb-2">Lịch sử thu tiền</div>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ngày thu</TableHead>
                      <TableHead>Số tiền</TableHead>
                      <TableHead>Phương thức</TableHead>
                      <TableHead>Tài khoản</TableHead>
                      <TableHead>Số chứng từ</TableHead>
                      <TableHead>Ghi chú</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Chưa có thanh toán nào
                        </TableCell>
                      </TableRow>
                    ) : (
                      payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>
                            {format(new Date(payment.payment_date), "dd/MM/yyyy", {
                              locale: vi,
                            })}
                          </TableCell>
                          <TableCell className="font-medium">
                            {formatPrice(payment.amount)}
                          </TableCell>
                          <TableCell>
                            {getPaymentMethodLabel(payment.payment_method)}
                          </TableCell>
                          <TableCell>{payment.bank_account || "-"}</TableCell>
                          <TableCell>{payment.reference_number || "-"}</TableCell>
                          <TableCell>{payment.notes || "-"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AccountsReceivableDetailDialog;

