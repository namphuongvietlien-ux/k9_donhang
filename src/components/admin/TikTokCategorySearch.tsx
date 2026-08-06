import { useState, useEffect, useRef } from "react";
import { Search, X, Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchTikTokCategories, type TikTokCategoryOption } from "@/utils/tiktokCategories";
import { cn } from "@/lib/utils";

interface TikTokCategorySearchProps {
  value: TikTokCategoryOption | null;
  onChange: (category: TikTokCategoryOption | null) => void;
  placeholder?: string;
}

export default function TikTokCategorySearch({ 
  value, 
  onChange, 
  placeholder = "Tìm kiếm ngành hàng TikTok..." 
}: TikTokCategorySearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<TikTokCategoryOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setResults([]);
      return;
    }

    const performSearch = async () => {
      setIsLoading(true);
      try {
        const categories = searchTikTokCategories(searchQuery);
        setResults(categories);
      } catch (error) {
        console.error("Error searching TikTok categories:", error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    // If search query is empty, show initial results immediately
    if (!searchQuery.trim()) {
      performSearch();
      return;
    }

    // Otherwise, debounce the search
    const timeoutId = setTimeout(performSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, isOpen]);

  const handleSelect = (category: TikTokCategoryOption) => {
    onChange(category);
    setSearchQuery("");
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setSearchQuery("");
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Input
          type="text"
          value={value ? value.cluster : searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pr-10"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          <Search className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-40 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Đang tìm kiếm...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              {searchQuery ? "Không tìm thấy ngành hàng nào" : "Nhập từ khóa để tìm kiếm"}
            </div>
          ) : (
            <div className="py-1">
              {results.map((category) => (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => handleSelect(category)}
                  className={cn(
                    "w-full text-left px-4 py-2 hover:bg-accent transition-colors",
                    value?.value === category.value && "bg-accent"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{category.cluster}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Marketplace: {category.marketplaceCommissionMin}% - {category.marketplaceCommissionMax}% | 
                        Mall: {category.mallCommissionMin}% - {category.mallCommissionMax}%
                      </div>
                    </div>
                    {value?.value === category.value && (
                      <Check className="h-4 w-4 text-primary ml-2" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

