"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const features = [
  {
    icon: "ri-robot-2-line",
    title: "多Agent编排",
    desc: "基于有向无环图的多Agent协作引擎，支持苏格拉底式追问、脚手架提示、直接讲解等多种教学策略动态切换。",
    color: "bg-ink-primary-lighter text-ink-primary",
  },
  {
    icon: "ri-edit-2-line",
    title: "位置级批注",
    desc: "精确到代码行、公式符号、段落语句的智能批注系统，将AI反馈锚定到学生作业的具体位置。",
    color: "bg-ink-success-light text-ink-success",
  },
  {
    icon: "ri-node-tree",
    title: "知识图谱",
    desc: "自动构建课程知识图谱，追踪学生知识掌握状态，利用BKT模型实现个性化学习路径推荐。",
    color: "bg-ink-warning-light text-ink-warning",
  },
  {
    icon: "ri-plug-line",
    title: "即插即用",
    desc: "通过LTI协议与主流LMS无缝集成，支持Chrome扩展嵌入、钉钉/飞书机器人等多种接入方式。",
    color: "bg-ink-error-light text-ink-error",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 border-b border-ink-border bg-white/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-primary text-white">
              <i className="ri-brain-line text-lg" />
            </div>
            <span className="text-lg font-heading font-bold text-ink-text">
              EduAgent
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              className="text-sm font-medium text-ink-text-muted transition-colors hover:text-ink-primary"
            >
              功能
            </a>
            <a
              href="#architecture"
              className="text-sm font-medium text-ink-text-muted transition-colors hover:text-ink-primary"
            >
              架构
            </a>
            <a
              href="#demo"
              className="text-sm font-medium text-ink-text-muted transition-colors hover:text-ink-primary"
            >
              演示
            </a>
            <a
              href="#docs"
              className="text-sm font-medium text-ink-text-muted transition-colors hover:text-ink-primary"
            >
              文档
            </a>
          </div>

          {/* Auth Buttons */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-ink-text-muted transition-colors hover:text-ink-primary sm:inline-block"
            >
              登录
            </Link>
            <Link
              href="/register"
              className="inline-flex h-9 items-center rounded-lg bg-ink-primary px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ink-primary-dark"
            >
              免费注册
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Hero ── */}
      <main className="flex-1">
        <section className="relative overflow-hidden py-20 sm:py-32">
          {/* Subtle gradient blob */}
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-br from-ink-primary-lighter via-white to-white opacity-60 blur-3xl" />

          <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              custom={0}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-primary/20 bg-ink-primary-lighter px-4 py-1.5 text-xs font-semibold text-ink-primary">
                <i className="ri-sparkling-2-fill text-sm" />
                可嵌入式跨课程 AI Agent 通用架构平台
              </span>
            </motion.div>

            <motion.h1
              className="mx-auto mt-6 max-w-3xl text-4xl font-heading font-extrabold leading-tight tracking-tight text-ink-text sm:text-5xl lg:text-6xl"
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              custom={1}
            >
              让每门课程都拥有
              <br />
              <span className="text-ink-primary">AI 智能助教</span>
            </motion.h1>

            <motion.p
              className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-text-muted"
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              custom={2}
            >
              基于多Agent编排引擎，提供位置级批注、知识图谱追踪、自适应学习路径，
              助力教师高效教学，让学生获得个性化AI辅导体验。
            </motion.p>

            <motion.div
              className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              custom={3}
            >
              <a
                href="#demo"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-ink-primary px-6 text-base font-semibold text-white shadow-lg shadow-ink-primary/25 transition-all hover:bg-ink-primary-dark hover:shadow-xl hover:shadow-ink-primary/30"
              >
                <i className="ri-play-circle-line text-xl" />
                观看演示
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-ink-border bg-white px-6 text-base font-semibold text-ink-text transition-all hover:border-ink-primary/30 hover:bg-ink-primary-lighter"
              >
                <i className="ri-github-fill text-xl" />
                查看源码
              </a>
            </motion.div>
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="bg-ink-surface py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-heading font-bold tracking-tight text-ink-text sm:text-4xl">
                核心能力
              </h2>
              <p className="mt-4 text-lg text-ink-text-muted">
                从Agent编排到知识追踪，覆盖教学全流程
              </p>
            </div>

            <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  className="group relative rounded-2xl border border-ink-border bg-white p-6 transition-all hover:border-ink-primary/20 hover:shadow-lg hover:shadow-ink-primary/5"
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-60px" }}
                  variants={fadeUp}
                  custom={i}
                >
                  <div
                    className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${f.color}`}
                  >
                    <i className={`${f.icon} text-2xl`} />
                  </div>
                  <h3 className="text-lg font-heading font-semibold text-ink-text">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-text-muted">
                    {f.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Architecture Teaser ── */}
        <section id="architecture" className="py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-heading font-bold tracking-tight text-ink-text sm:text-4xl">
              六模块微服务架构
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-text-muted">
              Agent SDK、知识服务、批注引擎、分析引擎、平台集成、前端门户 —
              松耦合、高内聚、按需扩展。
            </p>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
              {[
                { label: "M1 Agent SDK", icon: "ri-cpu-line" },
                { label: "M2 知识服务", icon: "ri-book-open-line" },
                { label: "M3 平台集成", icon: "ri-links-line" },
                { label: "M4 前端门户", icon: "ri-layout-4-line" },
                { label: "M5 批注引擎", icon: "ri-markup-line" },
                { label: "M6 分析引擎", icon: "ri-line-chart-line" },
              ].map((m) => (
                <span
                  key={m.label}
                  className="inline-flex items-center gap-2 rounded-full border border-ink-border bg-white px-4 py-2 text-sm font-medium text-ink-text shadow-sm"
                >
                  <i className={`${m.icon} text-ink-primary`} />
                  {m.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="border-t border-ink-border bg-ink-primary-lighter py-16">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-2xl font-heading font-bold text-ink-text sm:text-3xl">
              准备好开始了吗？
            </h2>
            <p className="mt-3 text-ink-text-muted">
              注册教师账号，3分钟内为你的课程部署AI助教。
            </p>
            <Link
              href="/register"
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-ink-primary px-8 text-base font-semibold text-white shadow-lg shadow-ink-primary/25 transition-all hover:bg-ink-primary-dark"
            >
              <i className="ri-rocket-2-line text-xl" />
              立即开始
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-ink-border bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ink-primary text-white">
                <i className="ri-brain-line text-sm" />
              </div>
              <span className="text-sm font-heading font-semibold text-ink-text">
                EduAgent
              </span>
            </div>
            <p className="text-sm text-ink-text-light">
              A25 参赛作品 &middot; 可嵌入式跨课程 AI Agent 通用架构平台
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
