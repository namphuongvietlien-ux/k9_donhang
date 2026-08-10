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

interface StockOutItem {
  product_id: string;
  product?: Product;
  quantity: number;
  notes: string;
}

interface StockOutFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const salesChannelOptions = [
  { value: "website", label: "Website" },
  { value: "shopee", label: "Shopee" },
  { value: "tiktok", label: "TikTok Shop" },
  { value: "ghn", label: "GHN" },
  { value: "jt", label: "J&T Express" },
];

const StockOutFormDialog = ({
  open,
  onOpenChange,
  onSuccess,
}: StockOutFormDialogProps) => {
  const [loading, setLoading] = useState(false);
  const { products: sharedProducts = [] } = useProducts();
  const products = (sharedProducts as Product[]).filter((product) => product.is_active !== false);
  const [formData, setFormData] = useState({
    transaction_date: format(new Date(), "yyyy-MM-dd"),
    type: "sale" as "sale" | "return_to_supplier" | "adjustment" | "damaged" | "sample",
    sales_channel: "" as string,
    reference_number: "",
    notes: "",
  });
  const [items, setItems] = useState<StockOutItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [itemForm, setItemForm] = useState({
    quantity: 1,
    notes: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      // Reset form
      setFormData({
        transaction_date: format(new Date(), "yyyy-MM-dd"),
        type: "sale",
        sales_channel: "",
        reference_number: "",
        notes: "",
      });
      setItems([]);
      setItemForm({
        quantity: 1,
        notes: "",
      });
      setSelectedProductId("");
    }
  }, [open]);

  const handleAddItem = () => {
    if (!selectedProductId || itemForm.quantity <= 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng chọn sản phẩm và nhập số lượng hợp lệ",
      });
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    // Check if product already in items
    const existingItem = items.find((item) => item.product_id === selectedProductId);
    if (existingItem) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Sản phẩm này đã được thêm vào danh sách",
      });
      return;
    }

    // Check stock quantity
    if (itemForm.quantity > product.stock_quantity) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: `Số lượng xuất (${itemForm.quantity}) vượt quá tồn kho (${product.stock_quantity})`,
      });
      return;
    }

    setItems([
      ...items,
      {
        product_id: selectedProductId,
        product,
        quantity: itemForm.quantity,
        notes: itemForm.notes,
      },
    ]);

    // Reset item form
    setSelectedProductId("");
    setItemForm({
      quantity: 1,
      notes: "",
    });
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

    // Validate sales_channel for sale type
    if (formData.type === "sale" && !formData.sales_channel) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng chọn kênh bán hàng",
      });
      return;
    }

    setLoading(true);
    try {
      // Create stock out transaction
      const { data: transaction, error: transactionError } = await supabase
        .from("stock_out_transactions")
        .insert({
          transaction_date: formData.transaction_date,
          type: formData.type,
          sales_channel: formData.type === "sale" ? formData.sales_channel : null,
          reference_number: formData.reference_number || null,
          notes: formData.notes || null,
        })
        .select()
        .single();

      if (transactionError) throw transactionError;

      // Create stock out items (cost will be calculated by trigger)
      const stockOutItems = items.map((item) => ({
        stock_out_id: transaction.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: 0, // Will be calculated by trigger
        total_cost: 0, // Will be calculated by trigger
        notes: item.notes || null,
      }));

      const { error: itemsError } = await supabase
        .from("stock_out_items")
        .insert(stockOutItems);

      if (itemsError) throw itemsError;

      toast({
        title: "Thành công",
        description: "Phiếu xuất kho đã được tạo",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error creating stock out transaction:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tạo phiếu xuất kho",
      });
    } finally {
      setLoading(false);
    }
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo phiếu xuất kho</DialogTitle>
          <DialogDescription>
            Điền thông tin và thêm sản phẩm để tạo phiếu xuất kho mới
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transaction_date">Ngày xuất *</Label>
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
              <Label htmlFor="type">Loại xuất *</Label>
              <Select
                value={formData.type}
                onValueChange={(value: any) =>
                  setFormData((prev) => ({
                    ...prev,
                    type: value,
                    sales_channel: value !== "sale" ? "" : prev.sales_channel,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">Xuất bán hàng</SelectItem>
                  <SelectItem value="return_to_supplier">Trả nhà cung cấp</SelectItem>
                  <SelectItem value="adjustment">Điều chỉnh</SelectItem>
                  <SelectItem value="damaged">Hàng hỏng/hết hạn</SelectItem>
                  <SelectItem value="sample">Hàng mẫu/biếu tặng</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.type === "sale" && (
              <div className="space-y-2">
                <Label htmlFor="sales_channel">Kênh bán hàng *</Label>
                <Select
                  value={formData.sales_channel}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      sales_channel: value,
                    }))
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn kênh bán hàng" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesChannelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reference_number">Số chứng từ</Label>
              <Input
                id="reference_number"
                value={formData.reference_number}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    reference_number: e.target.value,
                  }))
                }
                placeholder="Số chứng từ gốc (nếu có)"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Ghi chú</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  notes: e.target.value,
                }))
              }
              placeholder="Ghi chú về phiếu xuất kho"
              rows={2}
            />
          </div>

          {/* Add Items Section */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Danh sách sản phẩm</h3>
            </div>

            {/* Add Item Form */}
            <div className="grid grid-cols-4 gap-4 mb-4 p-4 bg-muted rounded-md">
              <div className="space-y-2">
                <Label htmlFor="product">Sản phẩm *</Label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn sản phẩm" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} (Tồn: {product.stock_quantity} {product.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Số lượng *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={itemForm.quantity}
                  onChange={(e) =>
                    setItemForm((prev) => ({
                      ...prev,
                      quantity: parseInt(e.target.value) || 1,
                    }))
                  }
                  max={selectedProduct?.stock_quantity || 0}
                />
                {selectedProduct && (
                  <p className="text-xs text-muted-foreground">
                    Tồn kho: {selectedProduct.stock_quantity} {selectedProduct.unit}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="item_notes">Ghi chú</Label>
                <Input
                  id="item_notes"
                  value={itemForm.notes}
                  onChange={(e) =>
                    setItemForm((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                  placeholder="Ghi chú (tùy chọn)"
                />
              </div>
              <div className="flex items-end">
                <Button type="button" onClick={handleAddItem} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Thêm
                </Button>
              </div>
            </div>

            {/* Items List */}
            {items.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead>Số lượng</TableHead>
                      <TableHead>Tồn kho</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.product?.name}</TableCell>
                        <TableCell>
                          {item.quantity} {item.product?.unit || "cái"}
                        </TableCell>
                        <TableCell>
                          {item.product?.stock_quantity || 0} {item.product?.unit || "cái"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <X className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
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
                  Đang tạo...
                </>
              ) : (
                "Tạo phiếu xuất"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default StockOutFormDialog;
