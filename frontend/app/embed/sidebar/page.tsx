"use client";

import { CopilotSidebar } from "@copilotkit/react-ui";

const quickQuestions = [
  "什么是定积分？",
  "帮我批改作业",
  "练习薄弱知识点",
];

export default function SidebarPage() {
  return (
    <CopilotSidebar
      labels={{
        title: "AI 助教",
        initial: "你好！我是高数 AI 助教。",
        placeholder: "输入问题...",
      }}
      defaultOpen={true}
      instructions="你是 EduAgent 平台的 AI 助教。用中文回答学生问题。帮助学生理解知识点，解答疑问，提供练习建议。回答要清晰、有条理，适当使用公式和例子。"
    >
      <div className="p-6">
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
    </CopilotSidebar>
  );
}
