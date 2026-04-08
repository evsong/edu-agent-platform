"""Prompt templates and few-shot examples for the grading pipeline."""

from __future__ import annotations

GRADING_SYSTEM_PROMPT = """\
你是一位资深教师，支持文本作业、代码作业和实验报告的批改。

规则：
1. 逐段审查学生的作答，找出所有错误、不足和值得表扬的地方
2. 每个批注必须精确定位到具体段落和字符位置
3. 批注类型：error(错误)、warning(需改进)、suggestion(建议)、praise(表扬)
4. 严重程度：critical(严重)、major(重要)、minor(次要)
5. 必须引用原文(original_text)，确保位置准确
6. 关联相关知识点ID（如果知道的话）

代码作业的额外评价维度：
- 正确性：代码逻辑是否正确，算法实现是否有bug
- 语法：是否有语法错误或拼写错误
- 风格：变量命名、缩进、注释是否规范
- 效率：算法时间/空间复杂度是否合理
- 健壮性：是否处理了边界情况和异常输入

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
    # ── Example 3: code homework with logic and style errors ───
    {
        "role": "user",
        "content": (
            "请对以下学生作业进行精细化批注：\n\n"
            "[P1] def binary_search(arr, target):\n"
            "[P2]     left = 0\n"
            "[P3]     right = len(arr)\n"
            "[P4]     while left < right:\n"
            "[P5]         mid = (left + right) / 2\n"
            "[P6]         if arr[mid] == target:\n"
            "[P7]             return mid\n"
            "[P8]         elif arr[mid] < target:\n"
            "[P9]             left = mid + 1\n"
            "[P10]         else:\n"
            "[P11]             right = mid\n"
            "[P12]     return -1"
        ),
    },
    {
        "role": "assistant",
        "content": (
            '{\n'
            '  "annotations": [\n'
            '    {\n'
            '      "paragraph_id": "P1",\n'
            '      "char_start": 0, "char_end": 33,\n'
            '      "original_text": "def binary_search(arr, target):",\n'
            '      "type": "suggestion", "severity": "minor",\n'
            '      "comment": "建议添加类型注解和文档字符串，如 def binary_search(arr: list[int], target: int) -> int:",\n'
            '      "correction": "def binary_search(arr: list[int], target: int) -> int:",\n'
            '      "knowledge_point": "CS-ALGO-001"\n'
            '    },\n'
            '    {\n'
            '      "paragraph_id": "P5",\n'
            '      "char_start": 10, "char_end": 30,\n'
            '      "original_text": "(left + right) / 2",\n'
            '      "type": "error", "severity": "critical",\n'
            '      "comment": "使用 / 运算符会得到浮点数，导致后续 arr[mid] 索引报 TypeError。应使用整数除法 //。此外 left+right 在大数据时可能溢出，推荐 left + (right - left) // 2",\n'
            '      "correction": "left + (right - left) // 2",\n'
            '      "knowledge_point": "CS-ALGO-001"\n'
            '    },\n'
            '    {\n'
            '      "paragraph_id": "P3",\n'
            '      "char_start": 4, "char_end": 22,\n'
            '      "original_text": "right = len(arr)",\n'
            '      "type": "warning", "severity": "major",\n'
            '      "comment": "right 初始化为 len(arr) 是左闭右开写法，与 while left < right 和 right = mid 配合正确，但请在注释中说明区间约定以提高可读性",\n'
            '      "correction": null,\n'
            '      "knowledge_point": "CS-ALGO-001"\n'
            '    },\n'
            '    {\n'
            '      "paragraph_id": "P4",\n'
            '      "char_start": 4, "char_end": 22,\n'
            '      "original_text": "while left < right:",\n'
            '      "type": "praise", "severity": "minor",\n'
            '      "comment": "循环条件正确，与左闭右开区间写法匹配",\n'
            '      "correction": null,\n'
            '      "knowledge_point": "CS-ALGO-001"\n'
            '    }\n'
            '  ],\n'
            '  "overall_score": 62,\n'
            '  "summary": "二分查找整体框架正确，但存在关键的整数除法错误(使用/而非//)会导致运行时异常。建议补充类型注解和区间约定注释。",\n'
            '  "strengths": ["算法框架正确", "左闭右开区间处理得当"],\n'
            '  "improvements": ["修复整数除法错误", "添加类型注解", "注释说明区间约定"]\n'
            '}'
        ),
    },
]

# Code detection patterns — if content matches these, it's likely code
_CODE_MARKERS = (
    "def ", "class ", "import ", "from ", "#include", "function ",
    "const ", "let ", "var ", "public ", "private ", "protected ",
    "if __name__", "return ", "async def ", "async function",
    "=>", "package ", "using ", "namespace ",
)


def _detect_content_type(content: str) -> str:
    """Detect whether *content* is text, code, or mixed.

    Returns one of ``"text"``, ``"code"``, or ``"mixed"``.
    """
    lines = content.strip().splitlines()
    if not lines:
        return "text"

    code_lines = 0
    total_lines = len(lines)
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        # Check for code markers
        if any(stripped.startswith(m) or m in stripped for m in _CODE_MARKERS):
            code_lines += 1
        # Check for code block markers (```)
        elif stripped.startswith("```"):
            code_lines += 1

    if total_lines == 0:
        return "text"

    ratio = code_lines / total_lines
    if ratio >= 0.5:
        return "code"
    elif ratio >= 0.15:
        return "mixed"
    return "text"


def build_grading_prompt(
    paragraphs: list[dict],
    rules: dict | None = None,
    *,
    content_type: str = "text",
) -> list[dict]:
    """Assemble the full message list for the grading LLM call.

    Parameters
    ----------
    paragraphs:
        List of ``{"id": "P1", "text": "..."}`` dicts produced by
        ``GradingService.preprocess_document``.
    rules:
        Optional custom grading rules to append to the system prompt.
    content_type:
        One of ``"text"``, ``"code"``, or ``"mixed"``.  When ``"code"`` or
        ``"mixed"``, the prompt instructs the LLM to apply code-specific
        evaluation criteria.

    Returns
    -------
    list[dict]
        An OpenAI-compatible ``messages`` list: system + few-shot + user.
    """
    # Build system prompt, optionally appending custom rules
    system_text = GRADING_SYSTEM_PROMPT

    # Add content-type-specific instructions
    if content_type == "code":
        system_text += (
            "\n\n本次作业为代码作业，请重点从以下维度评价：\n"
            "- 正确性：逻辑错误、算法bug、运行时异常\n"
            "- 语法：语法错误、拼写错误\n"
            "- 风格：变量命名、缩进、注释规范\n"
            "- 效率：时间/空间复杂度\n"
            "- 健壮性：边界情况和异常处理"
        )
    elif content_type == "mixed":
        system_text += (
            "\n\n本次作业包含文本和代码混合内容。对文本部分按常规标准批改，"
            "对代码部分请额外关注正确性、语法、风格和效率。"
        )

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
