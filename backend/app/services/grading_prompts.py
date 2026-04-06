"""Prompt templates and few-shot examples for the grading pipeline."""

from __future__ import annotations

GRADING_SYSTEM_PROMPT = """\
你是一位资深教师，负责对学生作业进行精细化批注。

规则：
1. 逐段审查学生的作答，找出所有错误、不足和值得表扬的地方
2. 每个批注必须精确定位到具体段落和字符位置
3. 批注类型：error(错误)、warning(需改进)、suggestion(建议)、praise(表扬)
4. 严重程度：critical(严重)、major(重要)、minor(次要)
5. 必须引用原文(original_text)，确保位置准确
6. 关联相关知识点ID（如果知道的话）

输出严格JSON格式。"""

GRADING_FEW_SHOT: list[dict[str, str]] = [
    # ── Example 1: math homework with calculation error ──────────
    {
        "role": "user",
        "content": (
            "请对以下学生作业进行精细化批注：\n\n"
            "[P1] 题目：求 ∫₀¹ x²dx 的值\n"
            "[P2] 解：令 F(x) = x³/3\n"
            "[P3] 则 ∫₀¹ x²dx = F(1) - F(0) = 1/3 - 0 = 1/3\n"
            "[P4] 答：定积分的值为 1/2"
        ),
    },
    {
        "role": "assistant",
        "content": (
            '{\n'
            '  "annotations": [\n'
            '    {\n'
            '      "paragraph_id": "P2",\n'
            '      "char_start": 0, "char_end": 15,\n'
            '      "original_text": "令 F(x) = x³/3",\n'
            '      "type": "praise", "severity": "minor",\n'
            '      "comment": "原函数求解正确",\n'
            '      "correction": null,\n'
            '      "knowledge_point": "MATH-CALC-001"\n'
            '    },\n'
            '    {\n'
            '      "paragraph_id": "P4",\n'
            '      "char_start": 8, "char_end": 11,\n'
            '      "original_text": "1/2",\n'
            '      "type": "error", "severity": "critical",\n'
            '      "comment": "计算错误：第三步已正确得出1/3，但最终答案误写为1/2",\n'
            '      "correction": "1/3",\n'
            '      "knowledge_point": "MATH-CALC-001"\n'
            '    }\n'
            '  ],\n'
            '  "overall_score": 75,\n'
            '  "summary": "解题思路正确，原函数和积分计算过程无误，但最终答案抄写错误。",\n'
            '  "strengths": ["解题思路清晰", "原函数求解正确"],\n'
            '  "improvements": ["注意最终答案的核验"]\n'
            '}'
        ),
    },
    # ── Example 2: physics problem with concept error ────────────
    {
        "role": "user",
        "content": (
            "请对以下学生作业进行精细化批注：\n\n"
            "[P1] 题目：一个质量为2kg的物体从10m高处自由落下，求落地速度（g=10m/s²）\n"
            "[P2] 解：由 v² = 2gh 得 v = √(2×10×10) = √200 ≈ 14.1m/s\n"
            "[P3] 答：落地速度为14.1m/s，方向向下"
        ),
    },
    {
        "role": "assistant",
        "content": (
            '{\n'
            '  "annotations": [\n'
            '    {\n'
            '      "paragraph_id": "P2",\n'
            '      "char_start": 3, "char_end": 14,\n'
            '      "original_text": "v² = 2gh",\n'
            '      "type": "praise", "severity": "minor",\n'
            '      "comment": "正确选择了自由落体公式",\n'
            '      "correction": null,\n'
            '      "knowledge_point": "PHY-MECH-002"\n'
            '    },\n'
            '    {\n'
            '      "paragraph_id": "P3",\n'
            '      "char_start": 0, "char_end": 22,\n'
            '      "original_text": "落地速度为14.1m/s，方向向下",\n'
            '      "type": "suggestion", "severity": "minor",\n'
            '      "comment": "建议注明这是速率而非速度矢量，或用矢量形式 v=14.1m/s↓ 表示",\n'
            '      "correction": "落地速率为14.1m/s（方向竖直向下）",\n'
            '      "knowledge_point": "PHY-MECH-002"\n'
            '    }\n'
            '  ],\n'
            '  "overall_score": 92,\n'
            '  "summary": "公式选择和计算完全正确，可在矢量表述上更加规范。",\n'
            '  "strengths": ["公式选取正确", "数值计算准确"],\n'
            '  "improvements": ["区分速度与速率的矢量表述"]\n'
            '}'
        ),
    },
]


def build_grading_prompt(
    paragraphs: list[dict],
    rules: dict | None = None,
) -> list[dict]:
    """Assemble the full message list for the grading LLM call.

    Parameters
    ----------
    paragraphs:
        List of ``{"id": "P1", "text": "..."}`` dicts produced by
        ``GradingService.preprocess_document``.
    rules:
        Optional custom grading rules to append to the system prompt.

    Returns
    -------
    list[dict]
        An OpenAI-compatible ``messages`` list: system + few-shot + user.
    """
    # Build system prompt, optionally appending custom rules
    system_text = GRADING_SYSTEM_PROMPT
    if rules:
        rule_lines: list[str] = ["\n\n自定义批改规则："]
        for key, value in rules.items():
            rule_lines.append(f"- {key}: {value}")
        system_text += "\n".join(rule_lines)

    messages: list[dict] = [{"role": "system", "content": system_text}]

    # Append few-shot examples
    messages.extend(GRADING_FEW_SHOT)

    # Append the actual student paragraphs
    paragraph_lines = [
        f"[{p['id']}] {p['text']}" for p in paragraphs
    ]
    user_content = "请对以下学生作业进行精细化批注：\n\n" + "\n".join(paragraph_lines)
    messages.append({"role": "user", "content": user_content})

    return messages
