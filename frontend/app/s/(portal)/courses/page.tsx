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
];

const mockProgress = [
  { courseId: "math-101", progress: 0.72, nextLesson: "第七章 - 定积分" },
  { courseId: "physics-201", progress: 0.58, nextLesson: "第五章 - 电磁感应" },
  { courseId: "cs-301", progress: 0.85, nextLesson: "第十章 - 动态规划" },
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

export default function StudentCoursesPage() {
  const { data: courses } = useQuery({
    queryKey: ["student-courses"],
    queryFn: fetchCourses,
    placeholderData: mockCourses,
  });

  const list = courses ?? mockCourses;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-heading font-bold text-ink-text">
          我的课程
        </h1>
        <p className="mt-1 text-sm text-ink-text-muted">
          已加入 {list.length} 门课程
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((course) => {
          const progress = mockProgress.find(
            (p) => p.courseId === course.id,
          );
          const pct = progress ? Math.round(progress.progress * 100) : 0;

          return (
            <motion.div key={course.id} variants={cardVariant}>
              <Link
                href={`/s/chat?course=${course.id}`}
                className="group block rounded-xl border border-ink-border bg-white p-5 transition-all hover:border-ink-primary/20 hover:shadow-lg hover:shadow-ink-primary/5"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-primary-lighter text-ink-primary">
                    <i
                      className={`${course.icon || "ri-book-open-line"} text-xl`}
                    />
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

                {/* Progress */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-ink-text-muted">
                      学习进度
                    </span>
                    <span className="text-xs font-heading font-bold text-ink-primary">
                      {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-ink-surface overflow-hidden">
                    <div
                      className="h-full rounded-full bg-ink-primary transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {progress && (
                    <p className="mt-2 text-[11px] text-ink-text-light">
                      <i className="ri-play-circle-line mr-1" />
                      下一节: {progress.nextLesson}
                    </p>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-4 text-xs text-ink-text-light">
                  <span className="flex items-center gap-1">
                    <i className="ri-user-3-line" />
                    {course.student_count} 名同学
                  </span>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
