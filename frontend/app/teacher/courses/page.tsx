"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { fetchCourses } from "@/lib/queries";
import type { Course } from "@/lib/queries";

const mockCourses: Course[] = [
  {
    id: "math-101",
    name: "高等数学 A",
    description: "微积分、线性代数、概率统计综合课程",
    student_count: 156,
    updated_at: "2026-04-05T10:30:00Z",
    icon: "ri-function-add-line",
  },
  {
    id: "physics-201",
    name: "大学物理 II",
    description: "电磁学、光学、近代物理",
    student_count: 98,
    updated_at: "2026-04-04T14:20:00Z",
    icon: "ri-flashlight-line",
  },
  {
    id: "cs-301",
    name: "数据结构与算法",
    description: "排序、搜索、图论、动态规划",
    student_count: 72,
    updated_at: "2026-04-06T08:15:00Z",
    icon: "ri-code-s-slash-line",
  },
  {
    id: "stat-102",
    name: "概率论与数理统计",
    description: "概率空间、随机变量、假设检验",
    student_count: 64,
    updated_at: "2026-04-03T16:45:00Z",
    icon: "ri-bar-chart-2-line",
  },
];

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 400, damping: 30 },
  },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CoursesPage() {
  const queryClient = useQueryClient();
  const { data: courses } = useQuery({
    queryKey: ["courses"],
    queryFn: fetchCourses,
  });

  const list = courses ?? [];

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) =>
      apiFetch("/api/courses", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    },
  });

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-heading font-bold text-ink-text">
            课程管理
          </h1>
          <p className="mt-1 text-sm text-ink-text-muted">
            管理你的所有课程与学习资源
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink-primary px-4 text-sm font-medium text-white transition-colors hover:bg-ink-primary-dark self-start sm:self-auto"
        >
          <i className={showCreate ? "ri-close-line" : "ri-add-line"} />
          {showCreate ? "取消" : "新建课程"}
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-ink-primary/20 bg-ink-primary-lighter/30 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-ink-text-light">
                课程名称
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="高等数学"
                className="mt-1 w-full rounded-lg border border-ink-border px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-text-light">
                课程描述
              </label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="微积分、线性代数..."
                className="mt-1 w-full rounded-lg border border-ink-border px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <button
            onClick={() =>
              newName &&
              createMutation.mutate({ name: newName, description: newDesc })
            }
            disabled={!newName || createMutation.isPending}
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink-primary px-4 text-xs font-medium text-white hover:bg-ink-primary-dark disabled:opacity-50"
          >
            {createMutation.isPending ? "创建中..." : "创建课程"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((course) => (
          <motion.div key={course.id} variants={cardVariant}>
            <Link
              href={`/teacher/courses/${course.id}`}
              className="group block rounded-xl border border-ink-border bg-white p-5 transition-all hover:border-ink-primary/20 hover:shadow-lg hover:shadow-ink-primary/5"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-primary-lighter text-ink-primary">
                  <i className={`${course.icon || "ri-book-open-line"} text-xl`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-heading font-semibold text-ink-text group-hover:text-ink-primary transition-colors truncate">
                    {course.name}
                  </h3>
                  <p className="mt-1 text-xs text-ink-text-muted line-clamp-2">
                    {course.description}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-4 text-xs text-ink-text-light">
                <span className="flex items-center gap-1">
                  <i className="ri-user-3-line" />
                  {course.student_count} 名学生
                </span>
                <span className="flex items-center gap-1">
                  <i className="ri-time-line" />
                  {formatDate(course.updated_at)}
                </span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
