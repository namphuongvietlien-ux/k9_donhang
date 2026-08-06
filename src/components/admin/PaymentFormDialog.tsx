import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface AccountsPayable {
  id: string;
  remaining_amount: number;
  supplier?: {
    name: string;
  };
}

interface PaymentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountsPayable: AccountsPayable | null;
  onSuccess: () => void;
}

const PaymentFormDialog = ({
  open,
  onOpenChange,
  accountsPayable,
  onSuccess,
}: PaymentFormDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    payment_date: format(new Date(), "yyyy-MM-dd"),
    amount: 0,
    payment_method: "bank_transfer" as "cash" | "bank_transfer" | "check" | "other",
    bank_account: "",
    reference_number: "",
    notes: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    if (open && accountsPayable) {
      setFormData({
        payment_date: format(new Date(), "yyyy-MM-dd"),
        amount: accountsPayable.remaining_amount,
        payment_method: "bank_transfer",
        bank_account: "",
        reference_number: "",
        notes: "",
      });
    }
  }, [open, accountsPayable]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!accountsPayable) return;

    if (formData.amount <= 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Số tiền thanh toán phải lớn hơn 0",
      });
      return;
    }

    if (formData.amount > accountsPayable.remaining_amount) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Số tiền thanh toán không được vượt quá số tiền còn nợ",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("supplier_payments").insert({
        accounts_payable_id: accountsPayable.id,
        payment_date: formData.payment_date,
        amount: formData.amount,
        payment_method: formData.payment_method,
        bank_account: formData.bank_account || null,
        reference_number: formData.reference_number || null,
        notes: formData.notes || null,
      });

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Đã ghi nhận thanh toán",
      });

      onSuccess();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error creating payment:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể ghi nhận thanh toán",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price) + "₫";
  };

  if (!accountsPayable) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Thanh toán công nợ</DialogTitle>
          <DialogDescription>
            Nhập thông tin thanh toán để ghi nhận trả tiền công nợ cho nhà cung cấp
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-4 bg-muted rounded-md">
            <div className="text-sm text-muted-foreground">Nhà cung cấp</div>
            <div className="text-lg font-medium">{accountsPayable.supplier?.name}</div>
            <div className="text-sm text-muted-foreground mt-2">Còn nợ</div>
            <div className="text-xl font-bold">{formatPrice(accountsPayable.remaining_amount)}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="payment_date">Ngày thanh toán *</Label>
              <Input
                id="payment_date"
                type="date"
                value={formData.payment_date}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, payment_date: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">
                Số tiền thanh toán * (Tối đa: {formatPrice(accountsPayable.remaining_amount)})
              </Label>
              <Input
                id="amount"
                type="number"
                min="1"
                max={accountsPayable.remaining_amount}
                value={formData.amount || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    amount: parseInt(e.target.value) || 0,
                  }))
                }
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_method">Phương thức thanh toán *</Label>
            <Select
              value={formData.payment_method}
              onValueChange={(value: any) =>
                setFormData((prev) => ({ ...prev, payment_method: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Tiền mặt</SelectItem>
                <SelectItem value="bank_transfer">Chuyển khoản</SelectItem>
                <SelectItem value="check">Séc</SelectItem>
                <SelectItem value="other">Khác</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.payment_method === "bank_transfer" && (
            <div className="space-y-2">
              <Label htmlFor="bank_account">Tài khoản ngân hàng</Label>
              <Input
                id="bank_account"
                value={formData.bank_account}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, bank_account: e.target.value }))
                }
                placeholder="Số tài khoản ngân hàng"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reference_number">Số chứng từ</Label>
            <Input
              id="reference_number"
              value={formData.reference_number}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, reference_number: e.target.value }))
              }
              placeholder="Số chứng từ thanh toán"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Ghi chú</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Ghi chú về thanh toán"
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
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                "Ghi nhận thanh toán"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentFormDialog;

