import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-surface px-4 py-12">
      {/* Logo */}
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-primary text-white">
          <i className="ri-brain-line text-xl" />
        </div>
        <span className="text-xl font-heading font-bold text-ink-text">
          EduAgent
        </span>
      </Link>

      {/* Card */}
      <div className="w-full max-w-md rounded-2xl border border-ink-border bg-white p-8 shadow-sm">
        {children}
      </div>

      <p className="mt-6 text-xs text-ink-text-light">
        可嵌入式跨课程 AI Agent 通用架构平台
      </p>
    </div>
  );
}
