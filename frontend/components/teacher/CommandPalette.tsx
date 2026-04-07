"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  icon: string;
  label: string;
  shortcut?: string;
  action: () => void;
  isAI?: boolean;
  group: string;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Global keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navigate = useCallback(
    (path: string) => {
      router.push(path);
      setOpen(false);
    },
    [router],
  );

  const commands: CommandItem[] = [
    {
      id: "dashboard",
      icon: "ri-dashboard-3-line",
      label: "仪表盘",
      action: () => navigate("/teacher/dashboard"),
      group: "导航",
    },
    {
      id: "courses",
      icon: "ri-book-open-line",
      label: "课程管理",
      action: () => navigate("/teacher/courses"),
      group: "导航",
    },
    {
      id: "grading",
      icon: "ri-file-check-line",
      label: "批改队列",
      action: () => navigate("/teacher/grading"),
      group: "导航",
    },
    {
      id: "agents",
      icon: "ri-robot-2-line",
      label: "Agent 配置",
      action: () => navigate("/teacher/agents"),
      group: "导航",
    },
    {
      id: "warnings",
      icon: "ri-alarm-warning-line",
      label: "预警中心",
      action: () => navigate("/teacher/warnings"),
      group: "导航",
    },
    {
      id: "settings",
      icon: "ri-settings-3-line",
      label: "设置",
      action: () => navigate("/teacher/settings"),
      group: "导航",
    },
    {
      id: "ai-report",
      icon: "ri-file-chart-line",
      label: "生成学情报告",
      action: () => {
        setOpen(false);
      },
      isAI: true,
      group: "AI 指令",
    },
    {
      id: "ai-grade-all",
      icon: "ri-robot-2-line",
      label: "批改所有作业",
      action: () => {
        navigate("/teacher/grading");
      },
      isAI: true,
      group: "AI 指令",
    },
  ];

  const groups = Array.from(new Set(commands.map((c) => c.group)));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
      />

      {/* Command dialog */}
      <div className="absolute left-1/2 top-[20%] -translate-x-1/2 w-full max-w-lg">
        <Command
          className="overflow-hidden rounded-xl border border-ink-border bg-white shadow-2xl shadow-black/10"
          loop
        >
          <div className="flex items-center border-b border-ink-border px-4">
            <i className="ri-search-line text-ink-text-light mr-3" />
            <Command.Input
              placeholder="输入命令或搜索..."
              className="h-12 flex-1 bg-transparent text-sm text-ink-text outline-none placeholder:text-ink-text-light"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-ink-border bg-ink-surface px-1.5 text-[10px] font-medium text-ink-text-light">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-72 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-ink-text-muted">
              未找到相关命令
            </Command.Empty>

            {groups.map((group) => (
              <Command.Group
                key={group}
                heading={group}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-text-light"
              >
                {commands
                  .filter((c) => c.group === group)
                  .map((cmd) => (
                    <Command.Item
                      key={cmd.id}
                      value={cmd.label}
                      onSelect={cmd.action}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-text",
                        "aria-selected:bg-ink-primary-lighter aria-selected:text-ink-primary",
                        "transition-colors",
                      )}
                    >
                      <i
                        className={cn(
                          cmd.icon,
                          "text-base",
                          cmd.isAI ? "text-ink-primary" : "text-ink-text-light",
                        )}
                      />
                      <span className="flex-1">{cmd.label}</span>
                      {cmd.isAI && (
                        <span className="inline-flex items-center rounded-md bg-ink-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-ink-primary">
                          AI
                        </span>
                      )}
                      {cmd.shortcut && (
                        <kbd className="text-[10px] text-ink-text-light">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </Command.Item>
                  ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
