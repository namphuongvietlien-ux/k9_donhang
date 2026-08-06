import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Plus, Pencil, Trash2, Search, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPagination from "@/components/admin/AdminPagination";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface FlashSale {
  id: string;
  title: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  display_order: number;
  banner_image_url: string | null;
  created_at: string;
  updated_at: string;
  products?: Array<{
    id: string;
    product_id: string;
    flash_sale_price: number | null;
    max_quantity: number | null;
    price_mask_enabled: boolean;
    price_mask_hide_first_digits: number;
    product: {
      id: string;
      name: string;
      slug: string;
      price: number;
      image_url: string | null;
    };
  }>;
}

const AdminFlashSales = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [flashSales, setFlashSales] = useState<FlashSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deletingFlashSale, setDeletingFlashSale] = useState<FlashSale | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Fetch flash sales
  const fetchFlashSales = async () => {
    try {
      const { data, error } = await supabase
        .from("flash_sales")
        .select(`
          *,
          products:flash_sale_products(
            id,
            product_id,
            flash_sale_price,
            max_quantity,
            price_mask_enabled,
            price_mask_hide_first_digits,
            product:products(id, name, slug, price, image_url)
          )
        `)
        .order("display_order", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFlashSales((data || []) as FlashSale[]);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải danh sách flash sale",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlashSales();
  }, []);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const filteredFlashSales = flashSales.filter((fs) => {
    const matchesSearch = fs.title.toLowerCase().includes(searchQuery.toLowerCase());
    const now = new Date();
    const startsAt = new Date(fs.starts_at);
    const endsAt = new Date(fs.ends_at);
    
    let matchesStatus = true;
    if (statusFilter === "active") {
      matchesStatus = fs.is_active && startsAt <= now && endsAt > now;
    } else if (statusFilter === "upcoming") {
      matchesStatus = fs.is_active && startsAt > now;
    } else if (statusFilter === "ended") {
      matchesStatus = endsAt <= now;
    } else if (statusFilter === "inactive") {
      matchesStatus = !fs.is_active;
    }

    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredFlashSales.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedFlashSales = filteredFlashSales.slice(startIndex, startIndex + itemsPerPage);

  const handleDelete = async () => {
    if (!deletingFlashSale) return;

    try {
      const { error } = await supabase
        .from("flash_sales")
        .delete()
        .eq("id", deletingFlashSale.id);

      if (error) throw error;

      toast({
        title: "Đã xóa flash sale",
        description: `Flash sale "${deletingFlashSale.title}" đã được xóa`,
      });

      setDeletingFlashSale(null);
      fetchFlashSales();
      queryClient.invalidateQueries({ queryKey: ["flash-sales"] });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error.message || "Không thể xóa flash sale",
      });
    }
  };

  const getStatus = (flashSale: FlashSale) => {
    const now = new Date();
    const startsAt = new Date(flashSale.starts_at);
    const endsAt = new Date(flashSale.ends_at);

    if (!flashSale.is_active) return { label: "Tắt", variant: "secondary" as const };
    if (startsAt > now) return { label: "Sắp diễn ra", variant: "default" as const };
    if (endsAt <= now) return { label: "Đã kết thúc", variant: "destructive" as const };
    return { label: "Đang diễn ra", variant: "default" as const };
  };

  if (loading) {
    return (
      <AdminLayout>
        <SEO title="Quản lý Flash Sale" />
        <div className="p-6 space-y-4">
          <div className="h-8 w-64 bg-muted animate-pulse rounded" />
          <div className="h-96 bg-muted animate-pulse rounded" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SEO title="Quản lý Flash Sale" />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Zap className="w-8 h-8 text-primary" />
              Quản lý Flash Sale
            </h1>
            <p className="text-muted-foreground mt-1">
              Tạo và quản lý các chương trình flash sale cho sản phẩm
            </p>
          </div>
          <Button onClick={() => navigate("/admin/flash-sales/new")} className="gap-2">
            <Plus className="w-4 h-4" />
            Tạo Flash Sale
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm kiếm flash sale..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="Lọc theo trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="active">Đang diễn ra</SelectItem>
                  <SelectItem value="upcoming">Sắp diễn ra</SelectItem>
                  <SelectItem value="ended">Đã kết thúc</SelectItem>
                  <SelectItem value="inactive">Tắt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              Danh sách Flash Sale ({filteredFlashSales.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {paginatedFlashSales.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery || statusFilter !== "all"
                  ? "Không tìm thấy flash sale nào"
                  : "Chưa có flash sale nào. Tạo flash sale đầu tiên!"}
              </div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tiêu đề</TableHead>
                        <TableHead>Giảm giá</TableHead>
                        <TableHead>Thời gian</TableHead>
                        <TableHead>Sản phẩm</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedFlashSales.map((flashSale) => {
                        const status = getStatus(flashSale);
                        return (
                          <TableRow key={flashSale.id}>
                            <TableCell className="font-medium">
                              {flashSale.title}
                            </TableCell>
                            <TableCell>
                              {flashSale.discount_type === "percentage"
                                ? `${flashSale.discount_value}%`
                                : `${new Intl.NumberFormat("vi-VN").format(flashSale.discount_value)}₫`}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div>
                                  Bắt đầu:{" "}
                                  {format(new Date(flashSale.starts_at), "dd/MM/yyyy HH:mm", {
                                    locale: vi,
                                  })}
                                </div>
                                <div>
                                  Kết thúc:{" "}
                                  {format(new Date(flashSale.ends_at), "dd/MM/yyyy HH:mm", {
                                    locale: vi,
                                  })}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {flashSale.products?.length || 0} sản phẩm
                            </TableCell>
                            <TableCell>
                              <Badge variant={status.variant}>{status.label}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => navigate(`/admin/flash-sales/${flashSale.id}/edit`)}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeletingFlashSale(flashSale)}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 && (
                  <div className="mt-4">
                    <AdminPagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                      itemsPerPage={itemsPerPage}
                      onItemsPerPageChange={setItemsPerPage}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingFlashSale}
        onOpenChange={(open) => !open && setDeletingFlashSale(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa flash sale "{deletingFlashSale?.title}"? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminFlashSales;

