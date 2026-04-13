"use client";

import { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import AnnotationViewer from "@/components/student/AnnotationViewer";
import { fetchGradingDetail } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import type { GradingDetail } from "@/lib/queries";

/* ── Mock data ── */

const mockPendingDetail = {
  id: "asgn-1",
  title: "微积分第三章作业 - 导数与微分",
  course_name: "高等数学 A",
  description: `## 第三章作业要求

请完成以下 5 道导数与微分相关题目。要求写出完整的解题过程。

**第1题** 求函数 f(x) = x^3 - 3x^2 + 2x 的导数。

**第2题** 求函数 g(x) = sin(x^2) 的导数。

**第3题** 利用微分近似计算 sqrt(4.02) 的值。

**第4题** 求曲线 y = x^2 在点 (1,1) 处的切线方程。

**第5题** 证明：若 f(x) 在 [a,b] 上可导且 f'(x) > 0，则 f(x) 单调递增。`,
  status: "pending" as const,
};

const mockGradedDetail: GradingDetail = {
  id: "asgn-4",
  student_name: "学生",
  assignment_title: "微积分第二章作业 - 极限与连续",
  score: 85,
  content: `# 第二章作业 - 极限与连续

## 第1题
求极限 lim(x->0) sin(x)/x

解：由重要极限公式，lim(x->0) sin(x)/x = 1

## 第2题
求极限 lim(x->inf) (1+1/x)^x

解：由重要极限公式，lim(x->inf) (1+1/x)^x = e

## 第3题
判断函数 f(x) = |x| 在 x=0 处的连续性和可导性。

解：
连续性：lim(x->0-) |x| = 0 = lim(x->0+) |x| = f(0)，所以连续。
可导性：左导数 = lim(h->0-) (|h|-0)/h = -1
右导数 = lim(h->0+) (|h|-0)/h = 1
左导数不等于右导数，所以不可导。

## 第4题
证明函数 f(x) = x^2 在 R 上一致连续。

解：对任意 epsilon > 0，取 delta = epsilon
当 |x1 - x2| < delta 时
|f(x1) - f(x2)| = |x1^2 - x2^2| = |x1+x2||x1-x2|
... (需要更严格的证明)`,
  annotations: [
    {
      id: "a1",
      line_start: 4,
      line_end: 4,
      severity: "info",
      comment: "极限公式应用正确，但建议补充推导过程或几何直觉解释。",
      correction: "",
      knowledge_point: "重要极限",
    },
    {
      id: "a2",
      line_start: 21,
      line_end: 24,
      severity: "warning",
      comment:
        "连续性和可导性的分析方法正确，但左导数的记号建议用更规范的极限表达式。",
      correction:
        "f'-(0) = lim(h->0-) [f(0+h)-f(0)]/h = lim(h->0-) |h|/h = lim(h->0-) (-h)/h = -1",
      knowledge_point: "导数定义",
    },
    {
      id: "a3",
      line_start: 28,
      line_end: 32,
      severity: "error",
      comment:
        "f(x) = x^2 在 R 上不是一致连续的！因为 |x1+x2| 无法被控制在有界范围内。这道题的结论本身就是错误的，应该证明其在 R 上不���致连续。",
      correction:
        "反证法：取 x_n = n, y_n = n + 1/n，则 |x_n - y_n| = 1/n -> 0，但 |f(x_n) - f(y_n)| = |2 + 1/n^2| -> 2 != 0。故不一致连续。",
      knowledge_point: "一致连续性",
    },
  ],
};

export default function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // The /id/ may be either a submission UUID (graded/pending submission) or
  // an assignment UUID (no submission yet). Look up the row in the
  // student-assignments list to disambiguate.
  const { data: rows } = useQuery({
    queryKey: ["student-assignments-v2"],
    queryFn: () =>
      apiFetch<{
        assignment_id: string;
        submission_id: string | null;
        status: string;
        assignment_title: string;
        course_name: string;
        description: string | null;
      }[]>("/api/student/assignments"),
  });
  const row = rows?.find((r) => r.submission_id === id || r.assignment_id === id) ?? null;

  // Speculative fetch: try /grading/result/{id} regardless of whether
  // we've matched a row yet. If the id is a real submission and it has a
  // grading result, this resolves and lets us render review mode even if
  // the listing row hasn't loaded yet (or 404s out for unrelated reasons).
  const { data: speculativeGrading, isPending: gradingPending } = useQuery({
    queryKey: ["student-grading-detail", id],
    queryFn: () => fetchGradingDetail(id),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const isGraded =
    !!speculativeGrading?.score ||
    row?.status === "graded" ||
    row?.status === "ai_graded" ||
    row?.status === "teacher_graded";

  const gradingDetail = speculativeGrading ?? null;
  // Compute the renderable detail object. Never fall back to mockGradedDetail
  // — mock content leaking onto the screen is exactly the bug we're fixing.
  const detail = gradingDetail;

  // While we don't yet know whether the URL points at a graded submission
  // or a fresh assignment, render a skeleton instead of the mock pending
  // template — otherwise the user sees a brief flash of mock content.
  const stillResolvingRoute = gradingPending && !rows;

  const handleSubmit = useCallback(async () => {
    if (!answer.trim() || !row) return;
    setSubmitting(true);
    try {
      // Step 1: create / update the submission row with the student's answer
      const sub = await apiFetch<{ id: string }>(
        `/api/assignments/${row.assignment_id}/submit`,
        { method: "POST", body: JSON.stringify({ content: answer }) },
      );
      // Step 2: trigger AI grading on the new submission
      try {
        await apiFetch("/api/grading/submit", {
          method: "POST",
          body: JSON.stringify({ submission_id: sub.id }),
        });
      } catch {
        // Even if grading fails, the submission is saved
      }
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }, [row, answer]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Back link */}
      <button
        onClick={() => router.push("/s/assignments")}
        className="flex items-center gap-1.5 text-sm text-ink-text-muted hover:text-ink-primary transition-colors"
      >
        <i className="ri-arrow-left-line" />
        返回作业列表
      </button>

      {stillResolvingRoute ? (
        /* ── Loading skeleton — don't flash mock content ── */
        <div className="space-y-4">
          <div className="h-7 w-64 rounded bg-ink-surface animate-pulse" />
          <div className="h-3 w-40 rounded bg-ink-surface animate-pulse" />
          <div className="h-32 w-full rounded-xl bg-ink-surface animate-pulse" />
        </div>
      ) : isGraded && detail ? (
        /* ── Review mode (graded) ── */
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-heading font-bold text-ink-text">
              {detail.assignment_title}
            </h1>
            <p className="mt-1 text-sm text-ink-text-muted">
              批改结果与详细批注
            </p>
          </div>

          <AnnotationViewer
            content={detail.content}
            annotations={detail.annotations}
            score={detail.score}
          />

          {/* CTA */}
          <Button
            onClick={() => router.push("/s/practice")}
            className="w-full bg-ink-primary hover:bg-ink-primary-dark text-white h-11"
          >
            <i className="ri-pencil-ruler-2-line mr-2" />
            开始针对练习
          </Button>
        </div>
      ) : !row ? (
        /* ── Loading skeleton — wait for row metadata ── */
        <div className="space-y-4">
          <div className="h-7 w-64 rounded bg-ink-surface animate-pulse" />
          <div className="h-3 w-40 rounded bg-ink-surface animate-pulse" />
          <div className="h-32 w-full rounded-xl bg-ink-surface animate-pulse" />
        </div>
      ) : (
        /* ── Submit mode (pending) ── */
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-heading font-bold text-ink-text">
              {row.assignment_title}
            </h1>
            <p className="mt-1 text-sm text-ink-text-muted">
              {row.course_name}
            </p>
          </div>

          {/* Assignment description */}
          <div className="rounded-xl border border-ink-border bg-ink-surface p-5">
            <h3 className="mb-3 text-sm font-heading font-semibold text-ink-text">
              <i className="ri-file-text-line mr-1.5 text-ink-primary" />
              题目要求
            </h3>
            <div className="text-sm text-ink-text leading-relaxed whitespace-pre-wrap font-mono">
              {row.description ?? ""}
            </div>
          </div>

          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl border border-ink-success bg-ink-success-light p-6 text-center"
            >
              <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-ink-success text-white mb-3">
                <i className="ri-check-line text-xl" />
              </div>
              <h3 className="text-lg font-heading font-bold text-ink-success">
                提交成功
              </h3>
              <p className="mt-1 text-sm text-ink-text-muted">
                AI 助教将在几分钟内完成批改，请稍后查看结果
              </p>
              <Button
                onClick={() => router.push("/s/assignments")}
                className="mt-4 bg-ink-success hover:bg-ink-success/90 text-white"
              >
                返回作业列表
              </Button>
            </motion.div>
          ) : (
            <>
              {/* Answer textarea */}
              <div className="rounded-xl border border-ink-border bg-white p-5">
                <h3 className="mb-3 text-sm font-heading font-semibold text-ink-text">
                  <i className="ri-edit-line mr-1.5 text-ink-primary" />
                  你的答案
                </h3>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="在此输入你的解题过程和答案..."
                  rows={15}
                  className="w-full rounded-lg border border-ink-border bg-ink-surface px-4 py-3 text-sm text-ink-text font-mono placeholder:text-ink-text-light focus:border-ink-primary focus:outline-none focus:ring-2 focus:ring-ink-primary/20 resize-y"
                />
              </div>

              {/* Submit button */}
              <Button
                onClick={handleSubmit}
                disabled={!answer.trim() || submitting}
                className="w-full bg-ink-primary hover:bg-ink-primary-dark text-white h-11"
              >
                {submitting ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-2" />
                    提交中...
                  </>
                ) : (
                  <>
                    <i className="ri-send-plane-line mr-2" />
                    提交作业
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}
