"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import { fetchCourse } from "@/lib/queries";
import type { Course } from "@/lib/queries";

const mockCourse: Course = {
  id: "math-101",
  name: "高等数学 A",
  description: "微积分、线性代数、概率统计综合课程",
  student_count: 156,
  updated_at: "2026-04-05T10:30:00Z",
  icon: "ri-function-add-line",
};

const mockStudents = [
  { id: "1", name: "张明远", email: "zhangmy@edu.cn", mastery: 78 },
  { id: "2", name: "李思琪", email: "lisq@edu.cn", mastery: 65 },
  { id: "3", name: "王浩然", email: "wanghr@edu.cn", mastery: 82 },
  { id: "4", name: "陈雨涵", email: "chenyh@edu.cn", mastery: 71 },
  { id: "5", name: "赵子轩", email: "zhaozx@edu.cn", mastery: 88 },
];

export default function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: course } = useQuery({
    queryKey: ["course", id],
    queryFn: () => fetchCourse(id),
  });

  const { data: studentsData } = useQuery({
    queryKey: ["course-students", id],
    queryFn: () =>
      apiFetch<{ students: typeof mockStudents }>(`/api/courses/${id}/students`),
  });
  const students = studentsData?.students ?? [];

  if (!course) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-text-muted">加载课程信息中...</p>
      </div>
    );
  }
  const c = course;

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
        <span className="text-ink-text font-medium">{c.name}</span>
      </nav>

      {/* Course Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink-primary-lighter text-ink-primary">
            <i className={`${c.icon || "ri-book-open-line"} text-2xl`} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-heading font-bold text-ink-text">
              {c.name}
            </h1>
            <p className="mt-1 text-sm text-ink-text-muted">{c.description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/teacher/courses/${id}/knowledge`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-ink-border bg-white px-3 sm:px-4 text-sm font-medium text-ink-text transition-colors hover:bg-ink-surface"
          >
            <i className="ri-database-2-line text-ink-primary" />
            知识库
          </Link>
          <Link
            href={`/teacher/courses/${id}/analytics`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-ink-border bg-white px-3 sm:px-4 text-sm font-medium text-ink-text transition-colors hover:bg-ink-surface"
          >
            <i className="ri-line-chart-line text-ink-primary" />
            分析
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="students">学生</TabsTrigger>
          <TabsTrigger value="settings">设置</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-ink-border bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-primary-lighter">
                  <i className="ri-user-3-line text-lg text-ink-primary" />
                </div>
                <div>
                  <p className="text-2xl font-heading font-bold text-ink-text">
                    {c.student_count}
                  </p>
                  <p className="text-xs text-ink-text-muted">注册学生</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-ink-border bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-success-light">
                  <i className="ri-node-tree text-lg text-ink-success" />
                </div>
                <div>
                  <p className="text-2xl font-heading font-bold text-ink-text">
                    24
                  </p>
                  <p className="text-xs text-ink-text-muted">知识点</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-ink-border bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-warning-light">
                  <i className="ri-file-check-line text-lg text-ink-warning" />
                </div>
                <div>
                  <p className="text-2xl font-heading font-bold text-ink-text">
                    18
                  </p>
                  <p className="text-xs text-ink-text-muted">待批改</p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="students" className="mt-6">
          <div className="rounded-xl border border-ink-border bg-white overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-ink-border bg-ink-surface">
                  <th className="px-4 py-3 text-left font-medium text-ink-text-muted">
                    学生
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-ink-text-muted">
                    邮箱
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-ink-text-muted">
                    掌握度
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-ink-border last:border-0 hover:bg-ink-surface/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-primary-lighter text-xs font-bold text-ink-primary">
                          {s.name.charAt(0)}
                        </div>
                        <span className="font-medium text-ink-text">
                          {s.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-text-muted">{s.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-ink-surface overflow-hidden">
                          <div
                            className="h-full rounded-full bg-ink-primary transition-all"
                            style={{ width: `${(s as any).overall_mastery ?? s.mastery ?? 0}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-ink-text-muted">
                          {(s as any).overall_mastery ?? s.mastery ?? 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <div className="max-w-lg space-y-4">
            <div className="rounded-xl border border-ink-border bg-white p-5 space-y-4">
              <h3 className="text-sm font-heading font-semibold text-ink-text">
                课程信息
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-ink-text-muted">
                    课程名称
                  </label>
                  <input
                    type="text"
                    defaultValue={c.name}
                    className="mt-1 w-full rounded-lg border border-ink-border bg-white px-3 py-2 text-sm text-ink-text outline-none focus:border-ink-primary focus:ring-2 focus:ring-ink-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-text-muted">
                    描述
                  </label>
                  <textarea
                    defaultValue={c.description}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-ink-border bg-white px-3 py-2 text-sm text-ink-text outline-none focus:border-ink-primary focus:ring-2 focus:ring-ink-primary/20 resize-none"
                  />
                </div>
              </div>
              <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink-primary px-4 text-sm font-medium text-white transition-colors hover:bg-ink-primary-dark">
                保存修改
              </button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
