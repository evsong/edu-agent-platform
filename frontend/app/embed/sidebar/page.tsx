"use client";

import ChatInterface from "@/components/chat/ChatInterface";

const quickQuestions = [
  "什么是定积分？",
  "帮我批改作业",
  "练习薄弱知识点",
];

export default function SidebarPage() {
  return (
    <div className="flex min-h-screen">
      {/* Main content area */}
      <div className="flex-1 p-6">
        <h2 className="font-heading text-lg font-semibold mb-4">快捷操作</h2>
        <div className="flex flex-wrap gap-2">
          {quickQuestions.map((q) => (
            <button
              key={q}
              className="px-3 py-1.5 bg-[#EEF2FF] text-[#4338CA] text-sm rounded-lg hover:bg-[#E0E7FF] transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Sidebar chat panel */}
      <aside className="w-[380px] shrink-0 border-l border-ink-border bg-white flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-ink-border px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-primary text-white">
            <i className="ri-brain-line text-sm" />
          </div>
          <span className="text-sm font-heading font-semibold text-ink-text">
            AI 助教
          </span>
        </div>
        {/* Chat body */}
        <div className="flex-1 overflow-hidden">
          <ChatInterface courseId="math-101" className="h-full" />
        </div>
      </aside>
    </div>
  );
}
