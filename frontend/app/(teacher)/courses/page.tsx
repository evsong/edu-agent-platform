"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
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
  const { data: courses } = useQuery({
    queryKey: ["courses"],
    queryFn: fetchCourses,
    placeholderData: mockCourses,
  });

  const list = courses ?? mockCourses;

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-ink-text">
            课程管理
          </h1>
          <p className="mt-1 text-sm text-ink-text-muted">
            管理你的所有课程与学习资源
          </p>
        </div>
        <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink-primary px-4 text-sm font-medium text-white transition-colors hover:bg-ink-primary-dark">
          <i className="ri-add-line" />
          新建课程
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((course) => (
          <motion.div key={course.id} variants={cardVariant}>
            <Link
              href={`/courses/${course.id}`}
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
