"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

/* ── Types ── */

interface StudentAssignment {
  id: string;
  title: string;
  course_name: string;
  course_icon: string;
  due_date: string;
  status: "pending" | "submitted" | "graded" | "overdue";
  score?: number;
}

/* ── Mock data ── */

const mockAssignments: StudentAssignment[] = [
  {
    id: "asgn-1",
    title: "微积分第三章作业 - 导数与微分",
    course_name: "高等数学 A",
    course_icon: "ri-function-add-line",
    due_date: "2026-04-10T23:59:00Z",
    status: "pending",
  },
  {
    id: "asgn-2",
    title: "电磁感应综合练习",
    course_name: "大学物理 II",
    course_icon: "ri-flashlight-line",
    due_date: "2026-04-08T23:59:00Z",
    status: "pending",
  },
  {
    id: "asgn-3",
    title: "二叉树遍历与应用",
    course_name: "数据结构与算法",
    course_icon: "ri-code-s-slash-line",
    due_date: "2026-04-07T23:59:00Z",
    status: "submitted",
  },
  {
    id: "asgn-4",
    title: "微积分第二章作业 - 极限与连续",
    course_name: "高等数学 A",
    course_icon: "ri-function-add-line",
    due_date: "2026-04-03T23:59:00Z",
    status: "graded",
    score: 85,
  },
  {
    id: "asgn-5",
    title: "排序算法实现与分析",
    course_name: "数据结构与算法",
    course_icon: "ri-code-s-slash-line",
    due_date: "2026-04-01T23:59:00Z",
    status: "graded",
    score: 92,
  },
  {
    id: "asgn-6",
    title: "牛顿运动定律计算题",
    course_name: "大学物理 II",
    course_icon: "ri-flashlight-line",
    due_date: "2026-03-28T23:59:00Z",
    status: "overdue",
  },
];

const statusConfig: Record<
  string,
  { label: string; cls: string; icon: string }
> = {
  pending: {
    label: "待提交",
    cls: "bg-ink-warning-light text-ink-warning",
    icon: "ri-time-line",
  },
  submitted: {
    label: "已提交",
    cls: "bg-ink-primary-lighter text-ink-primary",
    icon: "ri-check-line",
  },
  graded: {
    label: "已批改",
    cls: "bg-ink-success-light text-ink-success",
    icon: "ri-checkbox-circle-line",
  },
  overdue: {
    label: "已逾期",
    cls: "bg-ink-error-light text-ink-error",
    icon: "ri-alarm-warning-line",
  },
};

function formatDue(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  const diffD = Math.floor(diffH / 24);

  if (diffMs < 0) {
    return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  }
  if (diffD > 1) return `${diffD} 天后截止`;
  if (diffH > 0) return `${diffH} 小时后截止`;
  return "即将截止";
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

/* ── Helpers ── */

const courseIconMap: Record<string, string> = {
  "数学": "ri-function-add-line",
  "高等数学": "ri-function-add-line",
  "物理": "ri-flashlight-line",
  "大学物理": "ri-flashlight-line",
  "数据结构": "ri-code-s-slash-line",
  "算法": "ri-code-s-slash-line",
  "编程": "ri-code-s-slash-line",
};

function deriveCourseIcon(courseName: string): string {
  for (const [key, icon] of Object.entries(courseIconMap)) {
    if (courseName.includes(key)) return icon;
  }
  return "ri-book-open-line";
}

interface SubmissionResponse {
  id: string;
  assignment_id: string;
  assignment_title: string;
  course_name: string;
  status: string;
  score?: number;
  submitted_at?: string;
  due_date?: string;
}

interface StudentAssignmentRow {
  assignment_id: string;
  assignment_title: string;
  course_name: string;
  due_date: string | null;
  description: string | null;
  submission_id: string | null;
  status: string;
  score: number | null;
  submitted_at: string | null;
}

export default function AssignmentsPage() {
  const { data: assignments, isPending, isFetching } = useQuery({
    queryKey: ["student-assignments-v2"],
    queryFn: async () => {
      const data = await apiFetch<StudentAssignmentRow[]>("/api/student/assignments");
      return data
        // Skip rows that are missing a title so we never render an
        // "untitled" or duplicated row during a refetch flash.
        .filter((s) => s.assignment_title && s.assignment_title.trim().length > 0)
        .map((s): StudentAssignment => ({
          // Use submission_id when present so click-through opens grading detail;
          // otherwise use assignment_id so we can render the submit form.
          id: s.submission_id ?? s.assignment_id,
          title: s.assignment_title,
          course_name: s.course_name,
          course_icon: deriveCourseIcon(s.course_name),
          due_date: s.due_date || s.submitted_at || new Date().toISOString(),
          status: (s.status as StudentAssignment["status"]) || "pending",
          score: s.score ?? undefined,
        }));
    },
  });

  const list = assignments ?? [];
  const pendingCount = list.filter(
    (a) => a.status === "pending" || a.status === "overdue",
  ).length;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-heading font-bold text-ink-text">
          我的作业
        </h1>
        <p className="mt-1 text-sm text-ink-text-muted">
          {pendingCount} 份作业待完成
        </p>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {(["pending", "submitted", "graded", "overdue"] as const).map(
          (status) => {
            const config = statusConfig[status];
            const count = list.filter((a) => a.status === status).length;
            return (
              <div
                key={status}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                  config.cls,
                )}
              >
                <i className={cn(config.icon, "text-xs")} />
                {config.label} {count}
              </div>
            );
          },
        )}
      </div>

      {/* Assignment list */}
      <div className="rounded-xl border border-ink-border bg-white overflow-hidden">
        {(isPending || (isFetching && list.length === 0)) && (
          <div className="divide-y divide-ink-border">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="h-10 w-10 shrink-0 rounded-lg bg-ink-surface animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-ink-surface animate-pulse" />
                  <div className="h-2 w-1/3 rounded bg-ink-surface animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}
        <motion.div variants={stagger} className="divide-y divide-ink-border">
          {list.map((asgn) => {
            const config = statusConfig[asgn.status];
            return (
              <motion.div key={asgn.id} variants={rowVariant}>
                <Link
                  href={`/s/assignments/${asgn.id}`}
                  className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4 transition-colors hover:bg-ink-surface/50"
                >
                  {/* Course icon */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-primary-lighter">
                    <i
                      className={cn(
                        asgn.course_icon || "ri-file-text-line",
                        "text-lg text-ink-primary",
                      )}
                    />
                  </div>

                  {/* Title + course */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-ink-text truncate">
                      {asgn.title || asgn.course_name || "未命名作业"}
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-text-muted">
                      {asgn.course_name}
                    </p>
                  </div>

                  {/* Due date - hidden on small mobile */}
                  <span
                    className={cn(
                      "hidden sm:inline shrink-0 text-xs",
                      asgn.status === "overdue"
                        ? "text-ink-error font-medium"
                        : "text-ink-text-light",
                    )}
                  >
                    {formatDue(asgn.due_date)}
                  </span>

                  {/* Score */}
                  {asgn.score !== undefined && (
                    <span className="shrink-0 text-sm font-heading font-bold text-ink-primary">
                      {asgn.score}
                    </span>
                  )}

                  {/* Status badge */}
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      config.cls,
                    )}
                  >
                    <i className={cn(config.icon, "text-[10px]")} />
                    {config.label}
                  </span>

                  <i className="ri-arrow-right-s-line text-ink-text-light shrink-0" />
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </motion.div>
  );
}
