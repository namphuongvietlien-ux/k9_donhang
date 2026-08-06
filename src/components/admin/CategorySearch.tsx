import { useState, useEffect, useRef } from "react";
import { Search, X, Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchCategories, type CategoryOption } from "@/utils/shopeeCategories";
import { cn } from "@/lib/utils";

interface CategorySearchProps {
  value: CategoryOption | null;
  onChange: (category: CategoryOption | null) => void;
  placeholder?: string;
}

export default function CategorySearch({ value, onChange, placeholder = "Tìm kiếm ngành hàng..." }: CategorySearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<CategoryOption[]>([]);
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
        const categories = await searchCategories(searchQuery);
        setResults(categories);
      } catch (error) {
        console.error("Error searching categories:", error);
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

  const handleSelect = (category: CategoryOption) => {
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
          placeholder={placeholder}
          value={isOpen ? searchQuery : (value?.fullPath || "")}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="pr-10"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
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
                    "w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors",
                    value?.value === category.value && "bg-orange-50 hover:bg-orange-100"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {category.fullPath}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Phí cố định: {category.category["Phí cố định"]}
                      </div>
                    </div>
                    {value?.value === category.value && (
                      <Check className="h-4 w-4 text-orange-600 flex-shrink-0 ml-2" />
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

