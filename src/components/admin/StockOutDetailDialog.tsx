import { useState, useEffect } from "react";
import { Loader2, Calendar, Package } from "lucide-react";
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

interface StockOutItem {
  id: string;
  product_id: string;
  product: {
    name: string;
    unit: string;
  };
  quantity: number;
  unit_cost: number;
  total_cost: number;
  notes: string | null;
}

interface StockOutTransaction {
  id: string;
  code: string;
  transaction_date: string;
  type: string;
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
  created_at: string;
}

interface StockOutDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: StockOutTransaction | null;
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

const StockOutDetailDialog = ({
  open,
  onOpenChange,
  transaction,
}: StockOutDetailDialogProps) => {
  const [items, setItems] = useState<StockOutItem[]>([]);
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
        .from("stock_out_items")
        .select(`
          *,
          product:products(name, unit)
        `)
        .eq("stock_out_id", transaction.id)
        .order("created_at");

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching stock out items:", error);
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
          <DialogTitle>Chi tiết phiếu xuất: {transaction.code}</DialogTitle>
          <DialogDescription>
            Xem thông tin chi tiết và danh sách sản phẩm của phiếu xuất kho
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
                <div className="text-sm text-muted-foreground">Ngày xuất</div>
                <div className="flex items-center gap-1 mt-1">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  {format(new Date(transaction.transaction_date), "dd/MM/yyyy", {
                    locale: vi,
                  })}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Loại xuất</div>
                <Badge variant="outline" className="mt-1">
                  {typeLabels[transaction.type] || transaction.type}
                </Badge>
              </div>
              {transaction.sales_channel && (
                <div>
                  <div className="text-sm text-muted-foreground">Kênh bán hàng</div>
                  <Badge variant="secondary" className="mt-1">
                    {salesChannelLabels[transaction.sales_channel] || transaction.sales_channel}
                  </Badge>
                </div>
              )}
              {transaction.order && (
                <div>
                  <div className="text-sm text-muted-foreground">Đơn hàng</div>
                  <div className="mt-1">
                    <div className="font-medium">{transaction.order.order_code}</div>
                    <div className="text-sm text-muted-foreground">
                      {transaction.order.customer_name}
                    </div>
                  </div>
                </div>
              )}
              {transaction.supplier && (
                <div>
                  <div className="text-sm text-muted-foreground">Nhà cung cấp</div>
                  <div className="flex items-center gap-1 mt-1">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    {transaction.supplier.name}
                  </div>
                </div>
              )}
              <div>
                <div className="text-sm text-muted-foreground">Tổng giá vốn</div>
                <div className="text-lg font-bold mt-1">
                  {formatPrice(transaction.total_cost)}
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
                      <TableHead>Giá vốn</TableHead>
                      <TableHead>Thành tiền</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
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
                          <TableCell>{formatPrice(item.unit_cost)}</TableCell>
                          <TableCell className="font-medium">
                            {formatPrice(item.total_cost)}
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

export default StockOutDetailDialog;

