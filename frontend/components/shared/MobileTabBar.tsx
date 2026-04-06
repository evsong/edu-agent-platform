"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

interface Tab {
  href: string;
  icon: string;
  activeIcon: string;
  label: string;
}

interface Props {
  tabs: Tab[];
}

export function MobileTabBar({ tabs }: Props) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 md:hidden z-50">
      <div className="flex">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center py-2 text-[10px] ${
                isActive ? "text-[#4338CA]" : "text-[#9CA3AF]"
              }`}
            >
              <i
                className={`${isActive ? tab.activeIcon : tab.icon} text-xl mb-0.5`}
              />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
