"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import ChatInterface from "@/components/chat/ChatInterface";
import { fetchCourses } from "@/lib/queries";
import { cn } from "@/lib/utils";

function ChatPageContent() {
  const searchParams = useSearchParams();
  const urlCourseId = searchParams.get("course");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");

  const { data: courses } = useQuery({
    queryKey: ["courses"],
    queryFn: fetchCourses,
  });
  const list = courses ?? [];

  // Pick initial course: URL param first, then first enrolled course
  useEffect(() => {
    if (selectedCourseId) return;
    if (urlCourseId && list.some((c) => c.id === urlCourseId)) {
      setSelectedCourseId(urlCourseId);
    } else if (list.length > 0) {
      setSelectedCourseId(list[0].id);
    }
  }, [urlCourseId, list, selectedCourseId]);

  const selectedCourse = list.find((c) => c.id === selectedCourseId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex flex-col"
      style={{ height: "calc(100vh - 10rem)" }}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-ink-text">
            AI 助教
          </h1>
          <p className="mt-1 text-sm text-ink-text-muted">
            {selectedCourse
              ? `当前课程：${selectedCourse.name} · AI 将基于该课程的教材与知识库作答`
              : "随时提问，获得个性化学习帮助"}
          </p>
        </div>
        {list.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {list.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCourseId(c.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  selectedCourseId === c.id
                    ? "border-ink-primary bg-ink-primary text-white"
                    : "border-ink-border bg-white text-ink-text hover:border-ink-primary/40",
                )}
              >
                <i className={cn(c.icon || "ri-book-line", "text-sm")} />
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 rounded-xl border border-ink-border bg-white overflow-hidden">
        {selectedCourseId ? (
          <ChatInterface key={selectedCourseId} courseId={selectedCourseId} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-text-muted">
            正在加载课程...
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-8 text-ink-text-muted">加载中...</div>}>
      <ChatPageContent />
    </Suspense>
  );
}
