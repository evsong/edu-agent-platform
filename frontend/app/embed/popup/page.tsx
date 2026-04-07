"use client";

import { useState } from "react";
import ChatInterface from "@/components/chat/ChatInterface";

export default function PopupPage() {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen">
      {/* Floating chat panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 flex h-[480px] w-[360px] flex-col overflow-hidden rounded-2xl border border-ink-border bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-ink-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-primary text-white">
                <i className="ri-brain-line text-sm" />
              </div>
              <span className="text-sm font-heading font-semibold text-ink-text">
                AI 助教
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-text-light transition-colors hover:bg-ink-surface hover:text-ink-text"
            >
              <i className="ri-close-line text-lg" />
            </button>
          </div>
          {/* Chat body */}
          <div className="flex-1 overflow-hidden">
            <ChatInterface courseId="math-101" className="h-full" />
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
