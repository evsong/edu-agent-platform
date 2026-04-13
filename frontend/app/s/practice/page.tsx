"use client";

import { useCallback, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import PracticeCard from "@/components/student/PracticeCard";
import EnergyRing from "@/components/student/EnergyRing";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { fetchCourses, fetchCourseKnowledgePoints } from "@/lib/queries";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface Exercise {
  id: string;
  question: string;
  options: { key: string; text: string }[];
  correct_answer: string;
  explanation: string;
  knowledge_point: string;
}

interface KnowledgePoint {
  name: string;
  mastery: number;
}

interface AnswerResult {
  is_correct: boolean;
  correct_answer: string;
  explanation: string;
  updated_profile?: {
    bkt_states?: Record<string, { mastery: number }>;
    overall_mastery?: number;
  };
}

interface PracticeExerciseResponse {
  exercise?: Exercise;
  id?: string;
  question?: string;
  options?: { key: string; text: string }[];
  correct_answer?: string;
  explanation?: string;
  knowledge_point?: string;
}

/* ── Mock data (fallback) ── */

const mockKnowledgePoints: KnowledgePoint[] = [
  { name: "导数定义", mastery: 0.85 },
  { name: "复合函数求导", mastery: 0.72 },
  { name: "微分近似", mastery: 0.45 },
  { name: "中值定理", mastery: 0.28 },
  { name: "极限运算", mastery: 0.91 },
];

const mockExercises: Exercise[] = [
  {
    id: "ex-1",
    question: "函数 f(x) = e^(2x) 的导数 f'(x) 等于：",
    options: [
      { key: "A", text: "e^(2x)" },
      { key: "B", text: "2e^(2x)" },
      { key: "C", text: "2xe^(2x)" },
      { key: "D", text: "e^(2x)/2" },
    ],
    correct_answer: "B",
    explanation:
      "利用复合函数求导法则，令 u = 2x，则 f(x) = e^u，f'(x) = e^u * u' = e^(2x) * 2 = 2e^(2x)。",
    knowledge_point: "复合函数求导",
  },
  {
    id: "ex-2",
    question:
      "若 f(x) 在 [a,b] 上连续，在 (a,b) 上可导，且 f(a) = f(b)，则存在 c 属于 (a,b) 使得 f'(c) = 0。这是哪个定理？",
    options: [
      { key: "A", text: "费马定理" },
      { key: "B", text: "罗尔定理" },
      { key: "C", text: "拉格朗日中值定理" },
      { key: "D", text: "柯西中值定理" },
    ],
    correct_answer: "B",
    explanation:
      "罗尔定理的条件是：f(x) 在 [a,b] 上连续，在 (a,b) 上可导，且 f(a) = f(b)。结论是存在 c 属于 (a,b) 使得 f'(c) = 0。",
    knowledge_point: "中值定理",
  },
  {
    id: "ex-3",
    question: "利用微分近似计算 sqrt(9.02) 的近似值为：",
    options: [
      { key: "A", text: "3.003" },
      { key: "B", text: "3.0033" },
      { key: "C", text: "3.01" },
      { key: "D", text: "3.0003" },
    ],
    correct_answer: "B",
    explanation:
      "令 f(x) = sqrt(x)，x0 = 9，dx = 0.02。f'(x) = 1/(2*sqrt(x))，f'(9) = 1/6。sqrt(9.02) 约等于 f(9) + f'(9)*0.02 = 3 + 0.02/6 = 3 + 0.0033 = 3.0033。",
    knowledge_point: "微分近似",
  },
  {
    id: "ex-4",
    question: "设 f(x) = x * ln(x)，则 f'(1) 等于：",
    options: [
      { key: "A", text: "0" },
      { key: "B", text: "1" },
      { key: "C", text: "ln(1)" },
      { key: "D", text: "e" },
    ],
    correct_answer: "B",
    explanation:
      "f'(x) = ln(x) + x * (1/x) = ln(x) + 1。代入 x = 1：f'(1) = ln(1) + 1 = 0 + 1 = 1。",
    knowledge_point: "导数定义",
  },
  {
    id: "ex-5",
    question: "lim(x->0) (e^x - 1)/x 的值是：",
    options: [
      { key: "A", text: "0" },
      { key: "B", text: "1" },
      { key: "C", text: "e" },
      { key: "D", text: "不存在" },
    ],
    correct_answer: "B",
    explanation:
      "这是一个重要极限。可以用洛必达法则：lim(x->0) (e^x - 1)/x = lim(x->0) e^x/1 = e^0 = 1。也可以视为 f(x) = e^x 在 x=0 处的导数。",
    knowledge_point: "极限运算",
  },
];

/* ── Helpers ── */

/** Normalize the API response into a flat Exercise object */
function normalizeExercise(
  resp: PracticeExerciseResponse,
): Exercise | null {
  const ex = resp.exercise ?? resp;
  if (!ex.question || !ex.options) return null;
  // API returns options as object {"A":"text",...}, frontend expects array [{key,text},...]
  const rawOpts = ex.options;
  const options = Array.isArray(rawOpts)
    ? rawOpts
    : Object.entries(rawOpts).map(([key, text]) => ({ key, text: String(text) }));

  return {
    id: ex.id ?? `api-${Date.now()}`,
    question: ex.question,
    options,
    correct_answer: ex.correct_answer ?? "",
    explanation: ex.explanation ?? "",
    knowledge_point: ex.knowledge_point ?? "",
  };
}

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

export default function PracticePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [answeredCount, setAnsweredCount] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [sessionTarget, setSessionTarget] = useState<number>(10);
  // "" == 自适应 (backend picks weakest KP); otherwise a specific KP uuid
  const [selectedKpId, setSelectedKpId] = useState<string>("");

  /* ── Fetch enrolled courses ── */
  const { data: coursesData } = useQuery({
    queryKey: ["courses"],
    queryFn: fetchCourses,
  });
  const courses = coursesData ?? [];

  // Default-select the first course once loaded
  useEffect(() => {
    if (!selectedCourseId && courses.length > 0) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId]);

  const selectedCourseName =
    courses.find((c) => c.id === selectedCourseId)?.name ?? "";

  /* ── Fetch course knowledge points for chip selector ── */
  const { data: courseKps } = useQuery({
    queryKey: ["course-kps", selectedCourseId],
    queryFn: () => fetchCourseKnowledgePoints(selectedCourseId),
    enabled: !!selectedCourseId,
  });
  const courseKpList = courseKps ?? [];

  /* ── Fetch exercise from API ── */
  const { data: apiExercise, refetch: fetchNextExercise } = useQuery({
    queryKey: ["practice-exercise", selectedCourseId, selectedKpId],
    queryFn: async () => {
      const resp = await apiFetch<PracticeExerciseResponse>(
        "/api/practice/generate",
        {
          method: "POST",
          body: JSON.stringify({
            user_id: user!.id,
            course_id: selectedCourseId,
            ...(selectedKpId ? { knowledge_point_id: selectedKpId } : {}),
          }),
        },
      );
      return normalizeExercise(resp);
    },
    enabled: !!user?.id && !!selectedCourseId,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  /* ── Fetch mastery profile ── */
  const { data: profile } = useQuery({
    queryKey: ["practice-profile", user?.id, selectedCourseId],
    queryFn: () =>
      apiFetch<{
        overall_mastery?: number;
        bkt_states?: Record<string, { mastery: number; name?: string }>;
      }>(`/api/analytics/profile/${user!.id}?course_id=${selectedCourseId}`),
    enabled: !!user?.id && !!selectedCourseId,
  });

  // Derive knowledge points from profile, deduplicate by name (keep highest mastery)
  const knowledgePoints: KnowledgePoint[] = profile?.bkt_states
    ? Object.values(
        Object.entries(profile.bkt_states).reduce<Record<string, KnowledgePoint>>((acc, [key, val]) => {
          const name = val.name || key;
          const mastery = val.mastery ?? 0;
          if (!acc[name] || mastery > acc[name].mastery) {
            acc[name] = { name, mastery };
          }
          return acc;
        }, {}),
      )
    : [];

  // Current exercise: prefer API, show loading when unavailable
  const currentExercise = apiExercise ?? null;
  const totalExercises = sessionTarget;

  /* ── Submit answer mutation ── */
  const answerMutation = useMutation({
    mutationFn: async (answer: string) => {
      const resp = await apiFetch<AnswerResult>("/api/practice/answer", {
        method: "POST",
        body: JSON.stringify({
          user_id: user!.id,
          course_id: selectedCourseId,
          exercise_id: currentExercise!.id,
          answer,
        }),
      });
      return resp;
    },
    onSuccess: (data) => {
      setLastResult(data);
      setShowResult(true);
      setAnsweredCount((c) => c + 1);

      // Refresh profile to update mastery rings
      queryClient.invalidateQueries({
        queryKey: ["practice-profile", user?.id],
      });
    },
    onError: () => {
      // API failed — still reveal the next-button path so the student can proceed
      setLastResult({
        is_correct: false,
        correct_answer: currentExercise?.correct_answer ?? "",
        explanation: currentExercise?.explanation ?? "提交失败，可跳过此题",
      });
      setShowResult(true);
      setAnsweredCount((c) => c + 1);
    },
  });

  const handleSubmitAnswer = useCallback(
    (answer: string) => {
      if (user?.id) {
        answerMutation.mutate(answer);
      }
    },
    [user?.id, answerMutation],
  );

  const handleNext = useCallback(() => {
    setShowResult(false);
    setLastResult(null);
    fetchNextExercise();
  }, [fetchNextExercise]);

  const currentKP = knowledgePoints.find(
    (kp) => kp.name === currentExercise?.knowledge_point,
  );

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-ink-text">
            智能练习
          </h1>
          <p className="mt-1 text-sm text-ink-text-muted">
            {selectedCourseName || "请选择课程"}
            {currentKP && (
              <span className="ml-2 inline-flex items-center rounded-full bg-ink-primary-lighter px-2 py-0.5 text-[10px] font-semibold text-ink-primary">
                {currentKP.name}
              </span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-text-muted">已完成</p>
          <p className="text-lg font-heading font-bold text-ink-primary">
            {answeredCount}
          </p>
        </div>
      </div>

      {/* Course Selector */}
      {courses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {courses.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                if (c.id === selectedCourseId) return;
                setSelectedCourseId(c.id);
                setSelectedKpId("");
                setAnsweredCount(0);
                setShowResult(false);
                setLastResult(null);
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                selectedCourseId === c.id
                  ? "border-ink-primary bg-ink-primary text-white shadow-sm shadow-ink-primary/20"
                  : "border-ink-border bg-white text-ink-text hover:border-ink-primary/40 hover:bg-ink-primary-lighter/30",
              )}
            >
              <i className={cn(c.icon || "ri-book-line", "text-base")} />
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Knowledge point chips */}
      {courseKpList.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-text-muted">
            知识点（共 {courseKpList.length}）：
          </span>
          <button
            onClick={() => {
              if (selectedKpId === "") return;
              setSelectedKpId("");
              setAnsweredCount(0);
              setShowResult(false);
              setLastResult(null);
            }}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors",
              selectedKpId === ""
                ? "border-ink-primary bg-ink-primary text-white"
                : "border-ink-border bg-white text-ink-text hover:border-ink-primary/40",
            )}
          >
            <i className="ri-magic-line text-sm" />
            自适应
          </button>
          {courseKpList.map((kp) => (
            <button
              key={kp.id}
              onClick={() => {
                if (selectedKpId === kp.id) return;
                setSelectedKpId(kp.id);
                setAnsweredCount(0);
                setShowResult(false);
                setLastResult(null);
              }}
              className={cn(
                "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
                selectedKpId === kp.id
                  ? "border-ink-primary bg-ink-primary text-white"
                  : "border-ink-border bg-white text-ink-text hover:border-ink-primary/40",
              )}
              title={kp.name}
            >
              {kp.name}
            </button>
          ))}
        </div>
      )}

      {/* Session length selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-text-muted">本轮目标：</span>
        {[5, 10, 20].map((n) => (
          <button
            key={n}
            onClick={() => {
              if (n === sessionTarget) return;
              setSessionTarget(n);
              setAnsweredCount(0);
              setShowResult(false);
              setLastResult(null);
            }}
            className={cn(
              "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
              sessionTarget === n
                ? "border-ink-primary bg-ink-primary text-white"
                : "border-ink-border bg-white text-ink-text hover:border-ink-primary/40",
            )}
          >
            {n} 题
          </button>
        ))}
      </div>

      {/* BKT Energy Rings */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.1,
          type: "spring",
          stiffness: 400,
          damping: 30,
        }}
        className="rounded-xl border border-ink-border bg-white p-5"
      >
        <h3 className="mb-4 text-sm font-heading font-semibold text-ink-text">
          <i className="ri-donut-chart-line mr-1.5 text-ink-primary" />
          知识点掌握度
        </h3>
        <div className="flex items-center justify-center gap-4 sm:gap-6 flex-wrap">
          {knowledgePoints.map((kp) => (
            <EnergyRing
              key={kp.name}
              mastery={kp.mastery}
              label={kp.name}
              size={70}
            />
          ))}
        </div>
      </motion.div>

      {/* Practice card / completion */}
      {answeredCount >= sessionTarget ? (
        <div className="rounded-xl border border-ink-success/30 bg-ink-success-light p-6 text-center">
          <i className="ri-checkbox-circle-fill text-4xl text-ink-success" />
          <h3 className="mt-3 text-lg font-heading font-semibold text-ink-text">
            本轮练习完成
          </h3>
          <p className="mt-1 text-sm text-ink-text-muted">
            你已完成 {answeredCount} 题，继续练习？
          </p>
          <button
            onClick={() => {
              setAnsweredCount(0);
              setShowResult(false);
              setLastResult(null);
              fetchNextExercise();
            }}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-ink-primary px-6 text-sm font-medium text-white hover:bg-ink-primary-dark"
          >
            <i className="ri-restart-line" />
            再练一轮
          </button>
        </div>
      ) : currentExercise ? (
        <PracticeCard
          key={currentExercise.id}
          question={currentExercise.question}
          options={currentExercise.options}
          correctAnswer={
            lastResult?.correct_answer || currentExercise.correct_answer
          }
          explanation={
            lastResult?.explanation || currentExercise.explanation
          }
          onSubmit={handleSubmitAnswer}
          onNext={showResult ? handleNext : undefined}
          current={Math.min(answeredCount + 1, sessionTarget)}
          total={totalExercises}
        />
      ) : (
        <div className="rounded-xl border border-ink-border bg-white p-6 text-center">
          <p className="text-sm text-ink-text-muted">加载练习中...</p>
        </div>
      )}
    </motion.div>
  );
}
