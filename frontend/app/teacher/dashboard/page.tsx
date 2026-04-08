"use client";

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
import StatCard from "@/components/teacher/StatCard";
import { cn } from "@/lib/utils";
import type {
  StatOverview,
  KnowledgeMastery,
  WarningStudent,
} from "@/lib/queries";
import {
  fetchStatOverview,
  fetchKnowledgeMastery,
  fetchWarnings,
  fetchCourses,
} from "@/lib/queries";

/* ── Mock data for demo/competition ── */

const mockOverview: StatOverview = {
  active_students: 156,
  active_students_trend: [120, 134, 128, 145, 142, 156, 148],
  qa_accuracy: 87.3,
  qa_accuracy_delta: 2.1,
  warning_count: 8,
  warning_avatars: ["W1", "W2", "W3"],
  ai_interactions: 2847,
  ai_breakdown: "答疑 1,823 / 批改 689 / 练习 335",
};

const mockMastery: KnowledgeMastery[] = [
  { name: "二次函数", mastery: 92, level: "high" },
  { name: "三角恒等", mastery: 85, level: "high" },
  { name: "导数应用", mastery: 78, level: "medium" },
  { name: "数列求和", mastery: 71, level: "medium" },
  { name: "概率统计", mastery: 65, level: "medium" },
  { name: "立体几何", mastery: 58, level: "low" },
  { name: "圆锥曲线", mastery: 45, level: "low" },
  { name: "参数方程", mastery: 38, level: "low" },
];

const mockWarnings: WarningStudent[] = [
  {
    id: "1",
    name: "张明远",
    avatar: "ZM",
    weak_points: [
      { name: "圆锥曲线", mastery: 32 },
      { name: "导数应用", mastery: 41 },
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
    name: "王浩然",
    avatar: "WH",
    weak_points: [{ name: "概率统计", mastery: 52 }],
    risk_level: "medium",
  },
  {
    id: "4",
    name: "陈雨涵",
    avatar: "CY",
    weak_points: [
      { name: "数列求和", mastery: 48 },
      { name: "圆锥曲线", mastery: 39 },
    ],
    risk_level: "medium",
  },
  {
    id: "5",
    name: "赵子轩",
    avatar: "ZZ",
    weak_points: [{ name: "立体几何", mastery: 55 }],
    risk_level: "low",
  },
];

/* ── Color helpers ── */

function getMasteryBarColor(level: string): string {
  switch (level) {
    case "high":
      return "#059669";
    case "medium":
      return "#D97706";
    case "low":
      return "#DC2626";
    default:
      return "#6B7280";
  }
}

function getRiskBadge(level: string) {
  switch (level) {
    case "high":
      return {
        label: "高风险",
        cls: "bg-ink-error-light text-ink-error",
      };
    case "medium":
      return {
        label: "中风险",
        cls: "bg-ink-warning-light text-ink-warning",
      };
    default:
      return {
        label: "关注",
        cls: "bg-ink-primary-lighter text-ink-primary",
      };
  }
}

/* ── Stagger animation ── */

const stagger = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
};

export default function DashboardPage() {
  const { data: courses } = useQuery({
    queryKey: ["teacher-courses"],
    queryFn: fetchCourses,
  });
  const firstCourseId = courses?.[0]?.id || "00000000-0000-4000-b000-000000000001";

  const { data: overview } = useQuery({
    queryKey: ["stat-overview"],
    queryFn: () => fetchStatOverview(),
  });

  const { data: mastery } = useQuery({
    queryKey: ["knowledge-mastery-all", courses?.map((c) => c.id)],
    queryFn: async () => {
      if (!courses?.length) return [];
      const all = await Promise.all(
        courses.map((c) => fetchKnowledgeMastery(c.id).catch(() => [])),
      );
      return all.flat().sort((a, b) => b.mastery - a.mastery);
    },
    enabled: !!courses?.length,
  });

  const { data: warnings } = useQuery({
    queryKey: ["dashboard-warnings", courses?.map((c) => c.id)],
    queryFn: async () => {
      if (!courses?.length) return [];
      const all = await Promise.all(
        courses.map((c) => fetchWarnings(c.id).catch(() => [])),
      );
      return all.flat();
    },
    enabled: !!courses?.length,
  });

  const stats = overview ?? {
    active_students: 0,
    active_students_trend: [],
    qa_accuracy: 0,
    qa_accuracy_delta: 0,
    warning_count: 0,
    warning_avatars: [],
    ai_interactions: 0,
    ai_breakdown: "",
  };
  const masteryData = mastery ?? [];
  const warningData = warnings ?? [];

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-6"
    >
      {/* Page header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-heading font-bold text-ink-text">
          仪表盘
        </h1>
        <p className="mt-1 text-sm text-ink-text-muted">
          教学数据概览与学情监控
        </p>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="活跃学生"
          value={stats.active_students}
          icon="ri-user-heart-line"
          color="primary"
          sparkline={stats.active_students_trend}
          trend={{ direction: "up", label: "较上周 +8%" }}
        />
        <StatCard
          title="答疑正确率"
          value={stats.qa_accuracy}
          suffix="%"
          icon="ri-checkbox-circle-line"
          color="success"
          trend={{
            direction: stats.qa_accuracy_delta >= 0 ? "up" : "down",
            label: `${stats.qa_accuracy_delta >= 0 ? "+" : ""}${stats.qa_accuracy_delta}%`,
          }}
        />
        <StatCard
          title="预警学生"
          value={stats.warning_count}
          icon="ri-alarm-warning-line"
          color="error"
          extra={
            <div className="mt-2 flex -space-x-1.5">
              {stats.warning_avatars.slice(0, 3).map((a, i) => (
                <div
                  key={i}
                  className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-ink-error-light text-[8px] font-bold text-ink-error"
                >
                  {a.charAt(0)}
                </div>
              ))}
              {stats.warning_count > 3 && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-ink-surface text-[8px] font-bold text-ink-text-light">
                  +{stats.warning_count - 3}
                </div>
              )}
            </div>
          }
        />
        <StatCard
          title="AI 交互次数"
          value={stats.ai_interactions.toLocaleString()}
          icon="ri-robot-2-line"
          color="primary"
          extra={
            <p className="mt-1.5 text-[11px] text-ink-text-light">
              {stats.ai_breakdown}
            </p>
          }
        />
      </div>

      {/* Charts + Warnings */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Mastery Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 400, damping: 30 }}
          className="lg:col-span-3 rounded-xl border border-ink-border bg-white p-5"
        >
          <h2 className="text-base font-heading font-semibold text-ink-text mb-1">
            知识点掌握度
          </h2>
          <p className="text-xs text-ink-text-muted mb-4">
            班级平均掌握率分布
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={masteryData}
              layout="vertical"
              margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
              barSize={16}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#F3F4F6"
                horizontal={false}
              />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={70}
                tick={{ fontSize: 12, fill: "#6B7280" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #F3F4F6",
                  fontSize: "12px",
                }}
                formatter={(value) => [`${value}%`, "掌握率"]}
              />
              <Bar dataKey="mastery" radius={[0, 6, 6, 0]}>
                {masteryData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={getMasteryBarColor(entry.level)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Warning Students List */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 400, damping: 30 }}
          className="lg:col-span-2 rounded-xl border border-ink-border bg-white p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-heading font-semibold text-ink-text">
                预警学生
              </h2>
              <p className="text-xs text-ink-text-muted">需要关注的学生</p>
            </div>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-ink-error text-[10px] font-bold text-white px-1.5">
              {warningData.length}
            </span>
          </div>

          <div className="space-y-3">
            {warningData.map((student) => {
              const badge = getRiskBadge(student.risk_level);
              return (
                <div
                  key={student.id}
                  className="flex items-start gap-3 rounded-lg border border-ink-border p-3 transition-colors hover:bg-ink-surface"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-primary-lighter text-xs font-bold text-ink-primary">
                    {student.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-text truncate">
                        {student.name}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                          badge.cls,
                        )}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {student.weak_points.map((wp) => (
                        <span
                          key={wp.name}
                          className="inline-flex items-center rounded-md bg-ink-surface px-1.5 py-0.5 text-[10px] text-ink-text-muted"
                        >
                          {wp.name}{" "}
                          <span className="ml-1 font-mono text-ink-error">
                            {wp.mastery}%
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
