"use client";

import { useRef } from "react";
import { useSearchParams } from "next/navigation";
import ChatInterface, { type ChatInterfaceHandle } from "@/components/chat/ChatInterface";

const COURSE_NAMES: Record<string, string> = {
  "math-101": "高等数学 A",
  "cs-201": "数据结构与算法",
  "phy-101": "大学物理",
  "eng-101": "大学英语",
};

const quickActions = [
  { label: "什么是定积分？", icon: "ri-question-line" },
  { label: "帮我批改作业", icon: "ri-file-edit-line" },
  { label: "练习薄弱知识点", icon: "ri-focus-3-line" },
  { label: "总结本章重点", icon: "ri-book-open-line" },
];

export default function SidebarPage() {
  const chatRef = useRef<ChatInterfaceHandle>(null);
  const searchParams = useSearchParams();
  const courseId = searchParams.get("course_id") || "math-101";
  const courseName = COURSE_NAMES[courseId] || courseId;

  const handleQuickAction = (text: string) => {
    chatRef.current?.sendMessage(text);
  };

  return (
    <div className="flex h-screen w-[380px] flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-ink-border px-4 py-3 bg-gradient-to-r from-ink-primary to-ink-primary-light">
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

      {/* Quick actions */}
      <div className="border-b border-ink-border px-4 py-3">
        <p className="text-[11px] font-medium text-ink-text-muted mb-2">快捷操作</p>
        <div className="flex flex-wrap gap-1.5">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => handleQuickAction(action.label)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-ink-primary-lighter text-ink-primary text-xs rounded-lg hover:bg-[#E0E7FF] transition-colors"
            >
              <i className={`${action.icon} text-[11px]`} />
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chat body */}
      <div className="flex-1 overflow-hidden">
        <ChatInterface ref={chatRef} courseId={courseId} className="h-full" />
      </div>
    </div>
  );
}
