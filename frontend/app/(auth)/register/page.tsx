"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

interface RegisterResponse {
  access_token: string;
  token_type: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"teacher" | "student">("student");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await apiFetch<RegisterResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });

      login(data.access_token);

      if (role === "teacher") {
        router.push("/teacher/dashboard");
      } else {
        router.push("/student/courses");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-heading font-bold text-ink-text">
          创建账号
        </h1>
        <p className="mt-1 text-sm text-ink-text-muted">
          开始使用 EduAgent 智能助教平台
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">姓名</Label>
          <Input
            id="name"
            type="text"
            placeholder="张三"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">邮箱</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            type="password"
            placeholder="至少6位"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>

        <div className="space-y-2">
          <Label>角色</Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRole("student")}
              className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-4 transition-all ${
                role === "student"
                  ? "border-ink-primary bg-ink-primary-lighter"
                  : "border-ink-border bg-white hover:border-ink-text-light"
              }`}
            >
              <i
                className={`ri-user-line text-2xl ${role === "student" ? "text-ink-primary" : "text-ink-text-muted"}`}
              />
              <span
                className={`text-sm font-medium ${role === "student" ? "text-ink-primary" : "text-ink-text-muted"}`}
              >
                学生
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRole("teacher")}
              className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-4 transition-all ${
                role === "teacher"
                  ? "border-ink-primary bg-ink-primary-lighter"
                  : "border-ink-border bg-white hover:border-ink-text-light"
              }`}
            >
              <i
                className={`ri-user-star-line text-2xl ${role === "teacher" ? "text-ink-primary" : "text-ink-text-muted"}`}
              />
              <span
                className={`text-sm font-medium ${role === "teacher" ? "text-ink-primary" : "text-ink-text-muted"}`}
              >
                教师
              </span>
            </button>
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-ink-error-light px-3 py-2 text-sm text-ink-error">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="w-full bg-ink-primary hover:bg-ink-primary-dark"
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <i className="ri-loader-4-line animate-spin" />
              注册中...
            </span>
          ) : (
            "注册"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-text-muted">
        已有账号？{" "}
        <Link
          href="/login"
          className="font-medium text-ink-primary hover:text-ink-primary-dark"
        >
          去登录
        </Link>
      </p>
    </>
  );
}
