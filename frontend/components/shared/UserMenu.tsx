"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export default function UserMenu() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isTeacher = pathname.startsWith("/teacher");

  const displayName = user?.name ?? (isTeacher ? "教师" : "学生");
  const displayEmail = user?.email ?? (isTeacher ? "teacher@edu.cn" : "student@edu.cn");
  const initials = displayName.charAt(0).toUpperCase();

  const handleLogout = () => {
    setOpen(false);
    logout();
    router.push("/login");
  };

  const switchPath = isTeacher ? "/s/courses" : "/teacher/dashboard";
  const switchLabel = isTeacher ? "学生面板" : "教师面板";

  const settingsPath = isTeacher ? "/teacher/settings" : "/s/profile";

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
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-primary-lighter text-xs font-bold text-ink-primary outline-none transition-colors hover:bg-ink-primary/10 cursor-pointer"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-ink-border bg-white shadow-lg z-50">
          {/* User info */}
          <div className="px-3 py-2 border-b border-ink-border">
            <p className="text-sm font-medium text-ink-text">{displayName}</p>
            <p className="text-xs text-ink-text-muted truncate">{displayEmail}</p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-ink-text transition-colors hover:bg-ink-surface cursor-pointer"
              onClick={() => {
                setOpen(false);
                router.push(switchPath);
              }}
            >
              <i className="ri-swap-line text-base text-ink-text-light" />
              <span>{switchLabel}</span>
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-ink-text transition-colors hover:bg-ink-surface cursor-pointer"
              onClick={() => {
                setOpen(false);
                router.push(settingsPath);
              }}
            >
              <i className="ri-settings-3-line text-base text-ink-text-light" />
              <span>设置</span>
            </button>
          </div>

          <div className="border-t border-ink-border py-1">
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-ink-error transition-colors hover:bg-ink-error/5 cursor-pointer"
              onClick={handleLogout}
            >
              <i className="ri-logout-box-r-line text-base" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
