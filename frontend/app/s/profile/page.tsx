"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import EnergyRing from "@/components/student/EnergyRing";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/* ── Constants ── */
const MATH_COURSE_ID = "00000000-0000-4000-b000-000000000001";

/** Map backend KP external IDs to Chinese display names */
const KP_NAMES: Record<string, string> = {
  "MATH-LIMIT-001": "数列极限",
  "MATH-LIMIT-002": "函数极限",
  "MATH-DIFF-001": "导数与微分",
  "MATH-CALC-001": "不定积分",
  "MATH-CALC-002": "定积分",
  "MATH-CALC-003": "定积分性质",
  "MATH-SERIES-001": "数项级数",
  "MATH-SERIES-002": "幂级数",
  "MATH-VEC-001": "向量代数",
  "MATH-DET-001": "行列式",
};

/* ── Types ── */

interface ProfileData {
  knowledge_points: { name: string; mastery: number }[];
  mastery_history: { date: string; mastery: number }[];
  stats: {
    total_interactions: number;
    practice_sessions: number;
    improvement_rate: number;
  };
}

interface BackendProfile {
  bkt_states: Record<string, { p_know: number }>;
  overall_mastery: number;
  risk_level: string;
}

/** Transform backend BKT response → frontend ProfileData */
function transformProfile(raw: BackendProfile): ProfileData {
  const knowledge_points = Object.entries(raw.bkt_states)
    .filter(([id]) => id in KP_NAMES)
    .map(([id, state]) => ({
      name: KP_NAMES[id],
      mastery: state.p_know,
    }));

  return {
    knowledge_points,
    mastery_history: mockProfile.mastery_history, // history not in this endpoint
    stats: mockProfile.stats, // stats not in this endpoint
  };
}

/* ── Mock data ── */

const mockProfile: ProfileData = {
  knowledge_points: [
    { name: "导数定义", mastery: 0.85 },
    { name: "复合函数求导", mastery: 0.72 },
    { name: "微分近似", mastery: 0.45 },
    { name: "中值定理", mastery: 0.28 },
    { name: "极限运算", mastery: 0.91 },
    { name: "不定积分", mastery: 0.65 },
    { name: "定积分", mastery: 0.58 },
    { name: "数列求和", mastery: 0.38 },
    { name: "三角恒等", mastery: 0.76 },
    { name: "概率统计", mastery: 0.52 },
  ],
  mastery_history: [
    { date: "03/31", mastery: 52 },
    { date: "04/01", mastery: 55 },
    { date: "04/02", mastery: 54 },
    { date: "04/03", mastery: 58 },
    { date: "04/04", mastery: 62 },
    { date: "04/05", mastery: 64 },
    { date: "04/06", mastery: 68 },
  ],
  stats: {
    total_interactions: 347,
    practice_sessions: 28,
    improvement_rate: 12.5,
  },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

export default function ProfilePage() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["student-profile", user?.id],
    queryFn: async () => {
      const raw = await apiFetch<BackendProfile>(
        `/api/analytics/profile/${user!.id}?course_id=${MATH_COURSE_ID}`,
      );
      return transformProfile(raw);
    },
    enabled: !!user?.id,
  });

  const data = profile ?? mockProfile;

  const radarData = data.knowledge_points.map((kp) => ({
    subject: kp.name,
    value: Math.round(kp.mastery * 100),
    fullMark: 100,
  }));

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={stagger}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-ink-text">
          能力画像
        </h1>
        <p className="mt-1 text-sm text-ink-text-muted">
          你的学习数据与知识掌握概况
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="rounded-xl border border-ink-border bg-white p-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-primary-lighter">
              <i className="ri-chat-3-line text-lg text-ink-primary" />
            </div>
            <div>
              <p className="text-xl font-heading font-bold text-ink-primary">
                {data.stats.total_interactions}
              </p>
              <p className="text-xs text-ink-text-muted">AI 交互次数</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.06,
            type: "spring",
            stiffness: 400,
            damping: 30,
          }}
          className="rounded-xl border border-ink-border bg-white p-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-success-light">
              <i className="ri-pencil-ruler-2-line text-lg text-ink-success" />
            </div>
            <div>
              <p className="text-xl font-heading font-bold text-ink-success">
                {data.stats.practice_sessions}
              </p>
              <p className="text-xs text-ink-text-muted">练习次数</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.12,
            type: "spring",
            stiffness: 400,
            damping: 30,
          }}
          className="rounded-xl border border-ink-border bg-white p-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-warning-light">
              <i className="ri-arrow-up-circle-line text-lg text-ink-warning" />
            </div>
            <div>
              <p className="text-xl font-heading font-bold text-ink-warning">
                +{data.stats.improvement_rate}%
              </p>
              <p className="text-xs text-ink-text-muted">周提升率</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Radar chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.2,
            type: "spring",
            stiffness: 400,
            damping: 30,
          }}
          className="rounded-xl border border-ink-border bg-white p-5"
        >
          <h2 className="text-base font-heading font-semibold text-ink-text mb-1">
            知识点雷达图
          </h2>
          <p className="text-xs text-ink-text-muted mb-4">各维度掌握程度</p>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%">
              <PolarGrid stroke="#F3F4F6" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fontSize: 11, fill: "#6B7280" }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false}
              />
              <Radar
                name="掌握度"
                dataKey="value"
                stroke="#4338CA"
                fill="#4338CA"
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Line chart - 7-day trend */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.3,
            type: "spring",
            stiffness: 400,
            damping: 30,
          }}
          className="rounded-xl border border-ink-border bg-white p-5"
        >
          <h2 className="text-base font-heading font-semibold text-ink-text mb-1">
            掌握度趋势
          </h2>
          <p className="text-xs text-ink-text-muted mb-4">近 7 天平均掌握率</p>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data.mastery_history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #F3F4F6",
                  fontSize: "12px",
                }}
                formatter={(value) => [`${value}%`, "掌握率"]}
              />
              <Line
                type="monotone"
                dataKey="mastery"
                stroke="#4338CA"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#4338CA", strokeWidth: 2, stroke: "#fff" }}
                activeDot={{ r: 6, fill: "#4338CA" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      {/* Energy Ring grid */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.4,
          type: "spring",
          stiffness: 400,
          damping: 30,
        }}
        className="rounded-xl border border-ink-border bg-white p-5"
      >
        <h2 className="text-base font-heading font-semibold text-ink-text mb-1">
          全部知识点
        </h2>
        <p className="text-xs text-ink-text-muted mb-5">
          BKT 模型实时计算的掌握概率
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          {data.knowledge_points.map((kp) => (
            <EnergyRing
              key={kp.name}
              mastery={kp.mastery}
              label={kp.name}
              size={75}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
