import { useState, useEffect } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Plus, Pencil, Trash2, Search, Loader2, Calendar, Ticket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPagination from "@/components/admin/AdminPagination";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  min_order_amount: number | null;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CouponFormData {
  code: string;
  description: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  min_order_amount: number | null;
  max_uses: number | null;
  is_active: boolean;
  starts_at: string;
  expires_at: string;
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const AdminCoupons = () => {
  const { toast } = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [deletingCoupon, setDeletingCoupon] = useState<Coupon | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [formData, setFormData] = useState<CouponFormData>({
    code: "",
    description: "",
    discount_type: "percentage",
    discount_value: 0,
    min_order_amount: null,
    max_uses: null,
    is_active: true,
    starts_at: "",
    expires_at: "",
  });

  useEffect(() => {
    fetchCoupons();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const fetchCoupons = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCoupons(data || []);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải danh sách mã giảm giá",
      });
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingCoupon(null);
    setFormData({
      code: "",
      description: "",
      discount_type: "percentage",
      discount_value: 0,
      min_order_amount: null,
      max_uses: null,
      is_active: true,
      starts_at: "",
      expires_at: "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      description: coupon.description || "",
      discount_type: coupon.discount_type as "percentage" | "fixed",
      discount_value: coupon.discount_value,
      min_order_amount: coupon.min_order_amount,
      max_uses: coupon.max_uses,
      is_active: coupon.is_active,
      starts_at: coupon.starts_at ? format(new Date(coupon.starts_at), "yyyy-MM-dd'T'HH:mm") : "",
      expires_at: coupon.expires_at ? format(new Date(coupon.expires_at), "yyyy-MM-dd'T'HH:mm") : "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code.trim()) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng nhập mã giảm giá",
      });
      return;
    }

    if (formData.discount_value <= 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Giá trị giảm giá phải lớn hơn 0",
      });
      return;
    }

    if (formData.discount_type === "percentage" && formData.discount_value > 100) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Phần trăm giảm giá không được vượt quá 100%",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const couponData = {
        code: formData.code.toUpperCase().trim(),
        description: formData.description.trim() || null,
        discount_type: formData.discount_type,
        discount_value: formData.discount_value,
        min_order_amount: formData.min_order_amount || null,
        max_uses: formData.max_uses || null,
        is_active: formData.is_active,
        starts_at: formData.starts_at ? new Date(formData.starts_at).toISOString() : null,
        expires_at: formData.expires_at ? new Date(formData.expires_at).toISOString() : null,
      };

      if (editingCoupon) {
        const { error } = await supabase
          .from("coupons")
          .update(couponData)
          .eq("id", editingCoupon.id);

        if (error) throw error;

        toast({
          title: "Đã cập nhật",
          description: "Mã giảm giá đã được cập nhật",
        });
      } else {
        const { error } = await supabase.from("coupons").insert(couponData);

        if (error) {
          if (error.code === "23505") {
            toast({
              variant: "destructive",
              title: "Lỗi",
              description: "Mã giảm giá đã tồn tại",
            });
            setIsSubmitting(false);
            return;
          }
          throw error;
        }

        toast({
          title: "Đã thêm",
          description: "Mã giảm giá đã được thêm",
        });
      }

      setIsDialogOpen(false);
      fetchCoupons();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể lưu mã giảm giá",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCoupon) return;

    try {
      const { error } = await supabase
        .from("coupons")
        .delete()
        .eq("id", deletingCoupon.id);

      if (error) throw error;

      toast({
        title: "Đã xóa",
        description: "Mã giảm giá đã được xóa",
      });

      setDeletingCoupon(null);
      fetchCoupons();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể xóa mã giảm giá",
      });
    }
  };

  const filteredCoupons = coupons.filter((coupon) => {
    const matchesSearch = coupon.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (coupon.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    
    const now = new Date();
    let matchesStatus = true;
    
    if (statusFilter === "active") {
      matchesStatus = coupon.is_active && 
        (!coupon.expires_at || new Date(coupon.expires_at) > now) &&
        (!coupon.max_uses || coupon.used_count < coupon.max_uses);
    } else if (statusFilter === "inactive") {
      matchesStatus = !coupon.is_active;
    } else if (statusFilter === "expired") {
      matchesStatus = coupon.expires_at && new Date(coupon.expires_at) <= now;
    } else if (statusFilter === "used") {
      matchesStatus = coupon.max_uses && coupon.used_count >= coupon.max_uses;
    }

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredCoupons.length / itemsPerPage);
  const paginatedCoupons = filteredCoupons.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusBadge = (coupon: Coupon) => {
    const now = new Date();
    
    if (!coupon.is_active) {
      return <Badge variant="outline" className="bg-gray-100 text-gray-800">Không hoạt động</Badge>;
    }
    
    if (coupon.expires_at && new Date(coupon.expires_at) <= now) {
      return <Badge variant="outline" className="bg-red-100 text-red-800">Đã hết hạn</Badge>;
    }
    
    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
      return <Badge variant="outline" className="bg-orange-100 text-orange-800">Đã hết lượt</Badge>;
    }
    
    return <Badge variant="outline" className="bg-green-100 text-green-800">Đang hoạt động</Badge>;
  };

  return (
    <AdminLayout>
      <SEO title="Quản lý Mã giảm giá | Admin" description="Quản lý mã giảm giá" />
      
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quản lý Mã giảm giá</h1>
            <p className="text-muted-foreground">
              Tổng cộng {filteredCoupons.length} mã giảm giá
            </p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Thêm mã giảm giá
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Tìm kiếm theo mã hoặc mô tả..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Lọc theo trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="active">Đang hoạt động</SelectItem>
                  <SelectItem value="inactive">Không hoạt động</SelectItem>
                  <SelectItem value="expired">Đã hết hạn</SelectItem>
                  <SelectItem value="used">Đã hết lượt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Coupons Table */}
        <Card>
          <CardHeader>
            <CardTitle>Danh sách mã giảm giá</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : paginatedCoupons.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Ticket className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Chưa có mã giảm giá nào</p>
              </div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mã</TableHead>
                        <TableHead>Mô tả</TableHead>
                        <TableHead>Giảm giá</TableHead>
                        <TableHead>Đơn tối thiểu</TableHead>
                        <TableHead>Sử dụng</TableHead>
                        <TableHead>Hạn sử dụng</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedCoupons.map((coupon) => (
                        <TableRow key={coupon.id}>
                          <TableCell className="font-mono font-semibold">
                            {coupon.code}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {coupon.description || "-"}
                          </TableCell>
                          <TableCell>
                            {coupon.discount_type === "percentage" ? (
                              <span className="font-semibold text-primary">
                                {coupon.discount_value}%
                              </span>
                            ) : (
                              <span className="font-semibold text-primary">
                                {formatPrice(coupon.discount_value)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {coupon.min_order_amount ? (
                              formatPrice(coupon.min_order_amount)
                            ) : (
                              <span className="text-muted-foreground">Không có</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {coupon.max_uses ? (
                              `${coupon.used_count}/${coupon.max_uses}`
                            ) : (
                              `${coupon.used_count} lượt`
                            )}
                          </TableCell>
                          <TableCell>
                            {coupon.expires_at ? (
                              <div className="text-sm">
                                <div>{format(new Date(coupon.expires_at), "dd/MM/yyyy", { locale: vi })}</div>
                                <div className="text-muted-foreground text-xs">
                                  {format(new Date(coupon.expires_at), "HH:mm", { locale: vi })}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Không hạn</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(coupon)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(coupon)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeletingCoupon(coupon)}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
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
                  itemsPerPage={itemsPerPage}
                  totalItems={filteredCoupons.length}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(newItemsPerPage) => {
                    setItemsPerPage(newItemsPerPage);
                    setCurrentPage(1);
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingCoupon ? "Chỉnh sửa mã giảm giá" : "Thêm mã giảm giá mới"}
              </DialogTitle>
              <DialogDescription>
                {editingCoupon ? "Cập nhật thông tin mã giảm giá" : "Tạo mã giảm giá mới để khách hàng sử dụng khi thanh toán"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Mã giảm giá *</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value.toUpperCase() })
                    }
                    placeholder="VÍ DỤ: SALE2024"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discount_type">Loại giảm giá *</Label>
                  <Select
                    value={formData.discount_type}
                    onValueChange={(value: "percentage" | "fixed") =>
                      setFormData({ ...formData, discount_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Phần trăm (%)</SelectItem>
                      <SelectItem value="fixed">Số tiền cố định (₫)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Mô tả</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Mô tả về mã giảm giá..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="discount_value">
                    Giá trị giảm giá * {formData.discount_type === "percentage" ? "(%)" : "(₫)"}
                  </Label>
                  <Input
                    id="discount_value"
                    type="number"
                    min="0"
                    max={formData.discount_type === "percentage" ? 100 : undefined}
                    step={formData.discount_type === "percentage" ? 1 : 1000}
                    value={formData.discount_value}
                    onChange={(e) =>
                      setFormData({ ...formData, discount_value: parseFloat(e.target.value) || 0 })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min_order_amount">Đơn hàng tối thiểu (₫)</Label>
                  <Input
                    id="min_order_amount"
                    type="number"
                    min="0"
                    step="1000"
                    value={formData.min_order_amount || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        min_order_amount: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    placeholder="Không có"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max_uses">Số lượt sử dụng tối đa</Label>
                  <Input
                    id="max_uses"
                    type="number"
                    min="1"
                    value={formData.max_uses || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        max_uses: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                    placeholder="Không giới hạn"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="is_active">Trạng thái</Label>
                  <div className="flex items-center gap-2 pt-2">
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, is_active: checked })
                      }
                    />
                    <Label htmlFor="is_active" className="cursor-pointer">
                      {formData.is_active ? "Hoạt động" : "Không hoạt động"}
                    </Label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="starts_at">Ngày bắt đầu</Label>
                  <Input
                    id="starts_at"
                    type="datetime-local"
                    value={formData.starts_at}
                    onChange={(e) =>
                      setFormData({ ...formData, starts_at: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expires_at">Ngày hết hạn</Label>
                  <Input
                    id="expires_at"
                    type="datetime-local"
                    value={formData.expires_at}
                    onChange={(e) =>
                      setFormData({ ...formData, expires_at: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  <span className="flex items-center">
                    <Loader2 className={`w-4 h-4 mr-2 animate-spin ${isSubmitting ? 'inline' : 'hidden'}`} />
                    <span>{isSubmitting ? "Đang lưu..." : (editingCoupon ? "Cập nhật" : "Thêm mới")}</span>
                  </span>
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={!!deletingCoupon}
          onOpenChange={(open) => !open && setDeletingCoupon(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
              <AlertDialogDescription>
                Bạn có chắc chắn muốn xóa mã giảm giá <strong>{deletingCoupon?.code}</strong>?
                Hành động này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                Xóa
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
};

export default AdminCoupons;

