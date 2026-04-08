"use client";

import { motion } from "framer-motion";
import ChatInterface from "@/components/chat/ChatInterface";

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

      <div className="flex-1 rounded-xl border border-ink-border bg-white overflow-hidden">
        <ChatInterface courseId="00000000-0000-4000-b000-000000000001" />
      </div>
    </motion.div>
  );
}
