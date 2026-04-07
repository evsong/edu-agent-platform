"use client";

import { CopilotPopup } from "@copilotkit/react-ui";

export default function PopupPage() {
  return (
    <div className="min-h-screen">
      <CopilotPopup
        labels={{
          title: "AI 助教",
          initial: "你好！有什么可以帮你的？",
          placeholder: "输入问题...",
        }}
        defaultOpen={false}
        instructions="你是 EduAgent 平台的 AI 助教。用中文回答学生问题。帮助学生理解知识点，解答疑问，提供练习建议。回答要清晰、有条理，适当使用公式和例子。"
      />
    </div>
  );
}
