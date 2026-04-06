"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import GradingDrawer from "@/components/teacher/GradingDrawer";
import { fetchGradingDetail } from "@/lib/queries";
import type { GradingDetail } from "@/lib/queries";

const mockDetail: GradingDetail = {
  id: "sub-1",
  student_name: "张明远",
  assignment_title: "微积分第三章作业",
  score: 78,
  content: `# 第三章作业 - 导数与微分

## 第1题
求函数 f(x) = x^3 - 3x^2 + 2x 的导数。

解：f'(x) = 3x^2 - 6x + 2

## 第2题
求函数 g(x) = sin(x^2) 的导数。

解：g'(x) = cos(x^2) * 2x = 2x*cos(x^2)

## 第3题
利用微分近似计算 sqrt(4.02) 的值。

解：令 f(x) = sqrt(x)，x0 = 4，dx = 0.02
f'(x) = 1/(2*sqrt(x))
f(4.02) ≈ f(4) + f'(4)*dx
= 2 + 1/(2*2) * 0.02
= 2 + 0.005
= 2.005

## 第4题
求曲线 y = x^2 在点 (1,1) 处的切线方程。

解：y' = 2x
在 x=1 处，斜率 k = 2
切线方程：y - 1 = 2(x - 1)
即 y = 2x - 1

## 第5题
证明：若 f(x) 在 [a,b] 上可导且 f'(x) > 0，则 f(x) 单调递增。

证明：设 x1, x2 属于 [a,b]，x1 < x2
由中值定理，存在 c 属于 (x1,x2)，使得
f(x2) - f(x1) = f'(c)(x2 - x1)
因为 f'(c) > 0 且 x2 - x1 > 0
所以 f(x2) - f(x1) > 0
即 f(x2) > f(x1)
故 f(x) 单调递增。证毕。`,
  annotations: [
    {
      id: "a1",
      line_start: 16,
      line_end: 16,
      severity: "info",
      comment: "计算过程完全正确，利用复合函数求导法则求解。",
      correction: "",
      knowledge_point: "复合函数求导",
    },
    {
      id: "a2",
      line_start: 21,
      line_end: 26,
      severity: "warning",
      comment:
        "微分近似计算过程正确，但建议写出更详细的公式推导步骤，特别是在f'(x)代入x0值的过程。",
      correction:
        "f'(4) = 1/(2*sqrt(4)) = 1/4 = 0.25\nf(4.02) ≈ f(4) + f'(4)*dx = 2 + 0.25 * 0.02 = 2.005",
      knowledge_point: "微分近似",
    },
    {
      id: "a3",
      line_start: 35,
      line_end: 42,
      severity: "error",
      comment:
        "证明过程中，需要明确指出使用的是拉格朗日中值定理（而非泛称的中值定理），且需要补充f(x)在[a,b]上连续的条件说明。",
      correction:
        '将"由中值定理"改为"由拉格朗日中值定理"，并在证明开头加上"因为 f(x) 在 [a,b] 上可导，所以 f(x) 在 [a,b] 上连续"。',
      knowledge_point: "中值定理",
    },
  ],
};

export default function GradingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const { data: detail } = useQuery({
    queryKey: ["grading-detail", id],
    queryFn: () => fetchGradingDetail(id),
    placeholderData: mockDetail,
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* Back link + header */}
      <button
        onClick={() => router.push("/grading")}
        className="flex items-center gap-1.5 text-sm text-ink-text-muted hover:text-ink-primary transition-colors"
      >
        <i className="ri-arrow-left-line" />
        返回批改队列
      </button>

      <h1 className="text-2xl font-heading font-bold text-ink-text">
        批改详情
      </h1>

      {/* The grading drawer opens as a side sheet */}
      <GradingDrawer
        open={true}
        onOpenChange={(open) => {
          if (!open) router.push("/grading");
        }}
        detail={detail ?? mockDetail}
      />
    </motion.div>
  );
}
