"use client";

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/** Convert LLM LaTeX delimiters to remark-math format: [ ... ] → $$...$$ and ( ... ) → $...$ */
function convertLatex(text: string): string {
  // Display math: [ ... ] → $$...$$  (must come first to avoid conflict with inline)
  let result = text.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_m, p1) => `$$${p1}$$`);
  // Inline math: ( ... ) → $...$
  result = result.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_m, p1) => `$${p1}$`);
  return result;
}

/* ── Types ── */
interface ChatAction {
  name: string;
  params: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  agentId?: string;
  agentName?: string;
  actions?: ChatAction[];
}

interface ChatInterfaceProps {
  courseId: string;
  className?: string;
}

export interface ChatInterfaceHandle {
  sendMessage: (text: string) => void;
}

/* ── Helpers ── */
function generateId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── Component ── */
const ChatInterface = forwardRef<ChatInterfaceHandle, ChatInterfaceProps>(function ChatInterface({
  courseId,
  className,
}: ChatInterfaceProps, ref) {
  const chatStorageKey = `eduagent-chat-${courseId}`;
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem(chatStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[];
        return parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
      }
    } catch { /* ignore */ }
    return [];
  });
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);
  const currentAgentInfoRef = useRef<{ agentId?: string; hasContent: boolean }>({ hasContent: false });

  /* persist chat history */
  useEffect(() => {
    if (messages.length > 0) {
      try { localStorage.setItem(chatStorageKey, JSON.stringify(messages.slice(-50))); } catch { /* ignore */ }
    }
  }, [messages, chatStorageKey]);

  /* auto-scroll */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  /* auto-resize textarea */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  /* ── send message ── */
  const doSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isStreaming) return;

    setError(null);
    setInput("");

    // add user message
    const userMsg: ChatMessage = {
      id: generateId(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // prepare assistant placeholder
    const assistantId = generateId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      actions: [],
    };
    setMessages((prev) => [...prev, assistantMsg]);
    currentAssistantIdRef.current = assistantId;
    currentAgentInfoRef.current = { hasContent: false };
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let receivedContent = false;
    // Wait up to 90s for the first token (LangGraph director + QA agent
    // can easily take 25–60s cold). Once content starts streaming, the
    // timeout becomes irrelevant.
    const timeout = setTimeout(() => {
      if (!receivedContent) controller.abort();
    }, 90000);

    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

      const res = await fetch("/api/chat/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text, course_id: courseId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        throw new Error(`Server error ${res.status}: ${errText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No readable stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // keep the last (possibly incomplete) line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const jsonStr = trimmed.slice(6);
          if (!jsonStr || jsonStr === "[DONE]") continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue; // malformed JSON, skip
          }

          const type = event.type as string;

          if (type === "agent_start") {
            const agentId = event.agent_id as string;
            const agentName = event.agent_name as string;

            if (currentAgentInfoRef.current.agentId && currentAgentInfoRef.current.hasContent) {
              // Previous agent already produced output — create new bubble
              const newId = generateId();
              setMessages((prev) => [...prev, {
                id: newId,
                role: "assistant" as const,
                content: "",
                timestamp: new Date(),
                agentId,
                agentName,
                actions: [],
              }]);
              currentAssistantIdRef.current = newId;
              currentAgentInfoRef.current = { agentId, hasContent: false };
            } else {
              // First agent — update existing placeholder
              const targetId = currentAssistantIdRef.current;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === targetId ? { ...m, agentId, agentName } : m,
                ),
              );
              currentAgentInfoRef.current = { agentId, hasContent: false };
            }
          } else if (type === "text_delta") {
            receivedContent = true;
            const targetId = currentAssistantIdRef.current;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === targetId
                  ? { ...m, content: m.content + (event.content as string) }
                  : m,
              ),
            );
            currentAgentInfoRef.current.hasContent = true;
          } else if (type === "action") {
            const targetId = currentAssistantIdRef.current;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === targetId
                  ? {
                      ...m,
                      actions: [
                        ...(m.actions ?? []),
                        {
                          name: event.name as string,
                          params: (event.params ?? {}) as Record<
                            string,
                            unknown
                          >,
                        },
                      ],
                    }
                  : m,
              ),
            );
          } else if (type === "error") {
            setError(event.message as string);
          }
          // agent_end / done — no special handling needed
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") {
        // If aborted due to timeout, show a helpful message
        if (!receivedContent) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && !m.content
                ? { ...m, content: "AI 响应超时，请稍后重试。可能是后端 LLM 服务暂时不可用。" }
                : m,
            ),
          );
        }
        return;
      }
      const message =
        err instanceof Error ? err.message : "Failed to connect";
      setError(message);
      // remove the empty assistant message on total failure
      setMessages((prev) => {
        const msg = prev.find((m) => m.id === assistantId);
        if (msg && !msg.content) return prev.filter((m) => m.id !== assistantId);
        return prev;
      });
    } finally {
      clearTimeout(timeout);
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, courseId]);

  /* ── public sendMessage wrapper ── */
  const sendMessage = useCallback(() => {
    doSend();
  }, [doSend]);

  /* ── imperative handle for parent components ── */
  useImperativeHandle(ref, () => ({
    sendMessage: (text: string) => {
      if (isStreaming) return;
      doSend(text);
    },
  }), [isStreaming, doSend]);

  /* ── keyboard handler ── */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /* ── retry ── */
  const retry = () => {
    setError(null);
    // find last user message and resend
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) {
      setInput(lastUser.content);
      // remove the last assistant (failed) message
      setMessages((prev) => {
        const idx = prev.findLastIndex((m) => m.role === "assistant");
        if (idx >= 0) return prev.filter((_, i) => i !== idx);
        return prev;
      });
    }
  };

  /* ── render ── */
  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-primary-lighter text-ink-primary mb-4">
              <i className="ri-chat-smile-3-line text-2xl" />
            </div>
            <p className="text-sm font-medium text-ink-text">
              AI 助教
            </p>
            <p className="mt-1 text-xs text-ink-text-muted max-w-xs">
              你好！我是你的 AI 助教，可以帮你答疑、批改作业和生成练习。
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5",
                msg.role === "user"
                  ? "bg-ink-primary text-white"
                  : "bg-ink-surface text-ink-text",
              )}
            >
              {/* Agent badge */}
              {msg.role === "assistant" && msg.agentName && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <i className="ri-robot-2-line text-xs text-ink-primary" />
                  <span className="text-[11px] font-medium text-ink-primary">
                    {msg.agentName}
                  </span>
                </div>
              )}

              {/* Content */}
              <div
                className={cn(
                  "text-sm leading-relaxed break-words",
                  msg.role === "user" ? "text-white" : "text-ink-text prose prose-sm max-w-none prose-headings:text-ink-text prose-p:my-1 prose-li:my-0",
                )}
              >
                {msg.role === "assistant" ? (
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {convertLatex(msg.content)}
                  </ReactMarkdown>
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
                {/* Typing indicator */}
                {msg.role === "assistant" &&
                  isStreaming &&
                  msg === messages[messages.length - 1] &&
                  !msg.content && (
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-ink-text-light animate-pulse" />
                      <span className="w-1.5 h-1.5 rounded-full bg-ink-text-light animate-pulse [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-ink-text-light animate-pulse [animation-delay:300ms]" />
                    </span>
                  )}
              </div>

              {/* Actions (citations, knowledge points) */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {msg.actions.map((action, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-lg bg-ink-primary-lighter px-2 py-0.5 text-[11px] font-medium text-ink-primary"
                    >
                      {action.name === "cite" && (
                        <i className="ri-book-mark-line text-[10px]" />
                      )}
                      {action.name === "cite"
                        ? (action.params.title as string) ??
                          (action.params.source as string) ??
                          "Reference"
                        : action.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Timestamp */}
              <p
                className={cn(
                  "text-[10px] mt-1",
                  msg.role === "user"
                    ? "text-white/60 text-right"
                    : "text-ink-text-light",
                )}
              >
                {formatTime(msg.timestamp)}
              </p>
            </div>
          </div>
        ))}

        {/* Streaming cursor at the end */}
        {isStreaming &&
          messages.length > 0 &&
          messages[messages.length - 1].content && (
            <div className="flex justify-start">
              <span className="inline-flex items-center gap-1 px-2 py-1 text-ink-text-light">
                <span className="w-1.5 h-1.5 rounded-full bg-ink-primary animate-pulse" />
              </span>
            </div>
          )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error bar */}
      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-ink-error-light px-3 py-2 text-sm text-ink-error">
          <i className="ri-error-warning-line" />
          <span className="flex-1 truncate">{error}</span>
          <button
            onClick={retry}
            className="shrink-0 text-xs font-medium underline underline-offset-2 hover:text-ink-error/80"
          >
            Retry
          </button>
          <button
            onClick={() => setError(null)}
            className="shrink-0 text-ink-error/60 hover:text-ink-error"
          >
            <i className="ri-close-line text-sm" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-ink-border px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题..."
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none rounded-xl border border-ink-border bg-ink-surface px-3 py-2.5 text-sm text-ink-text placeholder:text-ink-text-light outline-none transition-colors focus:border-ink-primary/40 focus:ring-2 focus:ring-ink-primary/10 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
              input.trim() && !isStreaming
                ? "bg-ink-primary text-white hover:bg-ink-primary-dark active:scale-95"
                : "bg-ink-surface text-ink-text-light cursor-not-allowed",
            )}
          >
            <i className="ri-send-plane-2-fill text-base" />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-ink-text-light text-center">
          Enter 发送，Shift + Enter 换行
        </p>
      </div>
    </div>
  );
});

export default ChatInterface;
