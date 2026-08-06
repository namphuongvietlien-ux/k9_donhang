import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Star, ThumbsUp, User, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

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
}

interface ProductReviewsProps {
  productId: string;
  productName: string;
}

const StarRating = ({ 
  rating, 
  onRatingChange, 
  readonly = false 
}: { 
  rating: number; 
  onRatingChange?: (rating: number) => void;
  readonly?: boolean;
}) => {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => !readonly && onRatingChange?.(star)}
          disabled={readonly}
          aria-label={`Đánh giá ${star} sao`}
          className={`
            ${readonly ? "cursor-default" : "cursor-pointer hover:scale-110 transition-transform"}
          `}
        >
          <Star
            className={`w-5 h-5 ${
              star <= rating
                ? "fill-yellow-400 text-yellow-400"
                : "fill-gray-200 text-gray-200"
            }`}
          />
        </button>
      ))}
    </div>
  );
};

const ProductReviews = ({ productId, productName }: ProductReviewsProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [reviewerName, setReviewerName] = useState(user?.user_metadata?.full_name || "");
  const [reviewerEmail, setReviewerEmail] = useState(user?.email || "");

  // Fetch reviews
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["product-reviews", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("*")
        .eq("product_id", productId)
        .eq("is_approved", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Review[];
    },
  });

  // Fetch rating stats
  const { data: ratingStats } = useQuery({
    queryKey: ["product-rating-stats", productId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_product_rating_stats", {
        product_uuid: productId,
      });

      // If RPC function doesn't exist (404), return null instead of throwing
      // Check multiple error indicators: code, status, message
      if (error) {
        const isNotFoundError = 
          error.code === "PGRST116" || 
          error.code === "PGRST202" ||  // Function not found in schema cache
          error.code === "42883" || 
          error.code === "404" ||
          error.status === 404 ||
          error.message?.includes("does not exist") || 
          error.message?.includes("function") ||
          error.message?.includes("not found") ||
          error.message?.includes("NOT_FOUND") ||
          error.message?.includes("schema cache") ||
          (error.details && error.details.includes("function")) ||
          (error.hint && error.hint.includes("function"));
        
        if (isNotFoundError) {
          // RPC function doesn't exist, return null (will show 0 reviews)
          return null;
        }
        throw error;
      }
      return data?.[0] as {
        average_rating: number;
        total_reviews: number;
        rating_distribution: {
          "1": number;
          "2": number;
          "3": number;
          "4": number;
          "5": number;
        };
      } | null;
    },
    retry: false, // Don't retry if function doesn't exist
  });

  // Submit review mutation
  const submitReview = useMutation({
    mutationFn: async () => {
      if (!rating) {
        throw new Error("Vui lòng chọn đánh giá");
      }
      if (!reviewerName.trim()) {
        throw new Error("Vui lòng nhập tên");
      }
      if (!user && !reviewerEmail.trim()) {
        throw new Error("Vui lòng nhập email");
      }

      const { data, error } = await supabase
        .from("product_reviews")
        .insert({
          product_id: productId,
          user_id: user?.id || null,
          rating,
          title: title.trim() || null,
          comment: comment.trim() || null,
          reviewer_name: reviewerName.trim(),
          reviewer_email: user?.email || reviewerEmail.trim() || null,
          is_verified_purchase: false, // Can be enhanced with order checking
          is_approved: false, // Requires admin approval
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Cảm ơn bạn đã đánh giá! Đánh giá của bạn đang chờ phê duyệt.");
      setIsReviewDialogOpen(false);
      setRating(0);
      setTitle("");
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["product-reviews", productId] });
      queryClient.invalidateQueries({ queryKey: ["product-rating-stats", productId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Có lỗi xảy ra khi gửi đánh giá");
    },
  });

  // Mark helpful mutation
  const markHelpful = useMutation({
    mutationFn: async (reviewId: string) => {
      const { data, error } = await supabase
        .from("product_reviews")
        .update({ helpful_count: supabase.raw("helpful_count + 1") })
        .eq("id", reviewId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-reviews", productId] });
      toast.success("Cảm ơn bạn đã đánh giá hữu ích!");
    },
    onError: () => {
      toast.error("Có lỗi xảy ra");
    },
  });

  const averageRating = ratingStats?.average_rating || 0;
  const totalReviews = ratingStats?.total_reviews || 0;
  const distribution = ratingStats?.rating_distribution || { "5": 0, "4": 0, "3": 0, "2": 0, "1": 0 };

  return (
    <div className="space-y-6">
      {/* Rating Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Star className="w-6 h-6 fill-yellow-400 text-yellow-400" />
              <span className="text-3xl font-bold">{averageRating.toFixed(1)}</span>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">
                Dựa trên {totalReviews} đánh giá
              </div>
              <StarRating rating={Math.round(averageRating)} readonly />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Rating Distribution */}
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = distribution[star.toString() as keyof typeof distribution] || 0;
              const percentage = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-3">
                  <div className="flex items-center gap-1 w-20">
                    <span className="text-sm">{star}</span>
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  </div>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-400 transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-12 text-right">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Write Review Button */}
      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogTrigger asChild>
          <Button className="w-full sm:w-auto">
            <Star className="w-4 h-4 mr-2" />
            Viết đánh giá
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Đánh giá sản phẩm: {productName}</DialogTitle>
            <DialogDescription>
              Chia sẻ trải nghiệm của bạn về sản phẩm này
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Đánh giá *</Label>
              <StarRating rating={rating} onRatingChange={setRating} />
            </div>
            <div>
              <Label htmlFor="reviewer-name">Tên của bạn *</Label>
              <Input
                id="reviewer-name"
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                placeholder="Nhập tên của bạn"
              />
            </div>
            {!user && (
              <div>
                <Label htmlFor="reviewer-email">Email *</Label>
                <Input
                  id="reviewer-email"
                  type="email"
                  value={reviewerEmail}
                  onChange={(e) => setReviewerEmail(e.target.value)}
                  placeholder="your@email.com"
                />
              </div>
            )}
            <div>
              <Label htmlFor="review-title">Tiêu đề đánh giá (tùy chọn)</Label>
              <Input
                id="review-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Tóm tắt đánh giá của bạn"
              />
            </div>
            <div>
              <Label htmlFor="review-comment">Nội dung đánh giá *</Label>
              <Textarea
                id="review-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Chia sẻ chi tiết về trải nghiệm của bạn..."
                rows={5}
              />
            </div>
            <Button
              onClick={() => submitReview.mutate()}
              disabled={submitReview.isPending || !rating || !comment.trim()}
              className="w-full"
            >
              {submitReview.isPending ? "Đang gửi..." : "Gửi đánh giá"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Separator />

      {/* Reviews List */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">
          Đánh giá khách hàng ({totalReviews})
        </h3>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <div className="animate-pulse space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Chưa có đánh giá nào. Hãy là người đầu tiên đánh giá sản phẩm này!
            </CardContent>
          </Card>
        ) : (
          reviews.map((review) => (
            <Card key={review.id}>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{review.reviewer_name}</span>
                          {review.is_verified_purchase && (
                            <Badge variant="secondary" className="gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Đã mua hàng
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(review.created_at).toLocaleDateString("vi-VN", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </div>
                      </div>
                    </div>
                    <StarRating rating={review.rating} readonly />
                  </div>
                  {review.title && (
                    <h4 className="font-semibold text-lg">{review.title}</h4>
                  )}
                  {review.comment && (
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {review.comment}
                    </p>
                  )}
                  <div className="flex items-center gap-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markHelpful.mutate(review.id)}
                      disabled={markHelpful.isPending}
                    >
                      <ThumbsUp className="w-4 h-4 mr-2" />
                      Hữu ích ({review.helpful_count})
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default ProductReviews;

