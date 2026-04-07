"use client";

import { CopilotChat } from "@copilotkit/react-ui";
import type { CopilotKitCSSProperties } from "@copilotkit/react-ui";
import { motion } from "framer-motion";

const chatStyle: CopilotKitCSSProperties = {
  "--copilot-kit-primary-color": "#4338CA",
  "--copilot-kit-contrast-color": "#FFFFFF",
  "--copilot-kit-background-color": "#FFFFFF",
  "--copilot-kit-input-background-color": "#FAFAFA",
  "--copilot-kit-secondary-color": "#F3F4F6",
  "--copilot-kit-secondary-contrast-color": "#1F2937",
  "--copilot-kit-separator-color": "#F3F4F6",
  "--copilot-kit-muted-color": "#9CA3AF",
};

export default function ChatPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex flex-col"
      style={{ height: "calc(100vh - 10rem)" }}
    >
      <div className="mb-4">
        <h1 className="text-2xl font-heading font-bold text-ink-text">
          AI 助教
        </h1>
        <p className="mt-1 text-sm text-ink-text-muted">
          随时提问，获得个性化学习帮助
        </p>
      </div>

      <div
        className="flex-1 rounded-xl border border-ink-border bg-white overflow-hidden"
        style={chatStyle}
      >
        <CopilotChat
          labels={{
            title: "AI 助教",
            initial:
              "你好！我是你的 AI 助教，可以帮你答疑、批改作业和生成练习。",
            placeholder: "输入你的问题...",
          }}
          instructions="你是 EduAgent 平台的 AI 助教。用中文回答学生问题。帮助学生理解知识点，解答疑问，提供练习建议。回答要清晰、有条理，适当使用公式和例子。"
        />
      </div>
    </motion.div>
  );
}
