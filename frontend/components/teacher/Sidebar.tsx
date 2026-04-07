"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  icon: string;
  label: string;
  badge?: number;
  badgeColor?: string;
  children?: { href: string; label: string }[];
}

const navItems: NavItem[] = [
  {
    href: "/teacher/dashboard",
    icon: "ri-dashboard-3-line",
    label: "仪表盘",
  },
  {
    href: "/teacher/courses",
    icon: "ri-book-open-line",
    label: "课程管理",
    children: [
      { href: "/teacher/courses", label: "全部课程" },
    ],
  },
  {
    href: "/teacher/agents",
    icon: "ri-robot-2-line",
    label: "Agent 配置",
  },
  {
    href: "/teacher/grading",
    icon: "ri-file-check-line",
    label: "批改队列",
    badge: 12,
    badgeColor: "bg-ink-primary",
  },
  {
    href: "/teacher/warnings",
    icon: "ri-alarm-warning-line",
    label: "预警中心",
    badge: 3,
    badgeColor: "bg-ink-error",
  },
  {
    href: "/teacher/settings",
    icon: "ri-settings-3-line",
    label: "设置",
  },
];

function SidebarItem({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive =
    pathname === item.href ||
    (item.href !== "/teacher/dashboard" && pathname.startsWith(item.href));

  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
          isActive
            ? "bg-ink-primary text-white shadow-sm shadow-ink-primary/20"
            : "text-ink-text-muted hover:bg-ink-surface hover:text-ink-text",
        )}
      >
        <i
          className={cn(
            item.icon,
            "text-lg transition-colors",
            isActive ? "text-white" : "text-ink-text-light group-hover:text-ink-primary",
          )}
        />
        <span className="flex-1">{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className={cn(
              "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white",
              isActive ? "bg-white/25" : item.badgeColor,
            )}
          >
            {item.badge}
          </span>
        )}
      </Link>
    </li>
  );
}

export default function Sidebar() {
  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="fixed inset-y-0 left-0 z-40 flex w-[200px] flex-col border-r border-ink-border bg-white"
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-ink-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-primary text-white">
          <i className="ri-brain-line text-base" />
        </div>
        <span className="text-base font-heading font-bold text-ink-text">
          EduAgent
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <SidebarItem key={item.href} item={item} />
          ))}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-ink-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-primary-lighter text-ink-primary">
            <i className="ri-user-3-line text-sm" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-ink-text">
              教师
            </p>
            <p className="truncate text-xs text-ink-text-light">
              teacher@edu.cn
            </p>
          </div>
        </div>
      </div>
    </motion.aside>
  );
}
