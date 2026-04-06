"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PracticeCardProps {
  question: string;
  options: { key: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  onSubmit: (answer: string) => void;
  current: number;
  total: number;
}

export default function PracticeCard({
  question,
  options,
  correctAnswer,
  explanation,
  onSubmit,
  current,
  total,
}: PracticeCardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!selected) return;
    setSubmitted(true);
    onSubmit(selected);
  };

  const isCorrect = submitted && selected === correctAnswer;
  const isWrong = submitted && selected !== correctAnswer;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="rounded-xl border border-ink-border bg-white p-6"
    >
      {/* Question */}
      <div className="mb-5">
        <span className="inline-flex items-center rounded-full bg-ink-primary-lighter px-2.5 py-0.5 text-[10px] font-semibold text-ink-primary mb-3">
          {current}/{total}
        </span>
        <p className="text-base font-medium text-ink-text leading-relaxed">
          {question}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-2.5 mb-6">
        {options.map((opt) => {
          const isThis = selected === opt.key;
          const showCorrect = submitted && opt.key === correctAnswer;
          const showWrong = submitted && isThis && opt.key !== correctAnswer;

          return (
            <button
              key={opt.key}
              onClick={() => {
                if (!submitted) setSelected(opt.key);
              }}
              disabled={submitted}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all",
                !submitted && isThis
                  ? "border-ink-primary bg-ink-primary-lighter text-ink-primary"
                  : !submitted
                    ? "border-ink-border bg-white text-ink-text hover:border-ink-primary/30 hover:bg-ink-surface"
                    : showCorrect
                      ? "border-ink-success bg-ink-success-light text-ink-success"
                      : showWrong
                        ? "border-ink-error bg-ink-error-light text-ink-error"
                        : "border-ink-border bg-white text-ink-text-muted",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                  !submitted && isThis
                    ? "border-ink-primary bg-ink-primary text-white"
                    : !submitted
                      ? "border-ink-border text-ink-text-light"
                      : showCorrect
                        ? "border-ink-success bg-ink-success text-white"
                        : showWrong
                          ? "border-ink-error bg-ink-error text-white"
                          : "border-ink-border text-ink-text-light",
                )}
              >
                {opt.key}
              </span>
              <span className="flex-1">{opt.text}</span>
              {submitted && showCorrect && (
                <i className="ri-checkbox-circle-fill text-ink-success" />
              )}
              {submitted && showWrong && (
                <i className="ri-close-circle-fill text-ink-error" />
              )}
            </button>
          );
        })}
      </div>

      {/* Submit or Feedback */}
      <AnimatePresence mode="wait">
        {!submitted ? (
          <motion.div key="submit" exit={{ opacity: 0 }}>
            <Button
              onClick={handleSubmit}
              disabled={!selected}
              className="w-full bg-ink-primary hover:bg-ink-primary-dark text-white h-10"
            >
              <i className="ri-check-line mr-2" />
              提交答案
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="feedback"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "rounded-lg p-4",
              isCorrect ? "bg-ink-success-light" : "bg-ink-error-light",
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <i
                className={cn(
                  "text-lg",
                  isCorrect
                    ? "ri-checkbox-circle-fill text-ink-success"
                    : "ri-close-circle-fill text-ink-error",
                )}
              />
              <span
                className={cn(
                  "text-sm font-semibold",
                  isCorrect ? "text-ink-success" : "text-ink-error",
                )}
              >
                {isCorrect ? "回答正确！" : "回答错误"}
              </span>
            </div>
            <p className="text-sm text-ink-text leading-relaxed">
              {explanation}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      <div className="mt-5">
        <div className="h-1.5 w-full rounded-full bg-ink-surface overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-ink-primary"
            initial={{ width: 0 }}
            animate={{ width: `${(current / total) * 100}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </div>
      </div>
    </motion.div>
  );
}
