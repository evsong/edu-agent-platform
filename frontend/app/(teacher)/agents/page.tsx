"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { fetchAgents } from "@/lib/queries";
import type { AgentConfig } from "@/lib/queries";
import { cn } from "@/lib/utils";

const mockAgents: AgentConfig[] = [
  {
    id: "agent-1",
    name: "数学答疑助手",
    course_id: "math-101",
    course_name: "高等数学 A",
    status: "running",
    model: "Claude 4 Sonnet",
    temperature: 0.3,
    knowledge_base: "高等数学知识库 (24 知识点)",
    grading_rules: "严格模式 - 步骤评分",
    icon: "ri-calculator-line",
  },
  {
    id: "agent-2",
    name: "物理实验指导",
    course_id: "physics-201",
    course_name: "大学物理 II",
    status: "running",
    model: "Claude 4 Sonnet",
    temperature: 0.5,
    knowledge_base: "大学物理知识库 (18 知识点)",
    grading_rules: "宽松模式 - 结果评分",
    icon: "ri-flask-line",
  },
  {
    id: "agent-3",
    name: "算法题解析",
    course_id: "cs-301",
    course_name: "数据结构与算法",
    status: "configuring",
    model: "GPT-5",
    temperature: 0.2,
    knowledge_base: "配置中...",
    grading_rules: "代码评审模式",
    icon: "ri-code-s-slash-line",
  },
  {
    id: "agent-4",
    name: "统计学辅导",
    course_id: "stat-102",
    course_name: "概率论与数理统计",
    status: "stopped",
    model: "Claude 4 Sonnet",
    temperature: 0.4,
    knowledge_base: "概率论知识库 (12 知识点)",
    grading_rules: "标准模式",
    icon: "ri-pie-chart-line",
  },
];

const statusConfig = {
  running: {
    label: "运行中",
    cls: "bg-ink-success-light text-ink-success",
    dot: "bg-ink-success",
  },
  configuring: {
    label: "配置中",
    cls: "bg-ink-warning-light text-ink-warning",
    dot: "bg-ink-warning",
  },
  stopped: {
    label: "已停止",
    cls: "bg-ink-surface text-ink-text-light",
    dot: "bg-ink-text-light",
  },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 400, damping: 30 },
  },
};

export default function AgentsPage() {
  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: fetchAgents,
    placeholderData: mockAgents,
  });

  const list = agents ?? mockAgents;

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-ink-text">
            Agent 配置
          </h1>
          <p className="mt-1 text-sm text-ink-text-muted">
            管理各课程的 AI Agent 实例
          </p>
        </div>
        <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink-primary px-4 text-sm font-medium text-white transition-colors hover:bg-ink-primary-dark">
          <i className="ri-add-line" />
          新建 Agent
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {list.map((agent) => {
          const status = statusConfig[agent.status];
          return (
            <motion.div
              key={agent.id}
              variants={cardVariant}
              className="group rounded-xl border border-ink-border bg-white p-5 transition-all hover:border-ink-primary/20 hover:shadow-md"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-primary-lighter text-ink-primary">
                    <i className={cn(agent.icon, "text-xl")} />
                  </div>
                  <div>
                    <h3 className="text-base font-heading font-semibold text-ink-text">
                      {agent.name}
                    </h3>
                    <p className="text-xs text-ink-text-muted">
                      {agent.course_name}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold",
                    status.cls,
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      status.dot,
                      agent.status === "running" && "animate-pulse",
                    )}
                  />
                  {status.label}
                </span>
              </div>

              {/* Config Details */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-ink-surface p-2.5">
                  <p className="text-[10px] font-medium text-ink-text-light uppercase tracking-wider">
                    模型
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-ink-text">
                    {agent.model}
                  </p>
                </div>
                <div className="rounded-lg bg-ink-surface p-2.5">
                  <p className="text-[10px] font-medium text-ink-text-light uppercase tracking-wider">
                    温度
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-ink-text">
                    {agent.temperature}
                  </p>
                </div>
                <div className="rounded-lg bg-ink-surface p-2.5">
                  <p className="text-[10px] font-medium text-ink-text-light uppercase tracking-wider">
                    知识库
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-ink-text truncate">
                    {agent.knowledge_base}
                  </p>
                </div>
                <div className="rounded-lg bg-ink-surface p-2.5">
                  <p className="text-[10px] font-medium text-ink-text-light uppercase tracking-wider">
                    评分规则
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-ink-text truncate">
                    {agent.grading_rules}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex gap-2">
                <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-border bg-white px-3 text-xs font-medium text-ink-text transition-colors hover:bg-ink-surface">
                  <i className="ri-settings-3-line text-ink-text-light" />
                  配置
                </button>
                {agent.status === "running" ? (
                  <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-border bg-white px-3 text-xs font-medium text-ink-text transition-colors hover:bg-ink-error-light hover:text-ink-error hover:border-ink-error/20">
                    <i className="ri-stop-circle-line" />
                    停止
                  </button>
                ) : (
                  <button className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink-primary px-3 text-xs font-medium text-white transition-colors hover:bg-ink-primary-dark">
                    <i className="ri-play-circle-line" />
                    启动
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
