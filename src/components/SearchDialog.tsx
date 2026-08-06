import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Search, X, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import productPepper from "@/assets/product-pepper.jpg";
import productCinnamon from "@/assets/product-cinnamon.jpg";
import productTurmeric from "@/assets/product-turmeric.jpg";
import productSalt from "@/assets/product-salt.jpg";

const allProducts = [
  {
    id: 1,
    name: "Tiêu đen Phú Quốc nguyên hạt 500g",
    slug: "tieu-den-phu-quoc",
    price: 180000,
    salePrice: 126000,
    image: productPepper,
    category: "Hạt tiêu"
  },
  {
    id: 2,
    name: "Tiêu trắng Phú Quốc xay nhuyễn 200g",
    slug: "tieu-trang-phu-quoc",
    price: 220000,
    salePrice: null,
    image: productPepper,
    category: "Hạt tiêu"
  },
  {
    id: 3,
    name: "Quế Ceylon Sri Lanka nguyên thanh",
    slug: "que-ceylon",
    price: 250000,
    salePrice: 175000,
    image: productCinnamon,
    category: "Quế"
  },
  {
    id: 4,
    name: "Bột quế Ceylon nguyên chất 100g",
    slug: "bot-que-ceylon",
    price: 120000,
    salePrice: null,
    image: productCinnamon,
    category: "Quế"
  },
  {
    id: 5,
    name: "Bột nghệ vàng nguyên chất 200g",
    slug: "bot-nghe-vang",
    price: 120000,
    salePrice: 84000,
    image: productTurmeric,
    category: "Nghệ"
  },
  {
    id: 6,
    name: "Nghệ tươi Đắk Lắk 1kg",
    slug: "nghe-tuoi-dak-lak",
    price: 85000,
    salePrice: null,
    image: productTurmeric,
    category: "Nghệ"
  },
  {
    id: 7,
    name: "Muối hồng Himalaya xay nhuyễn 500g",
    slug: "muoi-hong-himalaya",
    price: 95000,
    salePrice: 66500,
    image: productSalt,
    category: "Muối"
  },
  {
    id: 8,
    name: "Muối hồng Himalaya nguyên hạt 1kg",
    slug: "muoi-hong-hat",
    price: 150000,
    salePrice: null,
    image: productSalt,
    category: "Muối"
  }
];

const suggestedKeywords = ["Tiêu đen", "Muối hồng", "Quế Ceylon", "Bột nghệ"];

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('vi-VN').format(price) + '₫';
};

const SearchDialog = ({ open, onOpenChange }: SearchDialogProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<typeof allProducts>([]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const filtered = allProducts.filter(product => 
      product.name.toLowerCase().includes(query.toLowerCase()) ||
      product.category.toLowerCase().includes(query.toLowerCase())
    );
    setResults(filtered);
  }, []);

  const handleKeywordClick = (keyword: string) => {
    handleSearch(keyword);
  };

  const handleProductClick = () => {
    onOpenChange(false);
    setSearchQuery("");
    setResults([]);
  };

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setResults([]);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="sr-only">Tìm kiếm sản phẩm</DialogTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm sản phẩm..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 pr-10 h-12 text-base"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => handleSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {/* Suggested Keywords */}
          {!searchQuery && (
            <div className="mb-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                <TrendingUp className="w-4 h-4" />
                <span>Gợi ý cho bạn:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestedKeywords.map((keyword) => (
                  <button
                    key={keyword}
                    onClick={() => handleKeywordClick(keyword)}
                    className="px-3 py-1.5 bg-muted rounded-full text-sm hover:bg-muted/80 transition-colors"
                  >
                    {keyword}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search Results */}
          {searchQuery && results.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Tìm thấy {results.length} sản phẩm
              </p>
              <div className="space-y-3">
                {results.map((product) => (
                  <Link
                    key={product.id}
                    to={`/product/${product.slug}`}
                    onClick={handleProductClick}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted transition-colors group"
                  >
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                        {product.name}
                      </h4>
                      <p className="text-sm text-muted-foreground">{product.category}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {product.salePrice ? (
                          <>
                            <span className="text-primary font-semibold">
                              {formatPrice(product.salePrice)}
                            </span>
                            <span className="text-sm text-muted-foreground line-through">
                              {formatPrice(product.price)}
                            </span>
                          </>
                        ) : (
                          <span className="text-foreground font-semibold">
                            {formatPrice(product.price)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <Link
                to="/products"
                onClick={handleProductClick}
                className="block text-center text-primary hover:underline mt-4 py-2"
              >
                Xem tất cả sản phẩm →
              </Link>
            </div>
          )}

          {/* No Results */}
          {searchQuery && searchQuery.length >= 2 && results.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-2">
                Không tìm thấy sản phẩm nào cho "{searchQuery}"
              </p>
              <Link
                to="/products"
                onClick={handleProductClick}
                className="text-primary hover:underline"
              >
                Xem tất cả sản phẩm
              </Link>
            </div>
          )}

          {/* Typing hint */}
          {searchQuery && searchQuery.length < 2 && (
            <p className="text-center text-muted-foreground py-4">
              Nhập ít nhất 2 ký tự để tìm kiếm...
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SearchDialog;
