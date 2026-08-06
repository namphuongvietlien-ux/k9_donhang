import { useState, useEffect } from "react";
import { Package, AlertTriangle, TrendingUp, Eye, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminSearchBar, { SearchFilter } from "@/components/admin/AdminSearchBar";
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
import { useToast } from "@/hooks/use-toast";
import InventoryDetailDialog from "@/components/admin/InventoryDetailDialog";

interface Product {
  id: string;
  name: string;
  category: string | null;
  stock_quantity: number;
  min_stock_level: number;
  max_stock_level: number | null;
  average_cost: number;
  unit: string;
  is_active: boolean;
}

const AdminInventory = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [warningFilter, setWarningFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { toast } = useToast();

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category, stock_quantity, min_stock_level, max_stock_level, average_cost, unit, is_active")
        .order("name");

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching products:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải danh sách tồn kho",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, warningFilter]);

  const categories = Array.from(
    new Set(products.map((p) => p.category).filter(Boolean))
  ).sort();

  const searchFilters: SearchFilter[] = [
    {
      key: "category",
      label: "Danh mục",
      options: categories.map((cat) => ({
        value: cat || "",
        label: cat || "Không có danh mục",
      })),
    },
    {
      key: "warning",
      label: "Cảnh báo",
      options: [
        { value: "low", label: "Tồn kho thấp" },
        { value: "out", label: "Hết hàng" },
        { value: "high", label: "Tồn kho cao" },
        { value: "normal", label: "Bình thường" },
      ],
    },
  ];

  const getStockStatus = (product: Product) => {
    if (product.stock_quantity === 0) return "out";
    if (product.stock_quantity < product.min_stock_level) return "low";
    if (product.max_stock_level && product.stock_quantity > product.max_stock_level) return "high";
    return "normal";
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      !searchQuery ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.category?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      categoryFilter === "all" || product.category === categoryFilter;

    const status = getStockStatus(product);
    const matchesWarning =
      warningFilter === "all" || status === warningFilter;

    return matchesSearch && matchesCategory && matchesWarning;
  });

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price) + "₫";
  };

  const getStockValue = (product: Product) => {
    return product.stock_quantity * product.average_cost;
  };

  const totalStockValue = filteredProducts.reduce(
    (sum, product) => sum + getStockValue(product),
    0
  );

  const handleViewDetail = (product: Product) => {
    setSelectedProduct(product);
    setIsDetailOpen(true);
  };

  if (loading) {
    return (
      <AdminLayout>
        <SEO title="Quản lý tồn kho" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SEO title="Quản lý tồn kho" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Quản lý tồn kho</h1>
            <p className="text-muted-foreground mt-1">
              Xem tồn kho theo sản phẩm và giá trị tồn kho
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tổng giá trị tồn kho
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPrice(totalStockValue)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Sản phẩm sắp hết
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">
                {filteredProducts.filter((p) => getStockStatus(p) === "low" || getStockStatus(p) === "out").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tổng số sản phẩm
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredProducts.length}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Danh sách tồn kho</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminSearchBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              filters={searchFilters}
              onFilterChange={(key, value) => {
                if (key === "category") setCategoryFilter(value);
                if (key === "warning") setWarningFilter(value);
              }}
            />

            {filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery || categoryFilter !== "all" || warningFilter !== "all"
                    ? "Không tìm thấy sản phẩm nào"
                    : "Chưa có sản phẩm nào"}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-md border mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">STT</TableHead>
                        <TableHead>Sản phẩm</TableHead>
                        <TableHead>Danh mục</TableHead>
                        <TableHead>Tồn kho</TableHead>
                        <TableHead>Giá vốn TB</TableHead>
                        <TableHead>Giá trị tồn kho</TableHead>
                        <TableHead>Tồn tối thiểu</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead className="text-right">Thao tác</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedProducts.map((product, idx) => {
                        const status = getStockStatus(product);
                        return (
                          <TableRow key={product.id}>
                            <TableCell className="text-center text-muted-foreground tabular-nums">
                              {startIndex + idx + 1}
                            </TableCell>
                            <TableCell className="font-medium">
                              {product.name}
                            </TableCell>
                            <TableCell>{product.category || "-"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span>{product.stock_quantity}</span>
                                <span className="text-muted-foreground text-sm">
                                  {product.unit || "cái"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>{formatPrice(product.average_cost)}</TableCell>
                            <TableCell className="font-medium">
                              {formatPrice(getStockValue(product))}
                            </TableCell>
                            <TableCell>{product.min_stock_level}</TableCell>
                            <TableCell>
                              {status === "out" && (
                                <Badge variant="destructive">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Hết hàng
                                </Badge>
                              )}
                              {status === "low" && (
                                <Badge variant="outline" className="border-warning text-warning">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Sắp hết
                                </Badge>
                              )}
                              {status === "high" && (
                                <Badge variant="outline" className="border-blue-500 text-blue-500">
                                  <TrendingUp className="w-3 h-3 mr-1" />
                                  Tồn cao
                                </Badge>
                              )}
                              {status === "normal" && (
                                <Badge variant="outline">Bình thường</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleViewDetail(product)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <AdminPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  itemsPerPage={itemsPerPage}
                  onItemsPerPageChange={setItemsPerPage}
                  totalItems={filteredProducts.length}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <InventoryDetailDialog
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        product={selectedProduct}
      />
    </AdminLayout>
  );
};

export default AdminInventory;

