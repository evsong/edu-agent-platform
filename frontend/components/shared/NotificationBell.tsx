"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

interface NotificationItem {
  id: string;
  type: "grading" | "assignment" | "warning" | "submission";
  text: string;
  link: string;
  timestamp: string;
  time: string;
  read: boolean;
}

interface NotificationFeed {
  items: NotificationItem[];
  unread_count: number;
}

const LAST_SEEN_KEY = "notifications_last_seen";

const typeIconMap: Record<NotificationItem["type"], string> = {
  grading: "ri-checkbox-circle-line",
  assignment: "ri-file-edit-line",
  warning: "ri-error-warning-line",
  submission: "ri-inbox-line",
};

const typeColorMap: Record<NotificationItem["type"], string> = {
  grading: "text-ink-success",
  assignment: "text-ink-primary",
  warning: "text-ink-error",
  submission: "text-ink-warning",
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  // Read last-seen timestamp once (localStorage); undefined until mounted
  // to avoid SSR hydration mismatch.
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  useEffect(() => {
    setLastSeen(localStorage.getItem(LAST_SEEN_KEY));
  }, []);

  const { data } = useQuery({
    queryKey: ["notifications", lastSeen ?? "initial"],
    queryFn: () =>
      apiFetch<NotificationFeed>(
        lastSeen
          ? `/api/notifications?since=${encodeURIComponent(lastSeen)}`
          : "/api/notifications",
      ),
    refetchInterval: 60_000,
  });

  const items = data?.items ?? [];
  const unreadCount = data?.unread_count ?? 0;

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    localStorage.setItem(LAST_SEEN_KEY, now);
    setLastSeen(now);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    setOpen(false);
  }, [queryClient]);

  const openItem = useCallback(
    (item: NotificationItem) => {
      setOpen(false);
      router.push(item.link);
    },
    [router],
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-ink-text-light transition-colors hover:bg-ink-surface hover:text-ink-text"
      >
        <i className="ri-notification-3-line text-lg" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink-error px-1 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-ink-border bg-white shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-border">
            <span className="text-sm font-semibold text-ink-text">通知</span>
            {unreadCount > 0 && (
              <span className="flex h-5 items-center rounded-full bg-ink-error/10 px-2 text-[11px] font-medium text-ink-error">
                {unreadCount} 条未读
              </span>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-xs text-ink-text-light">
                暂无新通知
              </li>
            ) : (
              items.map((n) => (
                <li
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-ink-surface cursor-pointer",
                    !n.read && "bg-ink-primary-lighter/40",
                  )}
                >
                  <i
                    className={cn(
                      typeIconMap[n.type],
                      typeColorMap[n.type],
                      "mt-0.5 text-base shrink-0",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink-text leading-snug">
                      {n.text}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-text-light">
                      {n.time}
                    </p>
                  </div>
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ink-primary" />
                  )}
                </li>
              ))
            )}
          </ul>
          {items.length > 0 && (
            <div className="border-t border-ink-border px-4 py-2.5">
              <button
                onClick={markAllRead}
                className="w-full text-center text-xs font-medium text-ink-primary hover:underline"
              >
                {unreadCount > 0 ? "全部标为已读" : "关闭"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
