"use client";

import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { fetchSubmissions, submitAIGrading } from "@/lib/queries";
import type { Submission } from "@/lib/queries";
import { cn } from "@/lib/utils";

const mockSubmissions: Submission[] = [
  {
    id: "sub-1",
    student_name: "张明远",
    student_avatar: "ZM",
    assignment_title: "微积分第三章作业",
    submitted_at: "2026-04-06T08:30:00Z",
    status: "pending",
  },
  {
    id: "sub-2",
    student_name: "李思琪",
    student_avatar: "LS",
    assignment_title: "线性代数期中试卷",
    submitted_at: "2026-04-06T07:15:00Z",
    status: "pending",
  },
  {
    id: "sub-3",
    student_name: "王浩然",
    student_avatar: "WH",
    assignment_title: "概率论课堂练习",
    submitted_at: "2026-04-05T22:45:00Z",
    status: "ai_graded",
    score: 85,
  },
  {
    id: "sub-4",
    student_name: "陈雨涵",
    student_avatar: "CY",
    assignment_title: "微积分第三章作业",
    submitted_at: "2026-04-05T20:30:00Z",
    status: "ai_graded",
    score: 72,
  },
  {
    id: "sub-5",
    student_name: "赵子轩",
    student_avatar: "ZZ",
    assignment_title: "数列与级数习题",
    submitted_at: "2026-04-05T18:00:00Z",
    status: "pending",
  },
  {
    id: "sub-6",
    student_name: "刘诗涵",
    student_avatar: "LS",
    assignment_title: "微积分第三章作业",
    submitted_at: "2026-04-05T16:20:00Z",
    status: "teacher_graded",
    score: 91,
  },
  {
    id: "sub-7",
    student_name: "孙博文",
    student_avatar: "SB",
    assignment_title: "线性代数期中试卷",
    submitted_at: "2026-04-05T14:10:00Z",
    status: "pending",
  },
];

const statusConfig: Record<string, { label: string; cls: string; icon: string }> = {
  pending: {
    label: "待批改",
    cls: "bg-ink-warning-light text-ink-warning",
    icon: "ri-time-line",
  },
  submitted: {
    label: "已提交",
    cls: "bg-ink-warning-light text-ink-warning",
    icon: "ri-time-line",
  },
  graded: {
    label: "已批改",
    cls: "bg-ink-success-light text-ink-success",
    icon: "ri-checkbox-circle-line",
  },
  ai_graded: {
    label: "AI 已批",
    cls: "bg-ink-success-light text-ink-success",
    icon: "ri-robot-2-line",
  },
  teacher_graded: {
    label: "已批改",
    cls: "bg-ink-primary-lighter text-ink-primary",
    icon: "ri-checkbox-circle-line",
  },
};
const defaultStatus = { label: "未知", cls: "bg-ink-surface text-ink-text-light", icon: "ri-question-line" };

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffH = Math.floor(
    (now.getTime() - d.getTime()) / (1000 * 60 * 60),
  );
  if (diffH < 1) return "刚刚";
  if (diffH < 24) return `${diffH} 小时前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

const rowVariant = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 400, damping: 30 },
  },
};

export default function GradingQueuePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: submissions } = useQuery({
    queryKey: ["submissions"],
    queryFn: () => fetchSubmissions(),
  });

  const gradeMutation = useMutation({
    mutationFn: (ids: string[]) => submitAIGrading(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
    },
  });

  const list = submissions ?? [];
  const pendingCount = list.filter((s) => s.status === "pending").length;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-heading font-bold text-ink-text">
            批改队列
          </h1>
          <p className="mt-1 text-sm text-ink-text-muted">
            {pendingCount} 份作业等待批改
          </p>
        </div>
        <button
          onClick={() => {
            const pendingIds = list.filter((s) => s.status === "pending").map((s) => s.id);
            if (pendingIds.length > 0) gradeMutation.mutate(pendingIds);
          }}
          disabled={gradeMutation.isPending || pendingCount === 0}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink-primary px-4 text-sm font-medium text-white transition-colors hover:bg-ink-primary-dark disabled:opacity-50 self-start sm:self-auto"
        >
          {gradeMutation.isPending ? (
            <>
              <i className="ri-loader-4-line animate-spin" />
              批改中...
            </>
          ) : (
            <>
              <i className="ri-robot-2-line" />
              AI 全部批改
            </>
          )}
        </button>
      </div>

      {/* Submissions List */}
      <div className="rounded-xl border border-ink-border bg-white overflow-hidden">
        <motion.div variants={stagger} className="divide-y divide-ink-border">
          {list.map((sub) => {
            const status = statusConfig[sub.status] || defaultStatus;
            return (
              <motion.div
                key={sub.id}
                variants={rowVariant}
                className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4 cursor-pointer transition-colors hover:bg-ink-surface/50"
                onClick={() => router.push(`/teacher/grading/${sub.id}`)}
              >
                {/* File icon */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-surface">
                  <i className="ri-file-text-line text-ink-text-light" />
                </div>

                {/* Student + Assignment */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-primary-lighter text-[10px] font-bold text-ink-primary">
                      {sub.student_avatar}
                    </div>
                    <span className="text-sm font-medium text-ink-text truncate">
                      {sub.student_name}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-text-muted truncate">
                    {sub.assignment_title}
                  </p>
                </div>

                {/* Time - hidden on mobile */}
                <span className="hidden sm:inline shrink-0 text-xs text-ink-text-light">
                  {formatTime(sub.submitted_at)}
                </span>

                {/* Score (if graded) */}
                {sub.score !== undefined && (
                  <span className="shrink-0 text-sm font-heading font-bold text-ink-primary">
                    {sub.score}
                  </span>
                )}

                {/* Status badge */}
                <span
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    status.cls,
                  )}
                >
                  <i className={cn(status.icon, "text-[10px]")} />
                  {status.label}
                </span>

                <i className="ri-arrow-right-s-line text-ink-text-light shrink-0" />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </motion.div>
  );
}
