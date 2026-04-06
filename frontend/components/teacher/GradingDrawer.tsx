"use client";

import { motion } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GradingDetail, Annotation } from "@/lib/queries";

interface GradingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: GradingDetail | null;
}

const severityConfig = {
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

function AnnotationCard({ annotation }: { annotation: Annotation }) {
  const config = severityConfig[annotation.severity];

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
        <span className="ml-auto inline-flex items-center rounded-full bg-ink-primary-lighter px-2 py-0.5 text-[10px] font-medium text-ink-primary">
          {annotation.knowledge_point}
        </span>
      </div>
      <p className="text-sm text-ink-text">{annotation.comment}</p>
      {annotation.correction && (
        <div className="mt-2 rounded-md bg-ink-success-light p-2">
          <p className="text-xs font-medium text-ink-success">
            <i className="ri-arrow-right-s-fill mr-1" />
            修正建议
          </p>
          <p className="mt-1 text-xs text-ink-text font-mono">
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
  if (!detail) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[70vw] sm:max-w-none overflow-y-auto"
        showCloseButton={true}
      >
        <SheetHeader className="border-b border-ink-border pb-4">
          <div className="flex items-center justify-between pr-8">
            <div>
              <SheetTitle className="text-lg">
                {detail.assignment_title}
              </SheetTitle>
              <SheetDescription>
                {detail.student_name} 的提交
              </SheetDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-lg bg-ink-primary-lighter px-3 py-1.5">
                <i className="ri-star-fill text-ink-primary text-sm" />
                <span className="text-lg font-heading font-bold text-ink-primary">
                  {detail.score}
                </span>
                <span className="text-xs text-ink-text-muted">/100</span>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-6 p-4">
          {/* Original text with line numbers */}
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

          {/* CTA */}
          <div className="pt-2">
            <Button className="w-full bg-ink-primary hover:bg-ink-primary-dark text-white h-10">
              <i className="ri-pencil-ruler-2-line mr-2" />
              开始针对练习
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
