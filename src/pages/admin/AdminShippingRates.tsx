import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Search, Loader2, Truck, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
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

interface ShippingRate {
  id: string;
  zone_type: string;
  weight_from: number;
  weight_to: number | null;
  base_price: number;
  additional_price_per_500g: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ShippingRateFormData {
  zone_type: string;
  weight_from: number;
  weight_to: number | null;
  base_price: number;
  additional_price_per_500g: number | null;
  is_active: boolean;
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const zoneTypeLabels: Record<string, string> = {
  INTRA_PROVINCE: "Nội tỉnh",
  INTRA_REGION: "Nội miền",
  SPECIAL: "Đặc biệt",
  INTER_REGION: "Liên miền",
};

const AdminShippingRates = () => {
  const { toast } = useToast();
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<ShippingRate | null>(null);
  const [deletingRate, setDeletingRate] = useState<ShippingRate | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<ShippingRateFormData>({
    zone_type: "INTRA_PROVINCE",
    weight_from: 0,
    weight_to: null,
    base_price: 0,
    additional_price_per_500g: null,
    is_active: true,
  });

  const fetchRates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("shipping_rates")
        .select("*")
        .order("zone_type", { ascending: true })
        .order("weight_from", { ascending: true });

      if (error) throw error;
      setRates(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error.message || "Không thể tải danh sách bảng giá",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
  }, []);

  const handleOpenDialog = (rate?: ShippingRate) => {
    if (rate) {
      setEditingRate(rate);
      setFormData({
        zone_type: rate.zone_type,
        weight_from: rate.weight_from,
        weight_to: rate.weight_to,
        base_price: rate.base_price,
        additional_price_per_500g: rate.additional_price_per_500g,
        is_active: rate.is_active,
      });
    } else {
      setEditingRate(null);
      setFormData({
        zone_type: "INTRA_PROVINCE",
        weight_from: 0,
        weight_to: null,
        base_price: 0,
        additional_price_per_500g: null,
        is_active: true,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingRate(null);
    setFormData({
      zone_type: "INTRA_PROVINCE",
      weight_from: 0,
      weight_to: null,
      base_price: 0,
      additional_price_per_500g: null,
      is_active: true,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validation
      if (formData.weight_from < 0) {
        throw new Error("Khối lượng bắt đầu phải >= 0");
      }
      if (formData.weight_to !== null && formData.weight_to <= formData.weight_from) {
        throw new Error("Khối lượng kết thúc phải > khối lượng bắt đầu");
      }
      if (formData.base_price < 0) {
        throw new Error("Giá cơ bản phải >= 0");
      }
      if (formData.additional_price_per_500g !== null && formData.additional_price_per_500g < 0) {
        throw new Error("Giá mỗi 0.5kg phải >= 0");
      }

      const rateData = {
        zone_type: formData.zone_type,
        weight_from: formData.weight_from,
        weight_to: formData.weight_to || null,
        base_price: formData.base_price,
        additional_price_per_500g: formData.additional_price_per_500g || null,
        is_active: formData.is_active,
      };

      if (editingRate) {
        // Update
        const { error } = await supabase
          .from("shipping_rates")
          .update(rateData)
          .eq("id", editingRate.id);

        if (error) throw error;

        toast({
          title: "Thành công",
          description: "Cập nhật bảng giá thành công",
        });
      } else {
        // Create
        const { error } = await supabase.from("shipping_rates").insert(rateData);

        if (error) throw error;

        toast({
          title: "Thành công",
          description: "Thêm bảng giá thành công",
        });
      }

      handleCloseDialog();
      fetchRates();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error.message || "Không thể lưu bảng giá",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingRate) return;

    try {
      const { error } = await supabase
        .from("shipping_rates")
        .delete()
        .eq("id", deletingRate.id);

      if (error) throw error;

      toast({
        title: "Thành công",
        description: "Xóa bảng giá thành công",
      });

      setDeletingRate(null);
      fetchRates();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error.message || "Không thể xóa bảng giá",
      });
    }
  };

  const filteredRates = rates.filter((rate) => {
    const matchesZone = zoneFilter === "all" || rate.zone_type === zoneFilter;
    const matchesSearch =
      searchQuery === "" ||
      zoneTypeLabels[rate.zone_type]?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rate.base_price.toString().includes(searchQuery) ||
      rate.weight_from.toString().includes(searchQuery);
    return matchesZone && matchesSearch;
  });

  const groupedRates = filteredRates.reduce((acc, rate) => {
    if (!acc[rate.zone_type]) {
      acc[rate.zone_type] = [];
    }
    acc[rate.zone_type].push(rate);
    return acc;
  }, {} as Record<string, ShippingRate[]>);

  return (
    <AdminLayout>
      <SEO title="Quản lý bảng giá vận chuyển | Admin" description="Quản lý bảng giá SPX Express" />

      <div className="mb-6">
        <h1 className="text-3xl font-bold">Bảng giá vận chuyển</h1>
        <p className="text-muted-foreground">Quản lý bảng giá cước phí SPX Express</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Tìm kiếm theo khu vực, giá, khối lượng..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-full sm:w-48">
              <Select value={zoneFilter} onValueChange={setZoneFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Lọc theo khu vực" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả khu vực</SelectItem>
                  <SelectItem value="INTRA_PROVINCE">Nội tỉnh</SelectItem>
                  <SelectItem value="INTRA_REGION">Nội miền</SelectItem>
                  <SelectItem value="SPECIAL">Đặc biệt</SelectItem>
                  <SelectItem value="INTER_REGION">Liên miền</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => handleOpenDialog()} className="whitespace-nowrap">
              <Plus className="w-4 h-4 mr-2" />
              Thêm bảng giá
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Rates Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Danh sách bảng giá ({filteredRates.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredRates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Không có bảng giá nào
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedRates).map(([zoneType, zoneRates]) => (
                <div key={zoneType} className="space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-semibold text-lg">{zoneTypeLabels[zoneType]}</h3>
                    <Badge variant="outline">{zoneRates.length} bậc giá</Badge>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Khối lượng (kg)</TableHead>
                        <TableHead>Giá cơ bản</TableHead>
                        <TableHead>Giá mỗi 0.5kg</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {zoneRates.map((rate) => (
                        <TableRow key={rate.id}>
                          <TableCell>
                            <div className="font-medium">
                              {rate.weight_from === 0 && rate.weight_to === null
                                ? "0 - ∞"
                                : rate.weight_to === null
                                ? `≥ ${rate.weight_from}`
                                : `${rate.weight_from} - ${rate.weight_to}`}
                              {" kg"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold text-primary">
                              {formatPrice(rate.base_price)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {rate.additional_price_per_500g ? (
                              <span className="text-muted-foreground">
                                {formatPrice(rate.additional_price_per_500g)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {rate.is_active ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                                Hoạt động
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
                                Tạm dừng
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenDialog(rate)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeletingRate(rate)}
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingRate ? "Sửa bảng giá" : "Thêm bảng giá mới"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="zone_type">
                  Khu vực <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.zone_type}
                  onValueChange={(value) =>
                    setFormData({ ...formData, zone_type: value })
                  }
                >
                  <SelectTrigger id="zone_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INTRA_PROVINCE">Nội tỉnh</SelectItem>
                    <SelectItem value="INTRA_REGION">Nội miền</SelectItem>
                    <SelectItem value="SPECIAL">Đặc biệt</SelectItem>
                    <SelectItem value="INTER_REGION">Liên miền</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weight_from">
                    Khối lượng từ (kg) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="weight_from"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.weight_from}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        weight_from: parseFloat(e.target.value) || 0,
                      })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight_to">
                    Khối lượng đến (kg) <span className="text-muted-foreground">(để trống = không giới hạn)</span>
                  </Label>
                  <Input
                    id="weight_to"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.weight_to || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        weight_to: e.target.value ? parseFloat(e.target.value) : null,
                      })
                    }
                    placeholder="Không giới hạn"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="base_price">
                  Giá cơ bản (₫) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="base_price"
                  type="number"
                  min="0"
                  value={formData.base_price}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      base_price: parseInt(e.target.value) || 0,
                    })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="additional_price_per_500g">
                  Giá mỗi 0.5kg tiếp theo (₫){" "}
                  <span className="text-muted-foreground">(để trống = không có)</span>
                </Label>
                <Input
                  id="additional_price_per_500g"
                  type="number"
                  min="0"
                  value={formData.additional_price_per_500g || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      additional_price_per_500g: e.target.value
                        ? parseInt(e.target.value)
                        : null,
                    })
                  }
                  placeholder="Không có"
                />
                <p className="text-xs text-muted-foreground">
                  Áp dụng cho khối lượng vượt quá bậc giá này
                </p>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Trạng thái</Label>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked })
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Hủy
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang lưu...
                  </>
                ) : editingRate ? (
                  "Cập nhật"
                ) : (
                  "Thêm mới"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingRate}
        onOpenChange={(open) => !open && setDeletingRate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa bảng giá này? Hành động này không thể hoàn tác.
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
    </AdminLayout>
  );
};

export default AdminShippingRates;

