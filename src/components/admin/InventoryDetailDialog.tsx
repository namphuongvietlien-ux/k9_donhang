import { useState, useEffect } from "react";
import { Loader2, Package, Calendar, TrendingUp, TrendingDown } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface InventoryLot {
  id: string;
  quantity: number;
  unit_price: number;
  batch_number: string | null;
  expiry_date: string | null;
  received_date: string;
}

interface InventoryMovement {
  id: string;
  movement_type: "in" | "out";
  quantity: number;
  unit_price: number;
  movement_date: string;
}

interface Product {
  id: string;
  name: string;
  category: string | null;
  stock_quantity: number;
  min_stock_level: number;
  max_stock_level: number | null;
  average_cost: number;
  unit: string;
}

interface InventoryDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
}

const InventoryDetailDialog = ({
  open,
  onOpenChange,
  product,
}: InventoryDetailDialogProps) => {
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && product) {
      fetchLots();
      fetchMovements();
    } else {
      setLots([]);
      setMovements([]);
    }
  }, [open, product]);

  const fetchLots = async () => {
    if (!product) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("inventory_lots")
        .select("*")
        .eq("product_id", product.id)
        .gt("quantity", 0)
        .order("received_date", { ascending: true });

      if (error) throw error;
      setLots(data || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching inventory lots:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchMovements = async () => {
    if (!product) return;

    try {
      const { data: lotsData, error: lotsError } = await supabase
        .from("inventory_lots")
        .select("id")
        .eq("product_id", product.id);

      if (lotsError) throw lotsError;

      if (lotsData && lotsData.length > 0) {
        const lotIds = lotsData.map((lot) => lot.id);
        const { data, error } = await supabase
          .from("inventory_movements")
          .select("*")
          .in("lot_id", lotIds)
          .order("movement_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;
        setMovements(data || []);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching inventory movements:", error);
      }
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price) + "₫";
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chi tiết tồn kho: {product.name}</DialogTitle>
          <DialogDescription>
            Xem thông tin tồn kho, lô hàng và lịch sử nhập/xuất của sản phẩm
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Tồn kho hiện tại</div>
              <div className="text-2xl font-bold mt-1">
                {product.stock_quantity} {product.unit || "cái"}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Giá vốn bình quân</div>
              <div className="text-2xl font-bold mt-1">
                {formatPrice(product.average_cost)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Tồn tối thiểu</div>
              <div className="text-lg font-medium mt-1">{product.min_stock_level}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Giá trị tồn kho</div>
              <div className="text-lg font-medium mt-1">
                {formatPrice(product.stock_quantity * product.average_cost)}
              </div>
            </div>
          </div>

          <Tabs defaultValue="lots">
            <TabsList>
              <TabsTrigger value="lots">Tồn kho theo lô</TabsTrigger>
              <TabsTrigger value="movements">Lịch sử nhập/xuất</TabsTrigger>
            </TabsList>
            <TabsContent value="lots" className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ngày nhập</TableHead>
                        <TableHead>Số lượng</TableHead>
                        <TableHead>Giá nhập</TableHead>
                        <TableHead>Thành tiền</TableHead>
                        <TableHead>Số lô</TableHead>
                        <TableHead>Hạn sử dụng</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lots.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            Không có lô nào
                          </TableCell>
                        </TableRow>
                      ) : (
                        lots.map((lot) => (
                          <TableRow key={lot.id}>
                            <TableCell>
                              {format(new Date(lot.received_date), "dd/MM/yyyy", {
                                locale: vi,
                              })}
                            </TableCell>
                            <TableCell>{lot.quantity}</TableCell>
                            <TableCell>{formatPrice(lot.unit_price)}</TableCell>
                            <TableCell className="font-medium">
                              {formatPrice(lot.quantity * lot.unit_price)}
                            </TableCell>
                            <TableCell>{lot.batch_number || "-"}</TableCell>
                            <TableCell>
                              {lot.expiry_date
                                ? format(new Date(lot.expiry_date), "dd/MM/yyyy")
                                : "-"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
            <TabsContent value="movements" className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ngày</TableHead>
                      <TableHead>Loại</TableHead>
                      <TableHead>Số lượng</TableHead>
                      <TableHead>Giá</TableHead>
                      <TableHead>Thành tiền</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Không có lịch sử
                        </TableCell>
                      </TableRow>
                    ) : (
                      movements.map((movement) => (
                        <TableRow key={movement.id}>
                          <TableCell>
                            {format(new Date(movement.movement_date), "dd/MM/yyyy HH:mm", {
                              locale: vi,
                            })}
                          </TableCell>
                          <TableCell>
                            {movement.movement_type === "in" ? (
                              <Badge variant="outline" className="border-green-500 text-green-500">
                                <TrendingUp className="w-3 h-3 mr-1" />
                                Nhập
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-red-500 text-red-500">
                                <TrendingDown className="w-3 h-3 mr-1" />
                                Xuất
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{movement.quantity}</TableCell>
                          <TableCell>{formatPrice(movement.unit_price)}</TableCell>
                          <TableCell className="font-medium">
                            {formatPrice(movement.quantity * movement.unit_price)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InventoryDetailDialog;

