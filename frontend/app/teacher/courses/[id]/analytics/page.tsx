"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { fetchCourseAnalytics } from "@/lib/queries";
import type { AnalyticsData } from "@/lib/queries";
import { cn } from "@/lib/utils";

const mockAnalytics: AnalyticsData = {
  mastery_distribution: [
    { range: "0-20%", count: 3 },
    { range: "20-40%", count: 8 },
    { range: "40-60%", count: 25 },
    { range: "60-80%", count: 68 },
    { range: "80-100%", count: 52 },
  ],
  top_errors: [
    { point: "圆锥曲线焦点距离", error_count: 47, avg_mastery: 38 },
    { point: "导数链式法则", error_count: 35, avg_mastery: 45 },
    { point: "三角恒等变换", error_count: 28, avg_mastery: 52 },
    { point: "数列通项公式", error_count: 22, avg_mastery: 58 },
    { point: "定积分换元法", error_count: 18, avg_mastery: 61 },
    { point: "空间向量坐标法", error_count: 15, avg_mastery: 55 },
  ],
};

const distributionColors = ["#DC2626", "#D97706", "#D97706", "#059669", "#059669"];

export default function CourseAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: analytics } = useQuery({
    queryKey: ["course-analytics", id],
    queryFn: () => fetchCourseAnalytics(id),
    placeholderData: mockAnalytics,
  });

  const data = analytics ?? mockAnalytics;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="space-y-6"
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-ink-text-muted">
        <Link href="/teacher/courses" className="hover:text-ink-primary transition-colors">
          课程管理
        </Link>
        <i className="ri-arrow-right-s-line text-ink-text-light" />
        <Link
          href={`/teacher/courses/${id}`}
          className="hover:text-ink-primary transition-colors"
        >
          课程详情
        </Link>
        <i className="ri-arrow-right-s-line text-ink-text-light" />
        <span className="text-ink-text font-medium">学情分析</span>
      </nav>

      <div>
        <h1 className="text-2xl font-heading font-bold text-ink-text">
          学情分析
        </h1>
        <p className="mt-1 text-sm text-ink-text-muted">
          班级掌握度分布与易错知识点分析
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Mastery Distribution */}
        <div className="rounded-xl border border-ink-border bg-white p-5">
          <h2 className="text-base font-heading font-semibold text-ink-text mb-1">
            掌握度分布
          </h2>
          <p className="text-xs text-ink-text-muted mb-4">
            学生知识掌握率区间分布
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={data.mastery_distribution}
              margin={{ top: 0, right: 10, bottom: 0, left: 0 }}
              barSize={40}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#F3F4F6"
                vertical={false}
              />
              <XAxis
                dataKey="range"
                tick={{ fontSize: 11, fill: "#6B7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #F3F4F6",
                  fontSize: "12px",
                }}
                formatter={(value) => [`${value} 人`, "学生数"]}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {data.mastery_distribution.map((_entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={distributionColors[index] || "#6B7280"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Error Points */}
        <div className="rounded-xl border border-ink-border bg-white p-5">
          <h2 className="text-base font-heading font-semibold text-ink-text mb-1">
            高频错误知识点
          </h2>
          <p className="text-xs text-ink-text-muted mb-4">
            按错误次数排序
          </p>
          <div className="space-y-3">
            {data.top_errors.map((err, i) => (
              <div
                key={err.point}
                className="flex items-center gap-3 rounded-lg border border-ink-border p-3"
              >
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white",
                    i < 2 ? "bg-ink-error" : i < 4 ? "bg-ink-warning" : "bg-ink-text-light",
                  )}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-text truncate">
                    {err.point}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-ink-text-muted">
                    <span>
                      <i className="ri-error-warning-line mr-0.5 text-ink-error" />
                      {err.error_count} 次错误
                    </span>
                    <span>
                      <i className="ri-bar-chart-line mr-0.5" />
                      平均掌握 {err.avg_mastery}%
                    </span>
                  </div>
                </div>
                <div className="shrink-0">
                  <div className="h-1.5 w-16 rounded-full bg-ink-surface overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        err.avg_mastery >= 60
                          ? "bg-ink-success"
                          : err.avg_mastery >= 40
                            ? "bg-ink-warning"
                            : "bg-ink-error",
                      )}
                      style={{ width: `${err.avg_mastery}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
