"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import type { WarningStudent } from "@/lib/queries";
import { cn } from "@/lib/utils";

const mockWarnings: WarningStudent[] = [
  {
    id: "1",
    name: "张明远",
    avatar: "ZM",
    weak_points: [
      { name: "圆锥曲线", mastery: 32 },
      { name: "导数应用", mastery: 41 },
      { name: "参数方程", mastery: 35 },
    ],
    risk_level: "high",
  },
  {
    id: "2",
    name: "李思琪",
    avatar: "LS",
    weak_points: [
      { name: "参数方程", mastery: 28 },
      { name: "立体几何", mastery: 45 },
    ],
    risk_level: "high",
  },
  {
    id: "3",
    name: "孙博文",
    avatar: "SB",
    weak_points: [
      { name: "级数收敛", mastery: 38 },
      { name: "多元函数", mastery: 42 },
    ],
    risk_level: "high",
  },
  {
    id: "4",
    name: "王浩然",
    avatar: "WH",
    weak_points: [{ name: "概率统计", mastery: 52 }],
    risk_level: "medium",
  },
  {
    id: "5",
    name: "陈雨涵",
    avatar: "CY",
    weak_points: [
      { name: "数列求和", mastery: 48 },
      { name: "圆锥曲线", mastery: 39 },
    ],
    risk_level: "medium",
  },
  {
    id: "6",
    name: "周雅婷",
    avatar: "ZY",
    weak_points: [{ name: "三角恒等", mastery: 56 }],
    risk_level: "low",
  },
  {
    id: "7",
    name: "赵子轩",
    avatar: "ZZ",
    weak_points: [{ name: "立体几何", mastery: 55 }],
    risk_level: "low",
  },
  {
    id: "8",
    name: "吴佳琪",
    avatar: "WJ",
    weak_points: [{ name: "定积分", mastery: 58 }],
    risk_level: "low",
  },
];

const riskConfig = {
  high: {
    label: "高风险",
    cls: "bg-ink-error-light text-ink-error",
    headerCls: "border-l-ink-error",
    sortOrder: 0,
  },
  medium: {
    label: "中风险",
    cls: "bg-ink-warning-light text-ink-warning",
    headerCls: "border-l-ink-warning",
    sortOrder: 1,
  },
  low: {
    label: "关注",
    cls: "bg-ink-primary-lighter text-ink-primary",
    headerCls: "border-l-ink-primary",
    sortOrder: 2,
  },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

const rowVariant = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 400, damping: 30 },
  },
};

export default function WarningsPage() {
  const router = useRouter();

  const { data: warnings } = useQuery({
    queryKey: ["all-warnings"],
    queryFn: async () => {
      const courses = await apiFetch<{ id: string }[]>("/api/courses");
      const allWarnings = await Promise.all(
        courses.map((c) =>
          apiFetch<{ warnings: WarningStudent[] }>(
            `/api/analytics/warnings/${c.id}?threshold=0.5`,
          )
            .then((r) => r.warnings)
            .catch(() => [] as WarningStudent[]),
        ),
      );
      return allWarnings.flat();
    },
  });

  const sorted = [...(warnings ?? [])].sort(
    (a, b) =>
      (riskConfig[a.risk_level]?.sortOrder ?? 3) -
      (riskConfig[b.risk_level]?.sortOrder ?? 3),
  );

  const highCount = sorted.filter((s) => s.risk_level === "high").length;
  const mediumCount = sorted.filter((s) => s.risk_level === "medium").length;

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-ink-text">
          预警中心
        </h1>
        <p className="mt-1 text-sm text-ink-text-muted">
          需要关注的学生学情预警
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-ink-border bg-white p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-error-light">
            <i className="ri-alarm-warning-line text-lg text-ink-error" />
          </div>
          <div>
            <p className="text-xl font-heading font-bold text-ink-error">
              {highCount}
            </p>
            <p className="text-xs text-ink-text-muted">高风险学生</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-ink-border bg-white p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-warning-light">
            <i className="ri-error-warning-line text-lg text-ink-warning" />
          </div>
          <div>
            <p className="text-xl font-heading font-bold text-ink-warning">
              {mediumCount}
            </p>
            <p className="text-xs text-ink-text-muted">中风险学生</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-ink-border bg-white p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-primary-lighter">
            <i className="ri-user-heart-line text-lg text-ink-primary" />
          </div>
          <div>
            <p className="text-xl font-heading font-bold text-ink-text">
              {sorted.length}
            </p>
            <p className="text-xs text-ink-text-muted">总预警人数</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-ink-border bg-white overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-ink-border bg-ink-surface">
              <th className="px-5 py-3 text-left font-medium text-ink-text-muted">
                学生
              </th>
              <th className="px-5 py-3 text-left font-medium text-ink-text-muted">
                薄弱知识点
              </th>
              <th className="px-5 py-3 text-left font-medium text-ink-text-muted">
                风险等级
              </th>
              <th className="px-5 py-3 text-right font-medium text-ink-text-muted">
                操作
              </th>
            </tr>
          </thead>
          <motion.tbody variants={stagger}>
            {sorted.map((student) => {
              const risk = riskConfig[student.risk_level] || { label: "正常", cls: "bg-ink-surface text-ink-text-light", headerCls: "border-l-ink-border", sortOrder: 3 };
              return (
                <motion.tr
                  key={student.id}
                  variants={rowVariant}
                  className="border-b border-ink-border last:border-0 hover:bg-ink-surface/50 transition-colors"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-primary-lighter text-xs font-bold text-ink-primary">
                        {student.avatar}
                      </div>
                      <span className="font-medium text-ink-text">
                        {student.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {student.weak_points.map((wp) => (
                        <span
                          key={wp.name}
                          className="inline-flex items-center gap-1 rounded-md bg-ink-surface px-2 py-0.5 text-xs text-ink-text-muted"
                        >
                          {wp.name}
                          <span
                            className={cn(
                              "font-mono font-semibold",
                              wp.mastery < 40
                                ? "text-ink-error"
                                : wp.mastery < 55
                                  ? "text-ink-warning"
                                  : "text-ink-text-muted",
                            )}
                          >
                            {wp.mastery}%
                          </span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                        risk.cls,
                      )}
                    >
                      {risk.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => {
                        const cid = (student as { course_id?: string }).course_id;
                        if (cid) router.push(`/teacher/courses/${cid}/analytics`);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-ink-primary hover:text-ink-primary-dark transition-colors cursor-pointer"
                    >
                      <i className="ri-eye-line" />
                      查看详情
                    </button>
                  </td>
                </motion.tr>
              );
            })}
          </motion.tbody>
        </table>
      </div>
    </motion.div>
  );
}
