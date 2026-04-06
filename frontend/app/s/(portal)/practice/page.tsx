"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import PracticeCard from "@/components/student/PracticeCard";
import EnergyRing from "@/components/student/EnergyRing";
import { apiFetch } from "@/lib/api";

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

/* ── Mock data ── */

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

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

export default function PracticePage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [knowledgePoints, setKnowledgePoints] = useState(mockKnowledgePoints);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [selectedCourse] = useState("高等数学 A");

  const exercises = mockExercises;
  const currentExercise = exercises[currentIndex];

  const handleSubmitAnswer = useCallback(
    async (answer: string) => {
      // Try API call, fallback to local mock
      try {
        await apiFetch("/api/practice/answer", {
          method: "POST",
          body: JSON.stringify({
            user_id: "current-user",
            course_id: "math-101",
            exercise_id: currentExercise.id,
            answer,
            knowledge_point_id: currentExercise.knowledge_point,
          }),
        });
      } catch {
        // Demo mode
      }

      setAnsweredCount((c) => c + 1);

      // Simulate BKT update
      const isCorrect = answer === currentExercise.correct_answer;
      setKnowledgePoints((prev) =>
        prev.map((kp) => {
          if (kp.name === currentExercise.knowledge_point) {
            const delta = isCorrect ? 0.05 : -0.03;
            return {
              ...kp,
              mastery: Math.max(0, Math.min(1, kp.mastery + delta)),
            };
          }
          return kp;
        }),
      );

      // Move to next after delay
      setTimeout(() => {
        if (currentIndex < exercises.length - 1) {
          setCurrentIndex((i) => i + 1);
        }
      }, 2000);
    },
    [currentExercise, currentIndex, exercises.length],
  );

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
            {selectedCourse}
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
            {answeredCount}/{exercises.length}
          </p>
        </div>
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
        <div className="flex items-center justify-center gap-6 flex-wrap">
          {knowledgePoints.map((kp) => (
            <EnergyRing
              key={kp.name}
              mastery={kp.mastery}
              label={kp.name}
              size={80}
            />
          ))}
        </div>
      </motion.div>

      {/* Practice card */}
      {currentExercise && (
        <PracticeCard
          key={currentExercise.id}
          question={currentExercise.question}
          options={currentExercise.options}
          correctAnswer={currentExercise.correct_answer}
          explanation={currentExercise.explanation}
          onSubmit={handleSubmitAnswer}
          current={currentIndex + 1}
          total={exercises.length}
        />
      )}

      {/* Completion message */}
      {answeredCount >= exercises.length && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-xl border border-ink-success bg-ink-success-light p-6 text-center"
        >
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-ink-success text-white mb-3">
            <i className="ri-trophy-line text-xl" />
          </div>
          <h3 className="text-lg font-heading font-bold text-ink-success">
            练习完成！
          </h3>
          <p className="mt-1 text-sm text-ink-text-muted">
            本轮练习已完成，你的知识点掌握度已更新
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
