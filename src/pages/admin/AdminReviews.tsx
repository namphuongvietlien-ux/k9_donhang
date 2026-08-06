import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Check, X, Search, Filter } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface Review {
  id: string;
  product_id: string;
  user_id: string | null;
  rating: number;
  title: string | null;
  comment: string | null;
  reviewer_name: string;
  reviewer_email: string | null;
  is_verified_purchase: boolean;
  is_approved: boolean;
  helpful_count: number;
  created_at: string;
  updated_at: string;
  products?: {
    name: string;
    slug: string;
  };
}

const AdminReviews = () => {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "approved" | "pending">("all");
  const [filterRating, setFilterRating] = useState<"all" | "1" | "2" | "3" | "4" | "5">("all");

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["admin-reviews", filterStatus, filterRating],
    queryFn: async () => {
      let query = supabase
        .from("product_reviews")
        .select(`
          *,
          products (
            name,
            slug
          )
        `)
        .order("created_at", { ascending: false });

      if (filterStatus === "approved") {
        query = query.eq("is_approved", true);
      } else if (filterStatus === "pending") {
        query = query.eq("is_approved", false);
      }

      if (filterRating !== "all") {
        query = query.eq("rating", parseInt(filterRating));
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Review[];
    },
    enabled: isAdmin,
  });

  const approveReview = useMutation({
    mutationFn: async (reviewId: string) => {
      const { error } = await supabase
        .from("product_reviews")
        .update({ is_approved: true })
        .eq("id", reviewId);

      if (error) throw error;
    },
    onSuccess: (_, reviewId) => {
      toast.success("Đã phê duyệt đánh giá");
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["product-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["product-rating-stats"] });
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Không xác định";
      toast.error("Không thể phê duyệt đánh giá", {
        description: errorMessage,
      });
    },
  });

  const rejectReview = useMutation({
    mutationFn: async (reviewId: string) => {
      const { error } = await supabase
        .from("product_reviews")
        .delete()
        .eq("id", reviewId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Đã xóa đánh giá");
      queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : "Không xác định";
      toast.error("Không thể xóa đánh giá", {
        description: errorMessage,
      });
    },
  });

  const filteredReviews = reviews.filter((review) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        review.reviewer_name.toLowerCase().includes(query) ||
        review.comment?.toLowerCase().includes(query) ||
        review.products?.name.toLowerCase().includes(query)
      );
    }
    return true;
  });

  if (!isAdmin) {
    return (
      <AdminLayout>
        <div className="p-6">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Bạn không có quyền truy cập trang này.
              </p>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Quản lý Đánh giá</h1>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Bộ lọc</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Tìm kiếm..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterStatus} onValueChange={(value: string) => setFilterStatus(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="approved">Đã phê duyệt</SelectItem>
                  <SelectItem value="pending">Chờ phê duyệt</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterRating} onValueChange={(value: string) => setFilterRating(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Đánh giá" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="5">5 sao</SelectItem>
                  <SelectItem value="4">4 sao</SelectItem>
                  <SelectItem value="3">3 sao</SelectItem>
                  <SelectItem value="2">2 sao</SelectItem>
                  <SelectItem value="1">1 sao</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  Tổng: {filteredReviews.length}
                </Badge>
                <Badge variant="secondary">
                  Chờ duyệt: {reviews.filter((r) => !r.is_approved).length}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reviews Table */}
        <Card>
          <CardHeader>
            <CardTitle>Danh sách đánh giá</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : filteredReviews.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Không có đánh giá nào.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead>Người đánh giá</TableHead>
                      <TableHead>Đánh giá</TableHead>
                      <TableHead>Nội dung</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                      <TableHead>Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReviews.map((review) => (
                      <TableRow key={review.id}>
                        <TableCell>
                          <div className="font-medium">
                            {review.products?.name || "N/A"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {review.products?.slug || ""}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{review.reviewer_name}</div>
                          {review.reviewer_email && (
                            <div className="text-sm text-muted-foreground">
                              {review.reviewer_email}
                            </div>
                          )}
                          {review.is_verified_purchase && (
                            <Badge variant="secondary" className="mt-1 text-xs">
                              Đã mua
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-4 h-4 ${
                                  star <= review.rating
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "fill-gray-200 text-gray-200"
                                }`}
                              />
                            ))}
                            <span className="ml-2 font-medium">{review.rating}/5</span>
                          </div>
                          {review.title && (
                            <div className="text-sm font-medium mt-1">{review.title}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-md">
                            <p className="text-sm line-clamp-3">
                              {review.comment || "Không có bình luận"}
                            </p>
                            {review.helpful_count > 0 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {review.helpful_count} người thấy hữu ích
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {review.is_approved ? (
                            <Badge className="bg-green-500">Đã phê duyệt</Badge>
                          ) : (
                            <Badge variant="outline">Chờ phê duyệt</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {new Date(review.created_at).toLocaleDateString("vi-VN")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {!review.is_approved && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => approveReview.mutate(review.id)}
                                  disabled={approveReview.isPending}
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => rejectReview.mutate(review.id)}
                                  disabled={rejectReview.isPending}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminReviews;

