"use client";

import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface PlatformSettings {
  default_model: string;
  knowledge_graph_enabled: boolean;
  bkt_tracking_enabled: boolean;
}

const MODEL_OPTIONS = [
  "GPT-5.4",
  "Claude Opus 4.6",
  "Gemini 3 Pro",
  "DeepSeek V4",
];

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-ink-primary" : "bg-ink-border",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export default function TeacherSettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => apiFetch<PlatformSettings>("/api/settings"),
  });

  const patchMutation = useMutation({
    mutationFn: (update: Partial<PlatformSettings>) =>
      apiFetch<PlatformSettings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(update),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(["platform-settings"], next);
    },
  });

  const resolved: PlatformSettings = settings ?? {
    default_model: "GPT-5.4",
    knowledge_graph_enabled: true,
    bkt_tracking_enabled: true,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-heading font-bold text-ink-text">设置</h1>
        <p className="mt-1 text-sm text-ink-text-muted">
          管理你的账户和平台偏好
        </p>
      </div>

      {/* Profile card */}
      <div className="rounded-xl border border-ink-border bg-white p-6 space-y-4">
        <h2 className="text-base font-heading font-semibold text-ink-text">
          个人信息
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs text-ink-text-muted">姓名</label>
            <p className="mt-1 text-sm font-medium text-ink-text">
              {user?.name ?? "教师"}
            </p>
          </div>
          <div>
            <label className="text-xs text-ink-text-muted">邮箱</label>
            <p className="mt-1 text-sm font-medium text-ink-text">
              {user?.email ?? "teacher@edu.cn"}
            </p>
          </div>
          <div>
            <label className="text-xs text-ink-text-muted">角色</label>
            <p className="mt-1 text-sm font-medium text-ink-text">
              {user?.role === "teacher" ? "教师" : "学生"}
            </p>
          </div>
        </div>
      </div>

      {/* Agent config */}
      <div className="rounded-xl border border-ink-border bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-heading font-semibold text-ink-text">
            AI Agent 全局设置
          </h2>
          {patchMutation.isPending && (
            <span className="text-xs text-ink-text-muted">保存中...</span>
          )}
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink-text">默认模型</p>
              <p className="text-xs text-ink-text-muted">
                用于答疑和批改的 LLM 模型
              </p>
            </div>
            <select
              value={resolved.default_model}
              onChange={(e) =>
                patchMutation.mutate({ default_model: e.target.value })
              }
              className="rounded-lg border border-ink-border bg-white px-3 py-1.5 text-xs font-medium text-ink-text focus:border-ink-primary focus:outline-none"
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink-text">知识图谱</p>
              <p className="text-xs text-ink-text-muted">跨课程知识关联引擎</p>
            </div>
            <Toggle
              checked={resolved.knowledge_graph_enabled}
              onChange={(v) =>
                patchMutation.mutate({ knowledge_graph_enabled: v })
              }
              disabled={patchMutation.isPending}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink-text">BKT 学情追踪</p>
              <p className="text-xs text-ink-text-muted">贝叶斯知识追踪模型</p>
            </div>
            <Toggle
              checked={resolved.bkt_tracking_enabled}
              onChange={(v) => patchMutation.mutate({ bkt_tracking_enabled: v })}
              disabled={patchMutation.isPending}
            />
          </div>
        </div>
      </div>

      {/* Platform */}
      <div className="rounded-xl border border-ink-border bg-white p-6 space-y-4">
        <h2 className="text-base font-heading font-semibold text-ink-text">
          平台对接
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-text">
                超星学习通 (LTI 1.3)
              </p>
              <p className="text-xs text-ink-text-muted">
                通过 LTI 协议嵌入超星平台
              </p>
            </div>
            <span className="rounded-lg bg-ink-surface px-3 py-1 text-xs font-medium text-ink-text-muted">
              待配置
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-text">钉钉工作台</p>
              <p className="text-xs text-ink-text-muted">
                H5 微应用 + Webhook 通知
              </p>
            </div>
            <span className="rounded-lg bg-ink-surface px-3 py-1 text-xs font-medium text-ink-text-muted">
              待配置
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
