import React from "react";
import { Calendar as CalendarIcon, Check } from "lucide-react";

export type CompositePeriod = "01_10" | "11_20" | "21_END";

interface CompositeCalendarProps {
  year: number;
  month: number; // 1 - 12
  selectedPeriod: CompositePeriod;
  onSelectPeriod: (period: CompositePeriod) => void;
  disabled?: boolean;
}

export const CompositeCalendar: React.FC<CompositeCalendarProps> = ({
  year,
  month,
  selectedPeriod,
  onSelectPeriod,
  disabled = false,
}) => {
  // Determine days in month (handling leap years)
  const daysInMonth = new Date(year, month, 0).getDate();

  const getPeriodForDay = (day: number): CompositePeriod => {
    if (day <= 10) return "01_10";
    if (day <= 20) return "11_20";
    return "21_END";
  };

  const periodLabels: Record<CompositePeriod, string> = {
    "01_10": "Days 01 – 10 (Early Month)",
    "11_20": "Days 11 – 20 (Mid Month)",
    "21_END": `Days 21 – ${daysInMonth} (End Month)`,
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-[var(--surface-1)] p-3 text-xs shadow-inner">
      <div className="flex items-center justify-between border-b border-border/50 pb-2">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <CalendarIcon className="h-4 w-4 text-primary" />
          <span>Composite Period Selector</span>
        </div>
        <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
          {periodLabels[selectedPeriod]}
        </span>
      </div>

      {/* 31 Calendar Grid with 3 Color Blocks */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const p = getPeriodForDay(day);
          const isSelected = selectedPeriod === p;

          let blockStyle = "bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 border-sky-500/20";
          let activeBlockStyle = "bg-sky-600 text-white font-bold border-sky-600 shadow-md scale-105";

          if (p === "11_20") {
            blockStyle = "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20";
            activeBlockStyle = "bg-amber-600 text-white font-bold border-amber-600 shadow-md scale-105";
          } else if (p === "21_END") {
            blockStyle = "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20";
            activeBlockStyle = "bg-emerald-600 text-white font-bold border-emerald-600 shadow-md scale-105";
          }

          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => onSelectPeriod(p)}
              className={`flex h-7 items-center justify-center rounded border font-mono transition-all cursor-pointer ${
                isSelected ? activeBlockStyle : blockStyle
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={`Click to select ${periodLabels[p]}`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* 3 Block Legend */}
      <div className="grid grid-cols-3 gap-1 pt-1 text-[10px]">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelectPeriod("01_10")}
          className={`flex items-center justify-center gap-1 rounded py-1 border transition ${
            selectedPeriod === "01_10"
              ? "border-sky-500 bg-sky-500/20 font-bold text-sky-600"
              : "border-border bg-[var(--surface-0)] text-muted-foreground hover:bg-sky-500/10"
          }`}
        >
          {selectedPeriod === "01_10" && <Check className="h-3 w-3" />}
          <span>1 – 10</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelectPeriod("11_20")}
          className={`flex items-center justify-center gap-1 rounded py-1 border transition ${
            selectedPeriod === "11_20"
              ? "border-amber-500 bg-amber-500/20 font-bold text-amber-600"
              : "border-border bg-[var(--surface-0)] text-muted-foreground hover:bg-amber-500/10"
          }`}
        >
          {selectedPeriod === "11_20" && <Check className="h-3 w-3" />}
          <span>11 – 20</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelectPeriod("21_END")}
          className={`flex items-center justify-center gap-1 rounded py-1 border transition ${
            selectedPeriod === "21_END"
              ? "border-emerald-500 bg-emerald-500/20 font-bold text-emerald-600"
              : "border-border bg-[var(--surface-0)] text-muted-foreground hover:bg-emerald-500/10"
          }`}
        >
          {selectedPeriod === "21_END" && <Check className="h-3 w-3" />}
          <span>21 – {daysInMonth}</span>
        </button>
      </div>
    </div>
  );
};
