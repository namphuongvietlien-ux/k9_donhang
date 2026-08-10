import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Loader2, AlertTriangle, Package, Lock, Unlock, RotateCcw, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminSearchBar, { SearchFilter } from "@/components/admin/AdminSearchBar";
import ProductFlagBadges from "@/components/admin/ProductFlagBadges";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/hooks/useProducts";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  original_price: number | null;
  image_url: string | null;
  category: string | null;
  badge: string | null;
  has_gift: boolean;
  is_active: boolean;
  stock_quantity: number;
  low_stock_threshold: number;
  cost_price: number;
  average_cost: number | null;
  created_at: string;
  is_new?: boolean;
  is_out_stock?: boolean;
  is_locked?: boolean;
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const AdminProducts = () => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "super_admin" || role === "manager";
  const { products: sharedProducts, loading, error, refreshProducts } = useProducts();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [flagBusyId, setFlagBusyId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const { toast } = useToast();

  useEffect(() => {
    if (sharedProducts?.length) {
      setProducts((sharedProducts as Product[]) || []);
    } else {
      setProducts([]);
    }
  }, [sharedProducts]);

  useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải danh sách sản phẩm",
      });
    }
  }, [error, toast]);

  const toggleProductFlag = async (
    product: Product,
    patch: Partial<Pick<Product, "is_locked" | "is_active">>,
  ) => {
    if (!isAdmin) return;
    setFlagBusyId(product.id);
    try {
      const { error } = await supabase
        .from("products")
        .update(patch as never)
        .eq("id", product.id);
      if (error) throw error;
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, ...patch } : p)),
      );
      toast({
        title: "Đã cập nhật mã",
        description: product.slug,
      });
      await refreshProducts();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Không cập nhật được",
        description: e instanceof Error ? e.message : "Lỗi",
      });
    } finally {
      setFlagBusyId(null);
    }
  };

  // Reset to page 1 when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, categoryFilter]);

  // Get unique categories
  const categories = Array.from(
    new Set(products.map((p) => p.category).filter(Boolean))
  ).sort();

  const searchFilters: SearchFilter[] = [
    {
      key: "status",
      label: "Trạng thái",
      options: [
        { value: "active", label: "Đang bán" },
        { value: "inactive", label: "Ngừng bán" },
      ],
    },
    {
      key: "category",
      label: "Danh mục",
      options: categories.map((cat) => ({
        value: cat || "",
        label: cat || "Không có danh mục",
      })),
    },
  ];

  const handleDelete = async () => {
    if (!deleteProduct) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", deleteProduct.id);

      if (error) throw error;

      toast({
        title: "Đã xóa sản phẩm",
        description: `Sản phẩm "${deleteProduct.name}" đã được xóa`,
      });
      setProducts((prev) => prev.filter((p) => p.id !== deleteProduct.id));
      await refreshProducts();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể xóa sản phẩm",
      });
    } finally {
      setIsDeleting(false);
      setDeleteProduct(null);
    }
  };

  const filteredProducts = products.filter((product) => {
    // Search filter
    const matchesSearch =
      !searchQuery ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchQuery.toLowerCase());

    // Status filter
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && product.is_active) ||
      (statusFilter === "inactive" && !product.is_active);

    // Category filter
    const matchesCategory =
      categoryFilter === "all" ||
      product.category === categoryFilter ||
      (!product.category && categoryFilter === "");

    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  return (
    <AdminLayout>
      <SEO title="Quản lý sản phẩm | Admin" description="Quản lý sản phẩm" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Sản phẩm</h1>
          <p className="text-muted-foreground">Quản lý danh sách sản phẩm</p>
        </div>
        <Button onClick={() => navigate("/admin/products/new")} className="gap-2">
          <Plus className="w-4 h-4" />
          Thêm sản phẩm
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <CardTitle>Danh sách sản phẩm ({filteredProducts.length})</CardTitle>
            <AdminSearchBar
              placeholder="Tìm kiếm theo tên, danh mục, mô tả..."
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              filters={searchFilters}
              activeFilters={{
                status: statusFilter,
                category: categoryFilter,
              }}
              onFilterChange={(key, value) => {
                if (key === "status") setStatusFilter(value);
                if (key === "category") setCategoryFilter(value);
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? "Không tìm thấy sản phẩm phù hợp" : "Chưa có sản phẩm nào"}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Ảnh</TableHead>
                    <TableHead>Tên sản phẩm</TableHead>
                    <TableHead>Danh mục</TableHead>
                    <TableHead>Giá bán</TableHead>
                    <TableHead>Giá vốn</TableHead>
                    <TableHead>Lợi nhuận</TableHead>
                    <TableHead>Biên LN (%)</TableHead>
                    <TableHead>Tồn kho</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="w-24">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProducts.map((product) => {
                    const isLowStock = product.stock_quantity > 0 && product.stock_quantity <= product.low_stock_threshold;
                    const flagOut = !!product.is_out_stock;
                    const isOutOfStock = flagOut || product.stock_quantity === 0;
                    const isNegativeStock = product.stock_quantity < 0;
                    const isLocked = !!product.is_locked;
                    const isNew = !!product.is_new;

                    return (
                      <TableRow
                        key={product.id}
                        className={cn(
                          (isOutOfStock || isNegativeStock) && "bg-destructive/5",
                          isLowStock && !isOutOfStock && "bg-yellow-50 dark:bg-yellow-950/20",
                          (flagOut || isLocked) && "opacity-50",
                        )}
                      >
                        <TableCell>
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-12 h-12 object-cover rounded"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-muted rounded flex items-center justify-center text-muted-foreground text-xs">
                              No img
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {isLocked ? (
                                <Lock
                                  className="w-3.5 h-3.5 text-red-600 shrink-0"
                                  aria-label="Khóa mã"
                                />
                              ) : null}
                              <p
                                className={cn(
                                  "font-medium",
                                  flagOut && "line-through text-slate-500",
                                )}
                              >
                                {product.name}
                              </p>
                              <ProductFlagBadges
                                is_new={isNew}
                                is_out_stock={flagOut}
                                is_locked={false}
                              />
                            </div>
                            <p className="font-mono text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              {isLocked ? (
                                <Lock className="w-3 h-3 text-red-600" />
                              ) : null}
                              {product.slug}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {isNegativeStock ? (
                                <Badge variant="destructive" className="mt-1">
                                  Tồn kho âm
                                </Badge>
                              ) : null}
                              {!flagOut && product.badge ? (
                                <Badge variant="outline" className="mt-1">
                                  {product.badge}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{product.category || "-"}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-primary">{formatPrice(product.price)}</p>
                            {product.original_price && (
                              <p className="text-xs text-muted-foreground line-through">
                                {formatPrice(product.original_price)}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">
                              {product.cost_price > 0 ? formatPrice(product.cost_price) : "-"}
                            </p>
                            {product.average_cost && product.average_cost !== product.cost_price && (
                              <p className="text-xs text-muted-foreground">
                                TB: {formatPrice(product.average_cost)}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const costPrice = product.cost_price || 0;
                            const profit = product.price - costPrice;
                            return (
                              <p className={`text-sm font-medium ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {costPrice > 0 ? formatPrice(profit) : "-"}
                              </p>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const costPrice = product.cost_price || 0;
                            const profitMargin = product.price > 0 
                              ? ((product.price - costPrice) / product.price * 100).toFixed(2)
                              : "0.00";
                            return (
                              <p className={`text-sm font-medium ${parseFloat(profitMargin) >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {costPrice > 0 ? `${profitMargin}%` : "-"}
                              </p>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2">
                                  {isNegativeStock ? (
                                    <Badge variant="destructive" className="gap-1">
                                      <AlertTriangle className="w-3 h-3" />
                                      {product.stock_quantity} (Âm)
                                    </Badge>
                                  ) : isOutOfStock ? (
                                    <Badge variant="destructive" className="gap-1">
                                      <Package className="w-3 h-3" />
                                      Hết hàng
                                    </Badge>
                                  ) : isLowStock ? (
                                    <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600">
                                      <AlertTriangle className="w-3 h-3" />
                                      {product.stock_quantity}
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="gap-1">
                                      <Package className="w-3 h-3" />
                                      {product.stock_quantity}
                                    </Badge>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Ngưỡng cảnh báo: {product.low_stock_threshold}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <Badge variant={product.is_active ? "default" : "secondary"}>
                            {product.is_active ? "Hiển thị" : "Ẩn"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                          <div className="flex items-center gap-1">
                            {isAdmin && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      disabled={flagBusyId === product.id}
                                      onClick={() =>
                                        void toggleProductFlag(product, {
                                          is_locked: !isLocked,
                                        })
                                      }
                                      className={
                                        isLocked
                                          ? "text-red-600"
                                          : "text-muted-foreground"
                                      }
                                      title={
                                        isLocked ? "Mở khóa mã" : "Khóa mã"
                                      }
                                    >
                                      {isLocked ? (
                                        <Unlock className="w-4 h-4" />
                                      ) : (
                                        <Lock className="w-4 h-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {isLocked
                                      ? "Khôi phục mã (mở khóa)"
                                      : "Khóa mã (không bán/soạn)"}
                                  </TooltipContent>
                                </Tooltip>
                                {!product.is_active ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={flagBusyId === product.id}
                                        onClick={() =>
                                          void toggleProductFlag(product, {
                                            is_active: true,
                                          })
                                        }
                                        className="text-emerald-700"
                                        title="Khôi phục bán"
                                      >
                                        <RotateCcw className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Khôi phục (đang bán)
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        disabled={flagBusyId === product.id}
                                        onClick={() => {
                                          if (
                                            !confirm(
                                              `Ẩn mã ${product.slug}? (có thể khôi phục)`,
                                            )
                                          )
                                            return;
                                          void toggleProductFlag(product, {
                                            is_active: false,
                                          });
                                        }}
                                        className="text-amber-700"
                                        title="Ẩn mã"
                                      >
                                        <EyeOff className="w-4 h-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Ẩn mã (khôi phục được)
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/admin/products/${product.id}/edit`)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteProduct(product)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                            )}
                          </div>
                          </TooltipProvider>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <AdminPagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredProducts.length}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteProduct} onOpenChange={() => setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa sản phẩm?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa sản phẩm "{deleteProduct?.name}"? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminProducts;
