"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { fetchAgents, fetchCourses } from "@/lib/queries";
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

interface EditForm {
  model: string;
  temperature: number;
  knowledge_base: string;
  grading_rules: string;
}

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ model: "", temperature: 0.3, knowledge_base: "", grading_rules: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", course_id: "", agent_id: "qa", model: "GPT-5.4", temperature: 0.3, knowledge_base: "", grading_rules: "", icon: "ri-robot-2-line" });

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: fetchAgents,
    placeholderData: mockAgents,
  });

  const { data: courses } = useQuery({
    queryKey: ["courses-for-agent"],
    queryFn: fetchCourses,
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/agents/${id}/toggle`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<EditForm> }) =>
      apiFetch(`/api/agents/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setEditingId(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof createForm) =>
      apiFetch("/api/agents", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setShowCreate(false);
      setCreateForm({ name: "", course_id: "", agent_id: "qa", model: "GPT-5.4", temperature: 0.3, knowledge_base: "", grading_rules: "", icon: "ri-robot-2-line" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/agents/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
  });

  const list = agents ?? mockAgents;

  const startEdit = (agent: AgentConfig) => {
    setEditingId(agent.id);
    setEditForm({ model: agent.model, temperature: agent.temperature, knowledge_base: agent.knowledge_base, grading_rules: agent.grading_rules });
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-heading font-bold text-ink-text">
            Agent 配置
          </h1>
          <p className="mt-1 text-sm text-ink-text-muted">
            管理各课程的 AI Agent 实例
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink-primary px-4 text-sm font-medium text-white transition-colors hover:bg-ink-primary-dark self-start sm:self-auto"
        >
          <i className={showCreate ? "ri-close-line" : "ri-add-line"} />
          {showCreate ? "取消" : "新建 Agent"}
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden rounded-xl border border-ink-primary/20 bg-ink-primary-lighter/30 p-5"
          >
            <h3 className="text-sm font-heading font-semibold text-ink-text mb-3">创建新 Agent</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-[10px] font-medium text-ink-text-light uppercase">名称</label>
                <input className="mt-1 w-full rounded-lg border border-ink-border px-3 py-1.5 text-sm" value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} placeholder="数学答疑助手" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-ink-text-light uppercase">课程</label>
                <select className="mt-1 w-full rounded-lg border border-ink-border px-3 py-1.5 text-sm" value={createForm.course_id} onChange={(e) => setCreateForm((f) => ({ ...f, course_id: e.target.value }))}>
                  <option value="">选择课程</option>
                  {(courses || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium text-ink-text-light uppercase">Agent 类型</label>
                <select className="mt-1 w-full rounded-lg border border-ink-border px-3 py-1.5 text-sm" value={createForm.agent_id} onChange={(e) => setCreateForm((f) => ({ ...f, agent_id: e.target.value }))}>
                  <option value="qa">QA 答疑</option>
                  <option value="grader">批改</option>
                  <option value="tutor">辅导</option>
                  <option value="analyst">分析</option>
                  <option value="meta">元配置</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium text-ink-text-light uppercase">模型</label>
                <select className="mt-1 w-full rounded-lg border border-ink-border px-3 py-1.5 text-sm" value={createForm.model} onChange={(e) => setCreateForm((f) => ({ ...f, model: e.target.value }))}>
                  <option value="GPT-5.4">GPT-5.4</option>
                  <option value="Claude 4 Sonnet">Claude 4 Sonnet</option>
                  <option value="GPT-5">GPT-5</option>
                </select>
              </div>
            </div>
            <button
              onClick={() => createForm.name && createForm.course_id && createMutation.mutate(createForm)}
              disabled={!createForm.name || !createForm.course_id || createMutation.isPending}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink-primary px-4 text-xs font-medium text-white hover:bg-ink-primary-dark disabled:opacity-50"
            >
              {createMutation.isPending ? <><i className="ri-loader-4-line animate-spin" /> 创建中...</> : <><i className="ri-add-line" /> 创建</>}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {list.map((agent) => {
          const status = statusConfig[agent.status] || { label: "未知", cls: "bg-ink-surface text-ink-text-light", dot: "bg-ink-text-light" };
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
                <button
                  onClick={() => editingId === agent.id ? setEditingId(null) : startEdit(agent)}
                  className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors", editingId === agent.id ? "border-ink-primary bg-ink-primary-lighter text-ink-primary" : "border-ink-border bg-white text-ink-text hover:bg-ink-surface")}
                >
                  <i className={editingId === agent.id ? "ri-close-line" : "ri-settings-3-line"} />
                  {editingId === agent.id ? "取消" : "配置"}
                </button>
                {agent.status === "running" ? (
                  <button
                    onClick={() => toggleMutation.mutate(agent.id)}
                    disabled={toggleMutation.isPending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-border bg-white px-3 text-xs font-medium text-ink-text transition-colors hover:bg-ink-error-light hover:text-ink-error hover:border-ink-error/20 disabled:opacity-50"
                  >
                    <i className="ri-stop-circle-line" />
                    停止
                  </button>
                ) : (
                  <button
                    onClick={() => toggleMutation.mutate(agent.id)}
                    disabled={toggleMutation.isPending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink-primary px-3 text-xs font-medium text-white transition-colors hover:bg-ink-primary-dark disabled:opacity-50"
                  >
                    <i className="ri-play-circle-line" />
                    启动
                  </button>
                )}
                <button
                  onClick={() => { if (confirm(`确定删除 ${agent.name}？`)) deleteMutation.mutate(agent.id); }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink-border bg-white px-3 text-xs font-medium text-ink-text-light transition-colors hover:bg-ink-error-light hover:text-ink-error hover:border-ink-error/20"
                >
                  <i className="ri-delete-bin-line" />
                </button>
              </div>

              {/* Inline edit form */}
              <AnimatePresence>
                {editingId === agent.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 overflow-hidden rounded-lg border border-ink-border bg-ink-surface p-3"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-medium text-ink-text-light uppercase">模型</label>
                        <select className="mt-1 w-full rounded-lg border border-ink-border bg-white px-2 py-1 text-xs" value={editForm.model} onChange={(e) => setEditForm((f) => ({ ...f, model: e.target.value }))}>
                          <option>GPT-5.4</option>
                          <option>Claude 4 Sonnet</option>
                          <option>GPT-5</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-ink-text-light uppercase">温度</label>
                        <input type="number" step="0.1" min="0" max="2" className="mt-1 w-full rounded-lg border border-ink-border bg-white px-2 py-1 text-xs" value={editForm.temperature} onChange={(e) => setEditForm((f) => ({ ...f, temperature: parseFloat(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-ink-text-light uppercase">知识库</label>
                        <input className="mt-1 w-full rounded-lg border border-ink-border bg-white px-2 py-1 text-xs" value={editForm.knowledge_base} onChange={(e) => setEditForm((f) => ({ ...f, knowledge_base: e.target.value }))} />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-ink-text-light uppercase">评分规则</label>
                        <input className="mt-1 w-full rounded-lg border border-ink-border bg-white px-2 py-1 text-xs" value={editForm.grading_rules} onChange={(e) => setEditForm((f) => ({ ...f, grading_rules: e.target.value }))} />
                      </div>
                    </div>
                    <button
                      onClick={() => updateMutation.mutate({ id: agent.id, data: editForm })}
                      disabled={updateMutation.isPending}
                      className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-lg bg-ink-primary px-3 text-xs font-medium text-white hover:bg-ink-primary-dark disabled:opacity-50"
                    >
                      {updateMutation.isPending ? <><i className="ri-loader-4-line animate-spin" /> 保存中...</> : <><i className="ri-check-line" /> 保存</>}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
