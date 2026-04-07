"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Annotation } from "@/lib/queries";

interface AnnotationViewerProps {
  content: string;
  annotations: Annotation[];
  score: number;
}

const severityConfig = {
  error: {
    icon: "ri-error-warning-line",
    color: "text-ink-error",
    bg: "bg-ink-error-light",
    border: "border-l-ink-error",
    label: "错误",
    badgeCls: "bg-ink-error-light text-ink-error",
  },
  warning: {
    icon: "ri-alert-line",
    color: "text-ink-warning",
    bg: "bg-ink-warning-light",
    border: "border-l-ink-warning",
    label: "警告",
    badgeCls: "bg-ink-warning-light text-ink-warning",
  },
  info: {
    icon: "ri-information-line",
    color: "text-ink-primary",
    bg: "bg-ink-primary-lighter",
    border: "border-l-ink-primary",
    label: "建议",
    badgeCls: "bg-ink-primary-lighter text-ink-primary",
  },
};

function getScoreColor(score: number): string {
  if (score >= 90) return "text-ink-success";
  if (score >= 70) return "text-ink-primary";
  if (score >= 60) return "text-ink-warning";
  return "text-ink-error";
}

export default function AnnotationViewer({
  content,
  annotations,
  score,
}: AnnotationViewerProps) {
  const lines = content.split("\n");
  const errorLineSet = new Set<number>();
  annotations.forEach((a) => {
    for (let i = a.line_start; i <= a.line_end; i++) {
      errorLineSet.add(i);
    }
  });

  // Group annotations by their starting line for inline display
  const annotationsByLine = new Map<number, Annotation[]>();
  annotations.forEach((a) => {
    const existing = annotationsByLine.get(a.line_end) || [];
    existing.push(a);
    annotationsByLine.set(a.line_end, existing);
  });

  return (
    <div className="space-y-6">
      {/* Score display */}
      <div className="flex items-center gap-4">
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              "text-5xl font-heading font-bold",
              getScoreColor(score),
            )}
          >
            {score}
          </span>
          <span className="text-lg text-ink-text-muted font-heading">/100</span>
        </div>
        <div className="flex-1">
          <div className="h-2 rounded-full bg-ink-surface overflow-hidden">
            <motion.div
              className={cn(
                "h-full rounded-full",
                score >= 90
                  ? "bg-ink-success"
                  : score >= 70
                    ? "bg-ink-primary"
                    : score >= 60
                      ? "bg-ink-warning"
                      : "bg-ink-error",
              )}
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>

      {/* Code viewer with line numbers */}
      <div className="rounded-xl border border-ink-border bg-ink-surface overflow-x-auto">
        <pre className="text-xs leading-6">
          {lines.map((line, idx) => {
            const lineNum = idx + 1;
            const isError = errorLineSet.has(lineNum);
            const lineAnnotations = annotationsByLine.get(lineNum);

            return (
              <div key={lineNum}>
                <div
                  className={cn(
                    "flex",
                    isError &&
                      "bg-ink-error-light/50 border-l-[3px] border-l-[#DC2626]",
                  )}
                >
                  <span className="w-10 shrink-0 select-none px-2 text-right text-ink-text-light font-mono">
                    {lineNum}
                  </span>
                  <span
                    className={cn(
                      "flex-1 px-3 font-mono whitespace-pre",
                      isError ? "text-ink-text" : "text-ink-text",
                    )}
                  >
                    {line || " "}
                  </span>
                </div>

                {/* Annotation cards after error block ends */}
                {lineAnnotations && lineAnnotations.length > 0 && (
                  <div className="px-12 py-2 space-y-2 bg-white border-b border-ink-border">
                    {lineAnnotations.map((a, ai) => {
                      const config = severityConfig[a.severity] || severityConfig.info;
                      return (
                        <motion.div
                          key={a.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: ai * 0.1, type: "spring", stiffness: 400, damping: 30 }}
                          className={cn(
                            "rounded-lg border border-ink-border p-3 border-l-[3px]",
                            config.border,
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <i className={cn(config.icon, config.color, "text-sm")} />
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                config.badgeCls,
                              )}
                            >
                              {config.label}
                            </span>
                            <span className="text-[10px] text-ink-text-light">
                              L{a.line_start}
                              {a.line_end !== a.line_start && `-L${a.line_end}`}
                            </span>
                          </div>
                          <p className="text-sm text-ink-text">{a.comment}</p>
                          {a.correction && (
                            <div className="mt-2 rounded-md bg-ink-success-light p-2">
                              <p className="text-xs font-medium text-ink-success">
                                <i className="ri-arrow-right-s-fill mr-1" />
                                修正建议
                              </p>
                              <p className="mt-1 text-xs text-ink-text font-mono whitespace-pre-wrap">
                                {a.correction}
                              </p>
                            </div>
                          )}
                          {a.knowledge_point && (
                            <span className="mt-2 inline-flex items-center rounded-full bg-ink-primary-lighter px-2 py-0.5 text-[10px] font-medium text-ink-primary">
                              <i className="ri-lightbulb-line mr-1" />
                              {a.knowledge_point}
                            </span>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}
