import { useState } from "react";
import { format, parse } from "date-fns";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface DateTimePickerProps {
  value: string; // Format: "YYYY-MM-DDTHH:mm" (datetime-local format)
  onChange: (value: string) => void;
  id?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

const DateTimePicker = ({
  value,
  onChange,
  id,
  label,
  required = false,
  disabled = false,
}: DateTimePickerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Parse value to Date object
  const dateValue = value ? parse(value, "yyyy-MM-dd'T'HH:mm", new Date()) : new Date();
  const isValidDate = !isNaN(dateValue.getTime());
  
  // Extract date and time parts
  const dateStr = isValidDate ? format(dateValue, "yyyy-MM-dd") : "";
  const timeStr = isValidDate ? format(dateValue, "HH:mm") : "00:00";
  
  // Display format: "DD/MM/YYYY HH:mm" (24h format)
  const displayValue = isValidDate 
    ? format(dateValue, "dd/MM/yyyy HH:mm")
    : "";

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) return;
    
    // Get current time from timeStr
    const [hours, minutes] = timeStr.split(":").map(Number);
    const newDate = new Date(selectedDate);
    newDate.setHours(hours || 0, minutes || 0, 0, 0);
    
    const formatted = format(newDate, "yyyy-MM-dd'T'HH:mm");
    onChange(formatted);
  };

  const handleTimeChange = (time: string) => {
    // Validate time format HH:mm
    const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timeRegex.test(time) && time !== "") return;
    
    if (!isValidDate) {
      // If no date selected, use today
      const today = new Date();
      const [hours, minutes] = time.split(":").map(Number);
      today.setHours(hours || 0, minutes || 0, 0, 0);
      const formatted = format(today, "yyyy-MM-dd'T'HH:mm");
      onChange(formatted);
      return;
    }
    
    const [hours, minutes] = time.split(":").map(Number);
    const newDate = new Date(dateValue);
    newDate.setHours(hours || 0, minutes || 0, 0, 0);
    
    const formatted = format(newDate, "yyyy-MM-dd'T'HH:mm");
    onChange(formatted);
  };

  return (
    <div className="space-y-2">
      {label && (
        <Label htmlFor={id} className={cn(required && "after:content-['*'] after:ml-0.5 after:text-destructive")}>
          {label}
        </Label>
      )}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !isValidDate && "text-muted-foreground",
              disabled && "cursor-not-allowed opacity-50"
            )}
            disabled={disabled}
            type="button"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {displayValue || <span className="text-muted-foreground">Chọn ngày và giờ</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className="w-auto max-w-[90vw] p-0 z-[101]" 
          align="start"
          sideOffset={4}
        >
          <div className="p-3 space-y-4 overflow-hidden">
            {/* Calendar */}
            <Calendar
              mode="single"
              selected={isValidDate ? dateValue : undefined}
              onSelect={handleDateSelect}
              initialFocus
            />
            
            {/* Time Input - Custom 24h format */}
            <div className="space-y-2 border-t pt-4">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Giờ (24h format)
              </Label>
              <div className="flex items-center gap-2">
                <Select
                  value={timeStr.split(":")[0] || "00"}
                  onValueChange={(hour) => {
                    const [_, minutes] = timeStr.split(":");
                    handleTimeChange(`${hour.padStart(2, "0")}:${minutes || "00"}`);
                  }}
                >
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px] z-[102]">
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i).padStart(2, "0")}>
                        {String(i).padStart(2, "0")}h
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-lg font-bold">:</span>
                <Select
                  value={timeStr.split(":")[1] || "00"}
                  onValueChange={(minute) => {
                    const [hours] = timeStr.split(":");
                    handleTimeChange(`${hours || "00"}:${minute.padStart(2, "0")}`);
                  }}
                >
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px] z-[102]">
                    {Array.from({ length: 60 }, (_, i) => (
                      <SelectItem key={i} value={String(i).padStart(2, "0")}>
                        {String(i).padStart(2, "0")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Định dạng 24 giờ: 00h - 23h (ví dụ: 14:30 = 2:30 chiều)
              </p>
            </div>
            
            {/* Quick Actions */}
            <div className="flex gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  const now = new Date();
                  const formatted = format(now, "yyyy-MM-dd'T'HH:mm");
                  onChange(formatted);
                }}
              >
                Bây giờ
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setIsOpen(false)}
              >
                Xong
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default DateTimePicker;
