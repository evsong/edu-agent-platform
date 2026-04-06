"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import Sidebar from "@/components/teacher/Sidebar";
import CommandPalette from "@/components/teacher/CommandPalette";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen bg-white">
        <Sidebar />

        {/* Main content */}
        <div className="flex-1 ml-[200px]">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-border bg-white/80 px-6 backdrop-blur-md">
            <div />
            <button
              className="flex items-center gap-2 rounded-lg border border-ink-border bg-ink-surface px-3 py-1.5 text-xs text-ink-text-light transition-colors hover:border-ink-primary/30 hover:text-ink-text"
              onClick={() => {
                // Trigger CMD+K
                document.dispatchEvent(
                  new KeyboardEvent("keydown", {
                    key: "k",
                    metaKey: true,
                    bubbles: true,
                  }),
                );
              }}
            >
              <i className="ri-search-line" />
              <span>搜索...</span>
              <kbd className="ml-4 hidden rounded border border-ink-border bg-white px-1 text-[10px] font-medium sm:inline">
                ⌘K
              </kbd>
            </button>
          </header>

          {/* Page content */}
          <main className="p-6">{children}</main>
        </div>
      </div>

      <CommandPalette />
    </QueryClientProvider>
  );
}
