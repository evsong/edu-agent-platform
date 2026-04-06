"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CopilotKit } from "@copilotkit/react-core";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import "@copilotkit/react-ui/styles.css";

interface NavItem {
  href: string;
  icon: string;
  label: string;
}

const navItems: NavItem[] = [
  { href: "/s/courses", icon: "ri-book-open-line", label: "课程" },
  { href: "/s/chat", icon: "ri-chat-3-line", label: "答疑" },
  { href: "/s/assignments", icon: "ri-file-edit-line", label: "作业" },
  { href: "/s/practice", icon: "ri-pencil-ruler-2-line", label: "练习" },
  { href: "/s/profile", icon: "ri-user-line", label: "我的" },
];

function StudentNavbar() {
  const pathname = usePathname();

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="sticky top-0 z-40 flex h-14 items-center border-b border-ink-border bg-white/80 backdrop-blur-md px-6"
    >
      {/* Logo */}
      <Link href="/s/courses" className="flex items-center gap-2 mr-8">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-primary text-white">
          <i className="ri-brain-line text-base" />
        </div>
        <span className="text-base font-heading font-bold text-ink-text">
          EduAgent
        </span>
      </Link>

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/s/courses" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "text-ink-primary"
                  : "text-ink-text-muted hover:text-ink-text hover:bg-ink-surface",
              )}
            >
              <i
                className={cn(
                  item.icon,
                  "text-base",
                  isActive ? "text-ink-primary" : "text-ink-text-light",
                )}
              />
              <span>{item.label}</span>
              {isActive && (
                <motion.div
                  layoutId="student-nav-underline"
                  className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-ink-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Right section */}
      <div className="ml-auto flex items-center gap-3">
        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-text-light transition-colors hover:bg-ink-surface hover:text-ink-text">
          <i className="ri-notification-3-line text-lg" />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-primary-lighter text-xs font-bold text-ink-primary">
          S
        </div>
      </div>
    </motion.header>
  );
}

export default function StudentLayout({
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
      <CopilotKit runtimeUrl="/api/copilotkit">
        <div className="min-h-screen bg-white">
          <StudentNavbar />
          <main className="mx-auto max-w-6xl p-6">{children}</main>
        </div>
      </CopilotKit>
    </QueryClientProvider>
  );
}
