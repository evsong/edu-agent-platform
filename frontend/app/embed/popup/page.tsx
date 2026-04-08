"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import ChatInterface from "@/components/chat/ChatInterface";

const COURSE_NAMES: Record<string, string> = {
  "math-101": "高等数学 A",
  "cs-201": "数据结构与算法",
  "phy-101": "大学物理",
  "eng-101": "大学英语",
};

export default function PopupPage() {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const courseId = searchParams.get("course_id") || "math-101";
  const courseName = COURSE_NAMES[courseId] || courseId;

  return (
    <div className="min-h-screen bg-transparent">
      {/* Floating chat panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 flex h-[480px] w-[360px] flex-col overflow-hidden rounded-2xl border border-ink-border bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-ink-border px-4 py-3 bg-gradient-to-r from-ink-primary to-ink-primary-light">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white">
                <i className="ri-brain-line text-sm" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-white">
                  EduAgent 智能助教
                </span>
                <span className="text-[10px] text-white/70">
                  {courseName}
                </span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <i className="ri-close-line text-lg" />
            </button>
          </div>
          {/* Chat body */}
          <div className="flex-1 overflow-hidden">
            <ChatInterface courseId={courseId} className="h-full" />
          </div>
        </div>
      )}

      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-ink-primary text-white shadow-lg transition-all hover:bg-ink-primary-dark hover:shadow-xl active:scale-95"
      >
        <i
          className={`text-xl ${open ? "ri-close-line" : "ri-chat-smile-3-fill"}`}
        />
      </button>
    </div>
  );
}
