import { useState, useEffect, useMemo } from "react";
import { DollarSign, TrendingUp, Package, RefreshCw, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminSearchBar, { SearchFilter } from "@/components/admin/AdminSearchBar";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface Product {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  price: number;
  cost_price: number;
  average_cost: number | null;
  profit_margin: number | null;
  auto_calculate_profit: boolean;
  stock_quantity: number;
  is_active: boolean;
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const AdminProductPricing = () => {
  const { products: sharedProducts, loading, error, refreshProducts } = useProducts();
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const { toast } = useToast();

  useEffect(() => {
    setProducts((sharedProducts as Product[]) || []);
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

  // Local state for editing
  const [editingProducts, setEditingProducts] = useState<Record<string, {
    cost_price: number;
    profit_margin: number | null;
    auto_calculate_profit: boolean;
  }>>({});

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter]);

  const categories = useMemo(() => {
    return Array.from(
      new Set(products.map((p) => p.category).filter(Boolean))
    ).sort();
  }, [products]);

  const searchFilters: SearchFilter[] = [
    {
      key: "category",
      label: "Danh mục",
      options: categories.map((cat) => ({
        value: cat || "",
        label: cat || "Không có danh mục",
      })),
    },
  ];

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        !searchQuery ||
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.slug.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        categoryFilter === "all" || product.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, categoryFilter]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleUpdateCostPrice = (productId: string, value: number) => {
    setEditingProducts((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        cost_price: value,
        profit_margin: prev[productId]?.profit_margin ?? null,
        auto_calculate_profit: prev[productId]?.auto_calculate_profit ?? false,
      },
    }));
  };

  const handleUpdateProfitMargin = (productId: string, value: number | null) => {
    setEditingProducts((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        cost_price: prev[productId]?.cost_price ?? 0,
        profit_margin: value,
        auto_calculate_profit: prev[productId]?.auto_calculate_profit ?? false,
      },
    }));
  };

  const handleToggleAutoCalculate = (productId: string) => {
    setEditingProducts((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        cost_price: prev[productId]?.cost_price ?? 0,
        profit_margin: prev[productId]?.profit_margin ?? null,
        auto_calculate_profit: !prev[productId]?.auto_calculate_profit,
      },
    }));
  };

  const handleLoadFromAverageCost = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (product?.average_cost && product.average_cost > 0) {
      setEditingProducts((prev) => ({
        ...prev,
        [productId]: {
          ...prev[productId],
          cost_price: product.average_cost!,
          profit_margin: prev[productId]?.profit_margin ?? null,
          auto_calculate_profit: prev[productId]?.auto_calculate_profit ?? false,
        },
      }));
      toast({
        title: "Đã cập nhật",
        description: `Đã lấy giá vốn từ giá nhập trung bình: ${formatPrice(product.average_cost)}`,
      });
    } else {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Sản phẩm chưa có giá nhập trung bình",
      });
    }
  };

  const handleSave = async (productId: string) => {
    const edited = editingProducts[productId];
    if (!edited) return;

    setSaving(productId);
    try {
      const updateData: any = {
        cost_price: edited.cost_price,
        profit_margin: edited.profit_margin,
        auto_calculate_profit: edited.auto_calculate_profit,
      };

      // Auto-calculate price if enabled
      if (edited.auto_calculate_profit && edited.cost_price > 0 && edited.profit_margin && edited.profit_margin > 0) {
        updateData.price = Math.round(edited.cost_price * (1 + edited.profit_margin / 100));
      }

      const { error } = await supabase
        .from("products")
        .update(updateData)
        .eq("id", productId);

      if (error) throw error;

      // Update local state
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                cost_price: edited.cost_price,
                profit_margin: edited.profit_margin,
                auto_calculate_profit: edited.auto_calculate_profit,
                price: updateData.price ?? p.price,
              }
            : p
        )
      );

      // Remove from editing state
      setEditingProducts((prev) => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });

      toast({
        title: "Đã lưu",
        description: "Đã cập nhật giá vốn và lợi nhuận",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể cập nhật sản phẩm",
      });
    } finally {
      setSaving(null);
    }
  };

  const handleBulkLoadFromAverageCost = async () => {
    try {
      const productsToUpdate = products.filter(
        (p) => p.average_cost && p.average_cost > 0 && (!p.cost_price || p.cost_price === 0)
      );

      if (productsToUpdate.length === 0) {
        toast({
          title: "Thông báo",
          description: "Không có sản phẩm nào cần cập nhật",
        });
        return;
      }

      setSaving("bulk");
      const updates = productsToUpdate.map((p) =>
        supabase
          .from("products")
          .update({ cost_price: p.average_cost })
          .eq("id", p.id)
      );

      await Promise.all(updates);
      await refreshProducts();
      setProducts((prev) => prev.map((p) => {
        const averageCostValue = p.average_cost ?? 0;
        if (averageCostValue > 0 && (!p.cost_price || p.cost_price === 0)) {
          return { ...p, cost_price: averageCostValue };
        }
        return p;
      }));

      toast({
        title: "Đã cập nhật",
        description: `Đã cập nhật giá vốn cho ${productsToUpdate.length} sản phẩm`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể cập nhật hàng loạt",
      });
    } finally {
      setSaving(null);
    }
  };

  const getProductDisplayData = (product: Product) => {
    const edited = editingProducts[product.id];
    const costPrice = edited?.cost_price ?? product.cost_price;
    const profitMargin = edited?.profit_margin ?? product.profit_margin;
    const autoCalculate = edited?.auto_calculate_profit ?? product.auto_calculate_profit;
    const sellingPrice = product.price;
    const profit = sellingPrice - costPrice;
    const calculatedMargin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;

    return {
      costPrice,
      profitMargin,
      autoCalculate,
      sellingPrice,
      profit,
      calculatedMargin,
    };
  };

  return (
    <AdminLayout>
      <SEO title="Quản lý giá vốn & lợi nhuận | Admin" description="Quản lý giá vốn và lợi nhuận sản phẩm" />

      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Quản lý giá vốn & lợi nhuận</h1>
            <p className="text-muted-foreground">Quản lý giá vốn và biên lợi nhuận cho sản phẩm</p>
          </div>
          <Button
            onClick={handleBulkLoadFromAverageCost}
            variant="outline"
            disabled={saving === "bulk"}
          >
            {saving === "bulk" ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Lấy giá vốn từ giá nhập TB (hàng loạt)
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <CardTitle>Danh sách sản phẩm ({filteredProducts.length})</CardTitle>
            <AdminSearchBar
              placeholder="Tìm kiếm theo tên sản phẩm..."
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              filters={searchFilters}
              activeFilters={{
                category: categoryFilter,
              }}
              onFilterChange={(key, value) => {
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
              Không tìm thấy sản phẩm
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead>Giá bán</TableHead>
                    <TableHead>Giá vốn</TableHead>
                    <TableHead>Giá nhập TB</TableHead>
                    <TableHead>Biên LN (%)</TableHead>
                    <TableHead>Tự động tính</TableHead>
                    <TableHead>Lợi nhuận</TableHead>
                    <TableHead>Biên LN thực</TableHead>
                    <TableHead className="w-32">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProducts.map((product) => {
                    const display = getProductDisplayData(product);
                    const isEditing = !!editingProducts[product.id];
                    const hasChanges = isEditing && (
                      editingProducts[product.id].cost_price !== product.cost_price ||
                      editingProducts[product.id].profit_margin !== product.profit_margin ||
                      editingProducts[product.id].auto_calculate_profit !== product.auto_calculate_profit
                    );

                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            {product.category && (
                              <p className="text-xs text-muted-foreground">{product.category}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-primary">
                            {formatPrice(display.sellingPrice)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            value={display.costPrice}
                            onChange={(e) =>
                              handleUpdateCostPrice(product.id, Number(e.target.value))
                            }
                            className="w-32"
                            onBlur={() => {
                              if (hasChanges) {
                                // Auto-save on blur if changed
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {product.average_cost && product.average_cost > 0 ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{formatPrice(product.average_cost)}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleLoadFromAverageCost(product.id)}
                                className="h-6 text-xs"
                              >
                                <RefreshCw className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={display.profitMargin || ""}
                            onChange={(e) =>
                              handleUpdateProfitMargin(
                                product.id,
                                e.target.value ? Number(e.target.value) : null
                              )
                            }
                            placeholder="%"
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={display.autoCalculate}
                            onChange={() => handleToggleAutoCalculate(product.id)}
                            className="h-4 w-4"
                          />
                        </TableCell>
                        <TableCell>
                          <p
                            className={`font-medium ${
                              display.profit >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {formatPrice(display.profit)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p
                            className={`font-medium ${
                              display.calculatedMargin >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {display.calculatedMargin.toFixed(2)}%
                          </p>
                        </TableCell>
                        <TableCell>
                          {hasChanges && (
                            <Button
                              size="sm"
                              onClick={() => handleSave(product.id)}
                              disabled={saving === product.id}
                            >
                              {saving === product.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <Save className="w-4 h-4 mr-1" />
                                  Lưu
                                </>
                              )}
                            </Button>
                          )}
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
    </AdminLayout>
  );
};

export default AdminProductPricing;

