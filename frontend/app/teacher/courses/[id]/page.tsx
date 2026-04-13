"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

  const queryClient = useQueryClient();

  const { data: studentsData } = useQuery({
    queryKey: ["course-students", id],
    queryFn: () =>
      apiFetch<{ students: typeof mockStudents }>(`/api/courses/${id}/students`),
  });
  const students = studentsData?.students ?? [];

  // Pending grading count for THIS course (filters teacher's full submissions list)
  const { data: pendingForCourse } = useQuery({
    queryKey: ["course-pending", id],
    queryFn: async () => {
      const all = await apiFetch<
        { status: string; assignment_id: string; course_name?: string }[]
      >("/api/submissions/mine");
      return all.filter(
        (s) =>
          (s.status === "pending" || s.status === "submitted") &&
          s.course_name === course?.name,
      ).length;
    },
    enabled: !!course?.name,
  });

  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  useEffect(() => {
    if (course) {
      setEditName(course.name);
      setEditDesc(course.description || "");
    }
  }, [course]);

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; description?: string }) =>
      apiFetch(`/api/courses/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course", id] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    },
  });

  // ─── Enroll-students UI state + queries ──────────────────────────
  const [showEnroll, setShowEnroll] = useState(false);
  const [enrollPicks, setEnrollPicks] = useState<Set<string>>(new Set());

  const { data: availableStudents } = useQuery({
    queryKey: ["available-students-for-enroll"],
    queryFn: async () => {
      try {
        const res = await apiFetch<{
          students: Array<{ id: string; name: string; email?: string }>;
        }>("/api/courses/available-students");
        return res.students || [];
      } catch {
        return [];
      }
    },
    enabled: showEnroll,
  });

  const enrolledIdSet = new Set(students.map((s) => (s as { id: string }).id));
  const eligibleStudents = (availableStudents ?? []).filter(
    (s) => !enrolledIdSet.has(s.id),
  );

  const enrollMutation = useMutation({
    mutationFn: (student_ids: string[]) =>
      apiFetch(`/api/courses/${id}/enroll`, {
        method: "POST",
        body: JSON.stringify({ student_ids }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-students", id] });
      queryClient.invalidateQueries({ queryKey: ["course", id] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      setShowEnroll(false);
      setEnrollPicks(new Set());
    },
  });

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
                    {c.kp_count ?? 0}
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
                    {pendingForCourse ?? 0}
                  </p>
                  <p className="text-xs text-ink-text-muted">待批改</p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="students" className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-text-muted">
              当前 {students.length} 名学生
            </p>
            <button
              onClick={() => setShowEnroll((v) => !v)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink-primary px-4 text-sm font-medium text-white hover:bg-ink-primary-dark"
            >
              <i className={showEnroll ? "ri-close-line" : "ri-user-add-line"} />
              {showEnroll ? "取消" : "加入学生"}
            </button>
          </div>

          {showEnroll && (
            <div className="rounded-xl border border-ink-primary/20 bg-ink-primary-lighter/30 p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-medium text-ink-text">
                  选择要加入的学生（已选 {enrollPicks.size} 名）
                </p>
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={() => setEnrollPicks(new Set(eligibleStudents.map((s) => s.id)))}
                    className="text-ink-primary hover:underline"
                  >
                    全选
                  </button>
                  <span className="text-ink-text-light">|</span>
                  <button
                    onClick={() => setEnrollPicks(new Set())}
                    className="text-ink-primary hover:underline"
                  >
                    清空
                  </button>
                </div>
              </div>
              {eligibleStudents.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink-text-muted">
                  没有未加入的学生
                </p>
              ) : (
                <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
                  {eligibleStudents.map((s) => {
                    const picked = enrollPicks.has(s.id);
                    return (
                      <label
                        key={s.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${picked ? "border-ink-primary bg-ink-primary/10" : "border-ink-border bg-white hover:bg-ink-surface"}`}
                      >
                        <input
                          type="checkbox"
                          checked={picked}
                          onChange={(e) => {
                            const next = new Set(enrollPicks);
                            if (e.target.checked) next.add(s.id);
                            else next.delete(s.id);
                            setEnrollPicks(next);
                          }}
                          className="h-3 w-3"
                        />
                        <span className="truncate text-ink-text">{s.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              <button
                onClick={() => enrollPicks.size > 0 && enrollMutation.mutate(Array.from(enrollPicks))}
                disabled={enrollPicks.size === 0 || enrollMutation.isPending}
                className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink-primary px-4 text-xs font-medium text-white hover:bg-ink-primary-dark disabled:opacity-50"
              >
                {enrollMutation.isPending ? (
                  <><i className="ri-loader-4-line animate-spin" /> 加入中...</>
                ) : (
                  <><i className="ri-check-line" /> 加入选中的 {enrollPicks.size} 名学生</>
                )}
              </button>
            </div>
          )}

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
                      {(() => {
                        const raw = (s as { overall_mastery?: number; mastery?: number }).overall_mastery ?? (s as { mastery?: number }).mastery ?? 0;
                        // Backend may return 0..1 or 0..100 — normalize.
                        const pct = Math.round((raw > 1 ? raw : raw * 100));
                        return (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 rounded-full bg-ink-surface overflow-hidden">
                              <div
                                className="h-full rounded-full bg-ink-primary transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono text-ink-text-muted">
                              {pct}%
                            </span>
                          </div>
                        );
                      })()}
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
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-ink-border bg-white px-3 py-2 text-sm text-ink-text outline-none focus:border-ink-primary focus:ring-2 focus:ring-ink-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-text-muted">
                    描述
                  </label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-ink-border bg-white px-3 py-2 text-sm text-ink-text outline-none focus:border-ink-primary focus:ring-2 focus:ring-ink-primary/20 resize-none"
                  />
                </div>
              </div>
              <button
                onClick={() =>
                  updateMutation.mutate({
                    name: editName,
                    description: editDesc,
                  })
                }
                disabled={updateMutation.isPending}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink-primary px-4 text-sm font-medium text-white transition-colors hover:bg-ink-primary-dark disabled:opacity-50"
              >
                {updateMutation.isPending ? "保存中..." : "保存修改"}
              </button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
