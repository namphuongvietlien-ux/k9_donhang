import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Minus, Plus, Facebook, Twitter, Link as LinkIcon } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";

interface Product {
  id: number | string;
  name: string;
  slug?: string;
  price: number;
  originalPrice: number | null;
  image: string;
  category?: string | null;
  badge: string | null;
  hasGift: boolean;
  stockQuantity?: number;
}

interface QuickViewDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const QuickViewDialog = ({ product, open, onOpenChange }: QuickViewDialogProps) => {
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();
  const { toast } = useToast();

  if (!product) return null;

  const discount = product.originalPrice 
    ? Math.round((1 - product.price / product.originalPrice) * 100) 
    : 0;

  const handleAddToCart = async () => {
    // Check stock before adding to cart
    const availableStock = product.stockQuantity ?? 0;
    if (availableStock <= 0) {
      toast({
        variant: "destructive",
        title: "Sản phẩm đã hết hàng",
        description: "Vui lòng chọn sản phẩm khác.",
      });
      return;
    }
    
    if (quantity > availableStock) {
      toast({
        variant: "destructive",
        title: "Số lượng vượt quá tồn kho",
        description: `Sản phẩm chỉ còn ${availableStock} sản phẩm.`,
      });
      return;
    }
    
    for (let i = 0; i < quantity; i++) {
      addItem({
        id: product.id,
        name: product.name,
        slug: product.slug || product.name.toLowerCase().replace(/\s+/g, "-"),
        price: product.originalPrice || product.price,
        salePrice: product.originalPrice ? product.price : null,
        image: product.image,
      });
    }
    toast({
      title: "Đã thêm vào giỏ hàng",
      description: `${quantity} x ${product.name}`,
    });
    setQuantity(1);
    onOpenChange(false);
  };

  const handleShare = (platform: string) => {
    const url = window.location.origin + "/product/" + (product.slug || product.id);
    const text = `Xem sản phẩm: ${product.name}`;
    
    let shareUrl = "";
    switch (platform) {
      case "facebook":
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        break;
      case "twitter":
        shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
        break;
      case "copy":
        navigator.clipboard.writeText(url);
        toast({ title: "Đã sao chép link sản phẩm!" });
        return;
    }
    if (shareUrl) {
      window.open(shareUrl, "_blank", "width=600,height=400");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Xem nhanh sản phẩm: {product.name}</DialogTitle>
        <div className="grid md:grid-cols-2 gap-0">
          {/* Product Image */}
          <div className="relative bg-accent/10 p-6 flex items-center justify-center">
            <img
              src={product.image}
              alt={product.name}
              className="max-h-[400px] w-auto object-contain"
            />
          </div>

          {/* Product Info */}
          <div className="p-6 flex flex-col">
            <h2 className="text-xl font-bold text-foreground mb-4 leading-tight">
              {product.name}
            </h2>

            {/* Status */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-muted-foreground">Tình trạng:</span>
              {(() => {
                const isOutOfStock = (product.stockQuantity ?? 0) === 0;
                return (
                  <Badge variant="outline" className={isOutOfStock ? "text-destructive border-destructive" : "text-primary border-primary"}>
                    {isOutOfStock ? "Hết hàng" : "Còn hàng"}
                  </Badge>
                );
              })()}
            </div>

            {/* Price */}
            <div className="flex items-center gap-3 mb-6 p-4 bg-accent/20 rounded-lg">
              <span className="text-muted-foreground">Giá:</span>
              <span className="text-2xl font-bold text-primary">
                {formatPrice(product.price)}
              </span>
              {product.originalPrice && (
                <>
                  <span className="text-muted-foreground line-through">
                    {formatPrice(product.originalPrice)}
                  </span>
                  <Badge className="bg-primary text-primary-foreground">
                    -{discount}%
                  </Badge>
                </>
              )}
            </div>

            {/* Quantity */}
            <div className="flex items-center gap-4 mb-6">
              <span className="text-muted-foreground">Số lượng:</span>
              <div className="flex items-center border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-3 py-2 hover:bg-accent transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="px-4 py-2 min-w-[50px] text-center font-medium">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="px-3 py-2 hover:bg-accent transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Add to Cart Button */}
            <Button 
              size="lg" 
              className="w-full gap-2 mb-6"
              onClick={handleAddToCart}
              disabled={(product.stockQuantity ?? 0) === 0}
            >
              <ShoppingCart className="w-5 h-5" />
              {(product.stockQuantity ?? 0) === 0 ? "HẾT HÀNG" : "THÊM VÀO GIỎ"}
            </Button>

            {/* Share */}
              <div className="flex items-center gap-3 mb-6">
                <span className="text-muted-foreground">Chia sẻ:</span>
                <div className="flex gap-2" role="group" aria-label="Chia sẻ sản phẩm">
                  <button
                    onClick={() => handleShare("facebook")}
                    className="w-9 h-9 rounded-full bg-[#1877f2] text-white flex items-center justify-center hover:opacity-80 transition-opacity"
                    aria-label="Chia sẻ lên Facebook"
                  >
                    <Facebook className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleShare("twitter")}
                    className="w-9 h-9 rounded-full bg-[#1da1f2] text-white flex items-center justify-center hover:opacity-80 transition-opacity"
                    aria-label="Chia sẻ lên Twitter"
                  >
                    <Twitter className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleShare("copy")}
                    className="w-9 h-9 rounded-full bg-muted text-foreground flex items-center justify-center hover:opacity-80 transition-opacity"
                    aria-label="Sao chép link sản phẩm"
                  >
                    <LinkIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

            {/* View Details Link */}
            <Link
              to={`/product/${product.slug || product.id}`}
              className="text-primary hover:underline text-center"
              onClick={() => onOpenChange(false)}
            >
              Xem chi tiết sản phẩm »
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickViewDialog;
