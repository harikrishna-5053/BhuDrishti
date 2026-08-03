import React, { useState, useRef, useEffect } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check } from "lucide-react";

interface DaywiseCalendarPickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  disabled?: boolean;
  minDate?: string; // Default: 2023-01-01
  maxDate?: string; // Default: today
}

export const DaywiseCalendarPicker: React.FC<DaywiseCalendarPickerProps> = ({
  value,
  onChange,
  disabled = false,
  minDate = "2023-01-01",
  maxDate = new Date().toISOString().split("T")[0],
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse current selected date or fallback to today
  const selectedDate = value ? new Date(value + "T00:00:00") : new Date();
  
  const [viewYear, setViewYear] = useState<number>(
    isNaN(selectedDate.getFullYear()) ? new Date().getFullYear() : selectedDate.getFullYear()
  );
  const [viewMonth, setViewMonth] = useState<number>(
    isNaN(selectedDate.getMonth()) ? new Date().getMonth() : selectedDate.getMonth()
  );

  useEffect(() => {
    if (value) {
      const d = new Date(value + "T00:00:00");
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value]);

  // Close calendar popup on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();

  const minD = new Date(minDate + "T00:00:00");
  const maxD = new Date(maxDate + "T23:59:59");

  // Number of days in view month
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // First day offset (0 = Sunday, 1 = Monday...)
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      if (viewYear > 2023) {
        setViewYear(viewYear - 1);
        setViewMonth(11);
      }
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      if (viewYear < currentYear) {
        setViewYear(viewYear + 1);
        setViewMonth(0);
      }
    } else {
      if (viewYear < currentYear || (viewYear === currentYear && viewMonth < currentMonth)) {
        setViewMonth(viewMonth + 1);
      }
    }
  };

  const handleSelectDay = (day: number) => {
    const mStr = String(viewMonth + 1).padStart(2, "0");
    const dStr = String(day).padStart(2, "0");
    const formatted = `${viewYear}-${mStr}-${dStr}`;
    onChange(formatted);
    setIsOpen(false);
  };

  const isDayDisabled = (day: number): boolean => {
    const d = new Date(viewYear, viewMonth, day);
    return d < minD || d > maxD;
  };

  const isDaySelected = (day: number): boolean => {
    if (!value) return false;
    const parts = value.split("-");
    if (parts.length !== 3) return false;
    return (
      parseInt(parts[0], 10) === viewYear &&
      parseInt(parts[1], 10) === viewMonth + 1 &&
      parseInt(parts[2], 10) === day
    );
  };

  const triggerNativePicker = () => {
    if (dateInputRef.current && typeof dateInputRef.current.showPicker === "function") {
      try {
        dateInputRef.current.showPicker();
      } catch {
        setIsOpen(!isOpen);
      }
    } else {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Date Input with Embedded Calendar Button */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            ref={dateInputRef}
            type="date"
            value={value}
            min={minDate}
            max={maxDate}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-[var(--surface-1)] pl-2.5 pr-8 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50 font-mono cursor-pointer"
          />
        </div>

        {/* Dedicated Interactive Calendar Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={triggerNativePicker}
          title="Open interactive date picker calendar"
          aria-label="Open interactive date picker calendar"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-[var(--surface-1)] text-primary hover:bg-primary/10 hover:border-primary/40 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <CalendarIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Interactive Calendar Popover Grid */}
      {isOpen && !disabled && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-border bg-[var(--surface-0)] p-3 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 font-mono">
          {/* Header Month / Year Navigation */}
          <div className="mb-2.5 flex items-center justify-between border-b border-border pb-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={viewYear <= 2023 && viewMonth === 0}
              className="grid h-6 w-6 place-items-center rounded border border-border bg-[var(--surface-1)] text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-center gap-1 text-xs font-bold text-foreground">
              <span>{monthNames[viewMonth]}</span>
              <span>{viewYear}</span>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              disabled={viewYear >= currentYear && viewMonth >= currentMonth}
              className="grid h-6 w-6 place-items-center rounded border border-border bg-[var(--surface-1)] text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground mb-1">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-xs">
            {/* Empty slots for month start offset */}
            {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
              <div key={`empty-${idx}`} />
            ))}

            {/* Days of Month */}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const disabledDay = isDayDisabled(day);
              const selected = isDaySelected(day);

              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabledDay}
                  onClick={() => handleSelectDay(day)}
                  className={`flex h-7 w-7 items-center justify-center rounded font-mono text-[11px] transition cursor-pointer ${
                    selected
                      ? "bg-primary text-primary-foreground font-bold shadow-sm scale-105"
                      : "hover:bg-[var(--surface-2)] text-foreground border border-transparent"
                  } disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
                  title={
                    disabledDay
                      ? "Date out of range (2023 - Today)"
                      : `Select ${monthNames[viewMonth]} ${day}, ${viewYear}`
                  }
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Quick Select Today Footer */}
          <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2 text-[10px]">
            <span className="text-muted-foreground">Valid: 2023 – Today</span>
            <button
              type="button"
              onClick={() => {
                onChange(maxDate);
                setIsOpen(false);
              }}
              className="rounded bg-primary/10 px-2 py-0.5 font-bold text-primary hover:bg-primary/20 transition cursor-pointer"
            >
              Select Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
