"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: "primary" | "success" | "warning" | "error";
  suffix?: string;
  trend?: {
    direction: "up" | "down" | "flat";
    label: string;
  };
  extra?: React.ReactNode;
  sparkline?: number[];
}

const colorMap = {
  primary: {
    bg: "bg-ink-primary-lighter",
    text: "text-ink-primary",
    accent: "bg-ink-primary",
  },
  success: {
    bg: "bg-ink-success-light",
    text: "text-ink-success",
    accent: "bg-ink-success",
  },
  warning: {
    bg: "bg-ink-warning-light",
    text: "text-ink-warning",
    accent: "bg-ink-warning",
  },
  error: {
    bg: "bg-ink-error-light",
    text: "text-ink-error",
    accent: "bg-ink-error",
  },
};

function MiniSparkline({
  data,
  color,
}: {
  data: number[];
  color: string;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  return (
    <div className="flex items-end gap-[2px] h-6">
      {data.map((v, i) => {
        const height = ((v - min) / range) * 100;
        return (
          <div
            key={i}
            className={cn("w-1 rounded-full opacity-60", color)}
            style={{ height: `${Math.max(height, 10)}%` }}
          />
        );
      })}
    </div>
  );
}

export default function StatCard({
  title,
  value,
  icon,
  color,
  suffix,
  trend,
  extra,
  sparkline,
}: StatCardProps) {
  const c = colorMap[color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="rounded-xl border border-ink-border bg-white p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-ink-text-muted">{title}</p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className={cn("text-2xl font-heading font-bold", c.text)}>
              {value}
            </span>
            {suffix && (
              <span className="text-sm font-medium text-ink-text-muted">
                {suffix}
              </span>
            )}
          </div>
          {trend && (
            <div className="mt-1.5 flex items-center gap-1">
              <i
                className={cn(
                  "text-xs",
                  trend.direction === "up" && "ri-arrow-up-s-fill text-ink-success",
                  trend.direction === "down" && "ri-arrow-down-s-fill text-ink-error",
                  trend.direction === "flat" && "ri-subtract-line text-ink-text-light",
                )}
              />
              <span className="text-xs text-ink-text-light">{trend.label}</span>
            </div>
          )}
          {extra}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              c.bg,
            )}
          >
            <i className={cn(icon, "text-xl", c.text)} />
          </div>
          {sparkline && sparkline.length > 0 && (
            <MiniSparkline data={sparkline} color={c.accent} />
          )}
        </div>
      </div>
    </motion.div>
  );
}
