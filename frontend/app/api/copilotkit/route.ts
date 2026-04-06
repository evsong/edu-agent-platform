import { type NextRequest } from "next/server";

/**
 * CopilotKit Runtime API Route
 *
 * Proxies CopilotKit requests to the backend /api/chat/ SSE endpoint.
 * Translates between CopilotKit's message format and our backend chat API.
 */

export async function POST(req: NextRequest) {
  const body = await req.json();
  const backendUrl = process.env.BACKEND_URL || "http://backend:8000";

  // Extract the last user message from CopilotKit's message array
  const messages: Array<{ role: string; content: string }> =
    body.messages || [];
  const lastUserMessage =
    messages
      .filter((m: { role: string }) => m.role === "user")
      .pop()?.content || "";

  // Forward to our backend chat endpoint
  const response = await fetch(`${backendUrl}/api/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: lastUserMessage,
      course_id: body.metadata?.course_id || "default",
      history: messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    return new Response(
      JSON.stringify({ error: "Backend chat request failed" }),
      {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Forward the SSE stream from the backend
  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
