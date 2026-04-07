"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { GradingDetail, Annotation } from "@/lib/queries";

interface GradingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: GradingDetail | null;
}

const severityConfig: Record<string, { icon: string; color: string; bg: string; border: string; label: string }> = {
  error: {
    icon: "ri-close-circle-fill",
    color: "text-ink-error",
    bg: "bg-ink-error-light",
    border: "border-l-ink-error",
    label: "错误",
  },
  warning: {
    icon: "ri-alert-fill",
    color: "text-ink-warning",
    bg: "bg-ink-warning-light",
    border: "border-l-ink-warning",
    label: "警告",
  },
  info: {
    icon: "ri-information-fill",
    color: "text-ink-primary",
    bg: "bg-ink-primary-lighter",
    border: "border-l-ink-primary",
    label: "建议",
  },
};

const defaultSeverity = { icon: "ri-information-line", color: "text-ink-text-light", bg: "bg-ink-surface", border: "border-l-ink-border", label: "批注" };

function AnnotationCard({ annotation }: { annotation: Annotation }) {
  const config = severityConfig[annotation.severity] || defaultSeverity;

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "rounded-lg border border-ink-border p-3",
        "border-l-[3px]",
        config.border,
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <i className={cn(config.icon, config.color, "text-sm")} />
        <span className={cn("text-xs font-semibold", config.color)}>
          {config.label}
        </span>
        <span className="text-xs text-ink-text-light">
          L{annotation.line_start}
          {annotation.line_end !== annotation.line_start &&
            `-L${annotation.line_end}`}
        </span>
        {annotation.knowledge_point && (
          <span className="ml-auto inline-flex items-center rounded-full bg-ink-primary-lighter px-2 py-0.5 text-[10px] font-medium text-ink-primary">
            {annotation.knowledge_point}
          </span>
        )}
      </div>
      <p className="text-sm text-ink-text">{annotation.comment}</p>
      {annotation.correction && (
        <div className="mt-2 rounded-md bg-ink-success-light p-2">
          <p className="text-xs font-medium text-ink-success">
            <i className="ri-arrow-right-s-fill mr-1" />
            修正建议
          </p>
          <p className="mt-1 text-xs text-ink-text font-mono whitespace-pre-wrap">
            {annotation.correction}
          </p>
        </div>
      )}
    </motion.div>
  );
}

function CodeViewer({
  content,
  annotations,
}: {
  content: string;
  annotations: Annotation[];
}) {
  const lines = content.split("\n");
  const errorLines = new Set<number>();
  annotations.forEach((a) => {
    for (let i = a.line_start; i <= a.line_end; i++) {
      errorLines.add(i);
    }
  });

  return (
    <div className="rounded-lg border border-ink-border bg-ink-surface overflow-x-auto">
      <pre className="text-xs leading-6">
        {lines.map((line, idx) => {
          const lineNum = idx + 1;
          const isError = errorLines.has(lineNum);
          return (
            <div
              key={lineNum}
              className={cn(
                "flex",
                isError && "bg-ink-error-light border-l-[3px] border-l-ink-error",
              )}
            >
              <span className="w-10 shrink-0 select-none px-2 text-right text-ink-text-light font-mono">
                {lineNum}
              </span>
              <span className="flex-1 px-3 font-mono text-ink-text whitespace-pre">
                {line || " "}
              </span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

export default function GradingDrawer({
  open,
  onOpenChange,
  detail,
}: GradingDrawerProps) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  if (!detail) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => onOpenChange(false)}
          />
          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-y-0 right-0 z-50 w-full md:w-[70vw] bg-white shadow-2xl overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-border bg-white px-5 py-4">
              <div>
                <h2 className="text-lg font-heading font-semibold text-ink-text">
                  {detail.assignment_title || "批改详情"}
                </h2>
                <p className="text-sm text-ink-text-muted">
                  {detail.student_name} 的提交
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 rounded-lg bg-ink-primary-lighter px-3 py-1.5">
                  <i className="ri-star-fill text-ink-primary text-sm" />
                  <span className="text-lg font-heading font-bold text-ink-primary">
                    {detail.score}
                  </span>
                  <span className="text-xs text-ink-text-muted">/100</span>
                </div>
                <button
                  onClick={() => onOpenChange(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-text-light hover:bg-ink-surface hover:text-ink-text transition-colors"
                >
                  <i className="ri-close-line text-lg" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="space-y-6 p-5">
              {/* Original text */}
              <div>
                <h3 className="mb-3 text-sm font-heading font-semibold text-ink-text">
                  <i className="ri-file-text-line mr-1.5 text-ink-primary" />
                  原文
                </h3>
                <CodeViewer
                  content={detail.content}
                  annotations={detail.annotations}
                />
              </div>

              {/* Annotations */}
              {detail.annotations.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-heading font-semibold text-ink-text">
                    <i className="ri-markup-line mr-1.5 text-ink-primary" />
                    批注 ({detail.annotations.length})
                  </h3>
                  <div className="space-y-3">
                    {detail.annotations.map((a) => (
                      <AnnotationCard key={a.id} annotation={a} />
                    ))}
                  </div>
                </div>
              )}

              {/* Teacher action: confirm grading */}
              <div className="pt-2">
                <button
                  onClick={() => onOpenChange(false)}
                  className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-ink-primary text-sm font-medium text-white transition-colors hover:bg-ink-primary-dark"
                >
                  <i className="ri-checkbox-circle-line" />
                  确认批改结果
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
