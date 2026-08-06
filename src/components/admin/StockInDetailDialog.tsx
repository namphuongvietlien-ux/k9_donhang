import { useState, useEffect } from "react";
import { Loader2, Calendar, Building2, FileText } from "lucide-react";
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

interface StockInItem {
  id: string;
  product_id: string;
  product: {
    name: string;
    unit: string;
  };
  quantity: number;
  unit_price: number;
  total_price: number;
  batch_number: string | null;
  expiry_date: string | null;
  notes: string | null;
}

interface StockInTransaction {
  id: string;
  code: string;
  transaction_date: string;
  type: string;
  supplier_id: string | null;
  supplier?: {
    name: string;
  };
  reference_number: string | null;
  reference_date: string | null;
  total_amount: number;
  is_paid: boolean;
  notes: string | null;
  created_at: string;
}

interface StockInDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: StockInTransaction | null;
}

const typeLabels: Record<string, string> = {
  purchase: "Nhập từ nhà cung cấp",
  return: "Nhập hàng trả lại",
  adjustment: "Điều chỉnh",
  production: "Từ sản xuất",
};

const StockInDetailDialog = ({
  open,
  onOpenChange,
  transaction,
}: StockInDetailDialogProps) => {
  const [items, setItems] = useState<StockInItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && transaction) {
      fetchItems();
    } else {
      setItems([]);
    }
  }, [open, transaction]);

  const fetchItems = async () => {
    if (!transaction) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("stock_in_items")
        .select(`
          *,
          product:products(name, unit)
        `)
        .eq("stock_in_id", transaction.id)
        .order("created_at");

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching stock in items:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price) + "₫";
  };

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chi tiết phiếu nhập: {transaction.code}</DialogTitle>
          <DialogDescription>
            Xem thông tin chi tiết và danh sách sản phẩm của phiếu nhập kho
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Ngày nhập</div>
                <div className="flex items-center gap-1 mt-1">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  {format(new Date(transaction.transaction_date), "dd/MM/yyyy", {
                    locale: vi,
                  })}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Loại nhập</div>
                <Badge variant="outline" className="mt-1">
                  {typeLabels[transaction.type] || transaction.type}
                </Badge>
              </div>
              {transaction.supplier && (
                <div>
                  <div className="text-sm text-muted-foreground">Nhà cung cấp</div>
                  <div className="flex items-center gap-1 mt-1">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    {transaction.supplier.name}
                  </div>
                </div>
              )}
              {transaction.reference_number && (
                <div>
                  <div className="text-sm text-muted-foreground">Số hóa đơn</div>
                  <div className="flex items-center gap-1 mt-1">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    {transaction.reference_number}
                  </div>
                </div>
              )}
              <div>
                <div className="text-sm text-muted-foreground">Trạng thái thanh toán</div>
                <Badge
                  variant={transaction.is_paid ? "default" : "secondary"}
                  className="mt-1"
                >
                  {transaction.is_paid ? "Đã trả" : "Chưa trả"}
                </Badge>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Tổng giá trị</div>
                <div className="text-lg font-bold mt-1">
                  {formatPrice(transaction.total_amount)}
                </div>
              </div>
            </div>

            {transaction.notes && (
              <div>
                <div className="text-sm text-muted-foreground">Ghi chú</div>
                <div className="mt-1 p-3 bg-muted rounded-md">{transaction.notes}</div>
              </div>
            )}

            <div>
              <div className="text-sm font-medium mb-2">Danh sách sản phẩm</div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead>Số lượng</TableHead>
                      <TableHead>Giá nhập</TableHead>
                      <TableHead>Thành tiền</TableHead>
                      <TableHead>Số lô</TableHead>
                      <TableHead>Hạn sử dụng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Không có sản phẩm nào
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.product?.name}</TableCell>
                          <TableCell>
                            {item.quantity} {item.product?.unit || "cái"}
                          </TableCell>
                          <TableCell>{formatPrice(item.unit_price)}</TableCell>
                          <TableCell className="font-medium">
                            {formatPrice(item.total_price)}
                          </TableCell>
                          <TableCell>{item.batch_number || "-"}</TableCell>
                          <TableCell>
                            {item.expiry_date
                              ? format(new Date(item.expiry_date), "dd/MM/yyyy")
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StockInDetailDialog;

