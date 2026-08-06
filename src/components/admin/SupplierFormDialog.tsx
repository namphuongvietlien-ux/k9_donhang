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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_code: string | null;
  bank_account: string | null;
  bank_name: string | null;
  payment_terms: number;
  notes: string | null;
  is_active: boolean;
}

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
  onSuccess: () => void;
}

const SupplierFormDialog = ({
  open,
  onOpenChange,
  supplier,
  onSuccess,
}: SupplierFormDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    tax_code: "",
    bank_account: "",
    bank_name: "",
    payment_terms: 30,
    notes: "",
    is_active: true,
  });
  const { toast } = useToast();

  useEffect(() => {
    if (supplier) {
      setFormData({
        code: supplier.code || "",
        name: supplier.name || "",
        contact_person: supplier.contact_person || "",
        phone: supplier.phone || "",
        email: supplier.email || "",
        address: supplier.address || "",
        tax_code: supplier.tax_code || "",
        bank_account: supplier.bank_account || "",
        bank_name: supplier.bank_name || "",
        payment_terms: supplier.payment_terms || 30,
        notes: supplier.notes || "",
        is_active: supplier.is_active ?? true,
      });
    } else {
      setFormData({
        code: "",
        name: "",
        contact_person: "",
        phone: "",
        email: "",
        address: "",
        tax_code: "",
        bank_account: "",
        bank_name: "",
        payment_terms: 30,
        notes: "",
        is_active: true,
      });
    }
  }, [supplier, open]);

  const generateCode = async () => {
    setGeneratingCode(true);
    try {
      const { data, error } = await supabase.rpc("generate_supplier_code");
      if (error) throw error;
      if (data) {
        setFormData((prev) => ({ ...prev, code: data }));
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error generating supplier code:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tạo mã nhà cung cấp",
      });
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng nhập tên nhà cung cấp",
      });
      return;
    }

    setLoading(true);
    try {
      if (supplier) {
        // Update existing supplier
        const { error } = await supabase
          .from("suppliers")
          .update({
            code: formData.code || null,
            name: formData.name,
            contact_person: formData.contact_person || null,
            phone: formData.phone || null,
            email: formData.email || null,
            address: formData.address || null,
            tax_code: formData.tax_code || null,
            bank_account: formData.bank_account || null,
            bank_name: formData.bank_name || null,
            payment_terms: formData.payment_terms,
            notes: formData.notes || null,
            is_active: formData.is_active,
          })
          .eq("id", supplier.id);

        if (error) throw error;

        toast({
          title: "Thành công",
          description: "Đã cập nhật nhà cung cấp",
        });
      } else {
        // Create new supplier
        let code = formData.code;
        if (!code) {
          // Auto-generate code if not provided
          const { data: generatedCode, error: codeError } = await supabase.rpc("generate_supplier_code");
          if (codeError) throw codeError;
          code = generatedCode || "";
        }

        const { error } = await supabase.from("suppliers").insert({
          code: code || null,
          name: formData.name,
          contact_person: formData.contact_person || null,
          phone: formData.phone || null,
          email: formData.email || null,
          address: formData.address || null,
          tax_code: formData.tax_code || null,
          bank_account: formData.bank_account || null,
          bank_name: formData.bank_name || null,
          payment_terms: formData.payment_terms,
          notes: formData.notes || null,
          is_active: formData.is_active,
        });

        if (error) throw error;

        toast({
          title: "Thành công",
          description: "Đã thêm nhà cung cấp mới",
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error saving supplier:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: supplier
          ? "Không thể cập nhật nhà cung cấp"
          : "Không thể thêm nhà cung cấp",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {supplier ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp mới"}
          </DialogTitle>
          <DialogDescription>
            {supplier ? "Cập nhật thông tin nhà cung cấp" : "Điền thông tin để thêm nhà cung cấp mới vào hệ thống"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">
                Mã nhà cung cấp
                {!supplier && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-2 h-6"
                    onClick={generateCode}
                    disabled={generatingCode}
                  >
                    {generatingCode ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      "Tự động"
                    )}
                  </Button>
                )}
              </Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, code: e.target.value }))
                }
                placeholder="NCC001"
                disabled={!!supplier}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">
                Tên nhà cung cấp <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Nhập tên nhà cung cấp"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_person">Người liên hệ</Label>
              <Input
                id="contact_person"
                value={formData.contact_person}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    contact_person: e.target.value,
                  }))
                }
                placeholder="Tên người liên hệ"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Điện thoại</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="0123456789"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder="supplier@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Địa chỉ</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, address: e.target.value }))
              }
              placeholder="Nhập địa chỉ"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tax_code">Mã số thuế</Label>
              <Input
                id="tax_code"
                value={formData.tax_code}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, tax_code: e.target.value }))
                }
                placeholder="0123456789"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_terms">Số ngày được nợ</Label>
              <Input
                id="payment_terms"
                type="number"
                min="0"
                value={formData.payment_terms}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    payment_terms: parseInt(e.target.value) || 0,
                  }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bank_account">Số tài khoản ngân hàng</Label>
              <Input
                id="bank_account"
                value={formData.bank_account}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    bank_account: e.target.value,
                  }))
                }
                placeholder="1234567890"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank_name">Tên ngân hàng</Label>
              <Input
                id="bank_name"
                value={formData.bank_name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, bank_name: e.target.value }))
                }
                placeholder="Ngân hàng ABC"
              />
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
              placeholder="Ghi chú về nhà cung cấp"
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, is_active: checked }))
              }
            />
            <Label htmlFor="is_active">Đang hoạt động</Label>
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
              ) : supplier ? (
                "Cập nhật"
              ) : (
                "Thêm mới"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SupplierFormDialog;

