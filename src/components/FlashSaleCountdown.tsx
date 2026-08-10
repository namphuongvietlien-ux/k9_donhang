import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

interface FlashSaleCountdownProps {
  startsAt?: string; // Optional: thời gian bắt đầu
  endsAt: string; // Thời gian kết thúc
  className?: string;
}

type CountdownState = "upcoming" | "active" | "ended";

const FlashSaleCountdown = ({ startsAt, endsAt, className = "" }: FlashSaleCountdownProps) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    state: "ended" as CountdownState,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const startDate = startsAt ? new Date(startsAt) : null;
      const endDate = new Date(endsAt);

      // Validate dates
      if (isNaN(endDate.getTime())) {
        return {
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          state: "ended" as CountdownState,
        };
      }

      // Determine current state
      let targetDate: Date;
      let state: CountdownState;

      if (startDate && !isNaN(startDate.getTime())) {
        const startTime = startDate.getTime();
        const endTime = endDate.getTime();

        if (now < startTime) {
          // Flash sale chưa bắt đầu - đếm ngược đến starts_at
          targetDate = startDate;
          state = "upcoming";
        } else if (now >= startTime && now < endTime) {
          // Flash sale đang diễn ra - đếm ngược đến ends_at
          targetDate = endDate;
          state = "active";
        } else {
          // Flash sale đã kết thúc
          return {
            days: 0,
            hours: 0,
            minutes: 0,
            seconds: 0,
            state: "ended" as CountdownState,
          };
        }
      } else {
        // Không có starts_at, chỉ đếm ngược đến ends_at
        const endTime = endDate.getTime();
        if (now >= endTime) {
          return {
            days: 0,
            hours: 0,
            minutes: 0,
            seconds: 0,
            state: "ended" as CountdownState,
          };
        }
        targetDate = endDate;
        state = "active";
      }

      const difference = targetDate.getTime() - now;

      if (difference <= 0) {
        return {
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          state: "ended" as CountdownState,
        };
      }

      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((difference % (1000 * 60)) / 1000),
        state,
      };
    };

    setTimeLeft(calculateTimeLeft());
  }, [startsAt, endsAt]);

  if (timeLeft.state === "ended") {
    return (
      <div className={`flex items-center gap-2 text-destructive ${className}`}>
        <Clock className="w-4 h-4" />
        <span className="text-sm font-medium">Đã kết thúc</span>
      </div>
    );
  }

  const label = timeLeft.state === "upcoming" ? "Bắt đầu sau" : "Kết thúc sau";
  const bgColor = timeLeft.state === "upcoming" ? "bg-orange-500" : "bg-primary";
  const textColor = timeLeft.state === "upcoming" ? "text-orange-50" : "text-primary-foreground";

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Clock className={`w-4 h-4 ${timeLeft.state === "upcoming" ? "text-orange-500" : "text-primary"}`} />
        <span className="text-sm font-medium text-muted-foreground">{label}:</span>
      </div>
      <div className="flex items-center gap-1 text-sm">
        {timeLeft.days > 0 && (
          <>
            <span className={`${bgColor} ${textColor} px-2 py-1 rounded font-mono font-bold`}>
              {String(timeLeft.days).padStart(2, "0")}
            </span>
            <span className="text-muted-foreground">:</span>
          </>
        )}
        <span className={`${bgColor} ${textColor} px-2 py-1 rounded font-mono font-bold`}>
          {String(timeLeft.hours).padStart(2, "0")}
        </span>
        <span className="text-muted-foreground">:</span>
        <span className={`${bgColor} ${textColor} px-2 py-1 rounded font-mono font-bold`}>
          {String(timeLeft.minutes).padStart(2, "0")}
        </span>
        <span className="text-muted-foreground">:</span>
        <span className={`${bgColor} ${textColor} px-2 py-1 rounded font-mono font-bold`}>
          {String(timeLeft.seconds).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
};

export default FlashSaleCountdown;

