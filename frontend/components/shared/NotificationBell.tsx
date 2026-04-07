"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  text: string;
  time: string;
  read: boolean;
}

const studentNotifications: Notification[] = [
  {
    id: "s1",
    text: "你的第三次作业已批改完成，得分85分",
    time: "2 分钟前",
    read: false,
  },
  {
    id: "s2",
    text: "定积分知识点掌握度提升到72%",
    time: "1 小时前",
    read: false,
  },
  {
    id: "s3",
    text: "新练习题已生成，快来挑战",
    time: "3 小时前",
    read: true,
  },
];

const teacherNotifications: Notification[] = [
  {
    id: "t1",
    text: "张三的作业已批改完成",
    time: "2 分钟前",
    read: false,
  },
  {
    id: "t2",
    text: "李四的掌握度低于 30%，请关注",
    time: "1 小时前",
    read: false,
  },
  {
    id: "t3",
    text: "新课程资料已上传",
    time: "3 小时前",
    read: true,
  },
];

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Determine role from current path
  const isStudent = pathname?.startsWith("/s/") || pathname === "/s";
  const notifications = useMemo(
    () => (isStudent ? studentNotifications : teacherNotifications),
    [isStudent],
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  /* close on outside click */
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
      {/* Bell button */}
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

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-ink-border bg-white shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-border">
            <span className="text-sm font-semibold text-ink-text">通知</span>
            {unreadCount > 0 && (
              <span className="flex h-5 items-center rounded-full bg-ink-error/10 px-2 text-[11px] font-medium text-ink-error">
                {unreadCount} 条未读
              </span>
            )}
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-ink-surface cursor-pointer",
                  !n.read && "bg-ink-primary-lighter/40",
                )}
              >
                <div
                  className={cn(
                    "mt-1 h-2 w-2 shrink-0 rounded-full",
                    n.read ? "bg-transparent" : "bg-ink-primary",
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
              </li>
            ))}
          </ul>
          <div className="border-t border-ink-border px-4 py-2.5">
            <button className="w-full text-center text-xs font-medium text-ink-primary hover:underline">
              查看全部
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
