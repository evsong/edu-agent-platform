import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="max-w-md text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-primary-lighter mb-6">
          <i className="ri-compass-3-line text-3xl text-ink-primary" />
        </div>
        <h1 className="text-6xl font-heading font-bold text-ink-text tracking-tight">
          404
        </h1>
        <p className="mt-3 text-base text-ink-text-muted">
          抱歉，我们没有找到你想访问的页面。
        </p>
        <p className="mt-1 text-sm text-ink-text-light">
          链接可能已经失效，或者你输错了地址。
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/s/courses"
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-primary-dark transition-colors"
          >
            <i className="ri-home-4-line" />
            回到课程
          </Link>
          <Link
            href="/teacher/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-border bg-white px-5 py-2.5 text-sm font-medium text-ink-text hover:bg-ink-surface transition-colors"
          >
            教师仪表盘
          </Link>
        </div>
      </div>
    </div>
  );
}
