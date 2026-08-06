import { useState } from "react";
import { Search, X, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface SearchField {
  key: string;
  label: string;
}

export interface SearchFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

interface AdminSearchBarProps {
  placeholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchFields?: SearchField[];
  activeSearchField?: string;
  onSearchFieldChange?: (field: string) => void;
  filters?: SearchFilter[];
  activeFilters?: Record<string, string>;
  onFilterChange?: (filterKey: string, value: string) => void;
  showAdvanced?: boolean;
  className?: string;
}

const AdminSearchBar = ({
  placeholder = "Tìm kiếm...",
  searchValue,
  onSearchChange,
  searchFields,
  activeSearchField,
  onSearchFieldChange,
  filters = [],
  activeFilters = {},
  onFilterChange,
  showAdvanced = false,
  className,
}: AdminSearchBarProps) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const hasActiveFilters = Object.values(activeFilters).some(
    (value) => value && value !== "all"
  );

  const handleClearSearch = () => {
    onSearchChange("");
  };

  const handleClearFilters = () => {
    filters.forEach((filter) => {
      onFilterChange?.(filter.key, "all");
    });
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 pr-10"
        />
        {searchValue && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={handleClearSearch}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Search Field Selector (if multiple fields) */}
      {searchFields && searchFields.length > 1 && (
        <Select
          value={activeSearchField || searchFields[0].key}
          onValueChange={onSearchFieldChange}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {searchFields.map((field) => (
              <SelectItem key={field.key} value={field.key}>
                {field.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Advanced Filters */}
      {showAdvanced && filters.length > 0 && (
        <Popover open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={hasActiveFilters ? "default" : "outline"}
              size="icon"
              className={cn(hasActiveFilters && "bg-primary")}
            >
              <Filter className="w-4 h-4" />
              {hasActiveFilters && (
                <Badge
                  variant="secondary"
                  className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
                >
                  {Object.values(activeFilters).filter(
                    (v) => v && v !== "all"
                  ).length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Bộ lọc nâng cao</h4>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearFilters}
                    className="h-7 text-xs"
                  >
                    Xóa tất cả
                  </Button>
                )}
              </div>
              <div className="space-y-3">
                {filters.map((filter) => (
                  <div key={filter.key} className="space-y-2">
                    <Label className="text-xs font-medium">
                      {filter.label}
                    </Label>
                    <Select
                      value={activeFilters[filter.key] || "all"}
                      onValueChange={(value) =>
                        onFilterChange?.(filter.key, value)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả</SelectItem>
                        {filter.options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Simple Filters (if not advanced) */}
      {!showAdvanced &&
        filters.length > 0 &&
        filters.map((filter) => (
          <Select
            key={filter.key}
            value={activeFilters[filter.key] || "all"}
            onValueChange={(value) => onFilterChange?.(filter.key, value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả {filter.label}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
    </div>
  );
};

export default AdminSearchBar;

