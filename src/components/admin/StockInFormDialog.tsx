import { useState, useEffect } from "react";
import { Loader2, Plus, X, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { format } from "date-fns";

interface Product {
  id: string;
  name: string;
  unit: string;
  stock_quantity: number;
}

interface StockInItem {
  product_id: string;
  product?: Product;
  quantity: number;
  unit_price: number;
  batch_number: string;
  expiry_date: string;
  notes: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface StockInFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const StockInFormDialog = ({
  open,
  onOpenChange,
  onSuccess,
}: StockInFormDialogProps) => {
  const [loading, setLoading] = useState(false);
  const { products: sharedProducts = [] } = useProducts();
  const products = (sharedProducts as Product[]).filter((product) => product.is_active !== false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [formData, setFormData] = useState({
    transaction_date: format(new Date(), "yyyy-MM-dd"),
    type: "purchase" as "purchase" | "return" | "adjustment" | "production",
    supplier_id: "",
    reference_number: "",
    reference_date: "",
    is_paid: false,
    notes: "",
  });
  const [items, setItems] = useState<StockInItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [itemForm, setItemForm] = useState({
    quantity: 1,
    unit_price: 0,
    batch_number: "",
    expiry_date: "",
    notes: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchSuppliers();
      // Reset form
      setFormData({
        transaction_date: format(new Date(), "yyyy-MM-dd"),
        type: "purchase",
        supplier_id: "",
        reference_number: "",
        reference_date: "",
        is_paid: false,
        notes: "",
      });
      setItems([]);
      setItemForm({
        quantity: 1,
        unit_price: 0,
        batch_number: "",
        expiry_date: "",
        notes: "",
      });
    }
  }, [open]);

  const fetchSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setSuppliers(data || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching suppliers:", error);
      }
    }
  };

  const handleAddItem = () => {
    if (!selectedProductId || itemForm.quantity <= 0 || itemForm.unit_price <= 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng chọn sản phẩm và nhập đầy đủ thông tin",
      });
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const newItem: StockInItem = {
      product_id: selectedProductId,
      product,
      quantity: itemForm.quantity,
      unit_price: itemForm.unit_price,
      batch_number: itemForm.batch_number,
      expiry_date: itemForm.expiry_date,
      notes: itemForm.notes,
    };

    setItems([...items, newItem]);
    setItemForm({
      quantity: 1,
      unit_price: 0,
      batch_number: "",
      expiry_date: "",
      notes: "",
    });
    setSelectedProductId("");
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng thêm ít nhất một sản phẩm",
      });
      return;
    }

    setLoading(true);
    try {
      // Create stock in transaction
      const { data: transaction, error: transError } = await supabase
        .from("stock_in_transactions")
        .insert({
          transaction_date: formData.transaction_date,
          type: formData.type,
          supplier_id: formData.supplier_id || null,
          reference_number: formData.reference_number || null,
          reference_date: formData.reference_date || null,
          is_paid: formData.is_paid,
          notes: formData.notes || null,
        })
        .select()
        .single();

      if (transError) throw transError;

      // Create stock in items
      const stockInItems = items.map((item) => ({
        stock_in_id: transaction.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        batch_number: item.batch_number || null,
        expiry_date: item.expiry_date || null,
        notes: item.notes || null,
      }));

      const { error: itemsError } = await supabase
        .from("stock_in_items")
        .insert(stockInItems);

      if (itemsError) throw itemsError;

      toast({
        title: "Thành công",
        description: "Đã tạo phiếu nhập kho",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error creating stock in transaction:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tạo phiếu nhập kho",
      });
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price) + "₫";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo phiếu nhập kho</DialogTitle>
          <DialogDescription>
            Điền thông tin và thêm sản phẩm để tạo phiếu nhập kho mới
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transaction_date">Ngày nhập *</Label>
              <Input
                id="transaction_date"
                type="date"
                value={formData.transaction_date}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    transaction_date: e.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Loại nhập *</Label>
              <Select
                value={formData.type}
                onValueChange={(value: any) =>
                  setFormData((prev) => ({ ...prev, type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Nhập từ nhà cung cấp</SelectItem>
                  <SelectItem value="return">Nhập hàng trả lại</SelectItem>
                  <SelectItem value="adjustment">Điều chỉnh</SelectItem>
                  <SelectItem value="production">Từ sản xuất</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.type === "purchase" && (
              <div className="space-y-2">
                <Label htmlFor="supplier_id">Nhà cung cấp</Label>
                <Select
                  value={formData.supplier_id}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, supplier_id: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn nhà cung cấp" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reference_number">Số hóa đơn</Label>
              <Input
                id="reference_number"
                value={formData.reference_number}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    reference_number: e.target.value,
                  }))
                }
                placeholder="Số hóa đơn"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference_date">Ngày hóa đơn</Label>
              <Input
                id="reference_date"
                type="date"
                value={formData.reference_date}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    reference_date: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Thêm sản phẩm</Label>
            <div className="grid grid-cols-6 gap-2">
              <Select
                value={selectedProductId}
                onValueChange={setSelectedProductId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn sản phẩm" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min="1"
                placeholder="Số lượng"
                value={itemForm.quantity || ""}
                onChange={(e) =>
                  setItemForm((prev) => ({
                    ...prev,
                    quantity: parseInt(e.target.value) || 0,
                  }))
                }
              />
              <Input
                type="number"
                min="0"
                placeholder="Giá nhập"
                value={itemForm.unit_price || ""}
                onChange={(e) =>
                  setItemForm((prev) => ({
                    ...prev,
                    unit_price: parseInt(e.target.value) || 0,
                  }))
                }
              />
              <Input
                placeholder="Số lô"
                value={itemForm.batch_number}
                onChange={(e) =>
                  setItemForm((prev) => ({
                    ...prev,
                    batch_number: e.target.value,
                  }))
                }
              />
              <Input
                type="date"
                placeholder="Hạn sử dụng"
                value={itemForm.expiry_date}
                onChange={(e) =>
                  setItemForm((prev) => ({
                    ...prev,
                    expiry_date: e.target.value,
                  }))
                }
              />
              <Button type="button" onClick={handleAddItem}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {items.length > 0 && (
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
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.product?.name}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{formatPrice(item.unit_price)}</TableCell>
                      <TableCell className="font-medium">
                        {formatPrice(item.quantity * item.unit_price)}
                      </TableCell>
                      <TableCell>{item.batch_number || "-"}</TableCell>
                      <TableCell>
                        {item.expiry_date
                          ? format(new Date(item.expiry_date), "dd/MM/yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex items-center justify-between border-t pt-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="is_paid"
                checked={formData.is_paid}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, is_paid: checked }))
                }
              />
              <Label htmlFor="is_paid">Đã thanh toán</Label>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Tổng cộng</div>
              <div className="text-2xl font-bold">{formatPrice(totalAmount)}</div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Ghi chú</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Ghi chú về phiếu nhập"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={loading || items.length === 0}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                "Tạo phiếu nhập"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default StockInFormDialog;

