"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

export default function UserMenu() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isTeacher = pathname.startsWith("/teacher");

  const displayName = user?.name ?? (isTeacher ? "教师" : "学生");
  const displayEmail = user?.email ?? (isTeacher ? "teacher@edu.cn" : "student@edu.cn");
  const initials = displayName.charAt(0).toUpperCase();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const switchPath = isTeacher ? "/s/courses" : "/teacher/dashboard";
  const switchLabel = isTeacher ? "学生面板" : "教师面板";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-primary-lighter text-xs font-bold text-ink-primary outline-none transition-colors hover:bg-ink-primary/10 cursor-pointer"
      >
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56">
        <DropdownMenuLabel className="px-3 py-2">
          <p className="text-sm font-medium text-ink-text">{displayName}</p>
          <p className="text-xs text-ink-text-muted truncate">{displayEmail}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 cursor-pointer px-3 py-1.5"
          onClick={() => router.push(switchPath)}
        >
          <i className="ri-swap-line text-base text-ink-text-light" />
          <span>{switchLabel}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 cursor-pointer px-3 py-1.5"
          onClick={() =>
            router.push(isTeacher ? "/teacher/settings" : "/s/profile")
          }
        >
          <i className="ri-settings-3-line text-base text-ink-text-light" />
          <span>设置</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 cursor-pointer px-3 py-1.5 text-ink-error focus:text-ink-error"
          onClick={handleLogout}
        >
          <i className="ri-logout-box-r-line text-base" />
          <span>退出登录</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
