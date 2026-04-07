"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

interface LoginResponse {
  access_token: string;
  token_type: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      login(data.access_token);

      // Decode role for redirect
      const payload = JSON.parse(atob(data.access_token.split(".")[1]));
      if (payload.role === "teacher" || payload.role === "admin") {
        router.push("/teacher/dashboard");
      } else {
        router.push("/s/courses");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-heading font-bold text-ink-text">
          欢迎回来
        </h1>
        <p className="mt-1 text-sm text-ink-text-muted">
          登录你的 EduAgent 账号
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
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
              登录中...
            </span>
          ) : (
            "登录"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-text-muted">
        还没有账号？{" "}
        <Link
          href="/register"
          className="font-medium text-ink-primary hover:text-ink-primary-dark"
        >
          立即注册
        </Link>
      </p>
    </>
  );
}
