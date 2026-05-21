import Anthropic from "@anthropic-ai/sdk";
import { systemPrompt, userPrompt, continuationPrompt } from "@/lib/systemPrompt";
import {
  MODEL,
  MAX_TOKENS_PER_PASS,
  MAX_PASSES,
  MAX_TOTAL_CHARS,
  ERROR_MARKER,
} from "@/lib/constants";
import type { ErrorCode } from "@/types";

export const runtime = "nodejs";
// 40,000字の生成は長時間かかるため、実行時間の上限を伸ばす。
export const maxDuration = 800;

function classifyError(err: unknown): ErrorCode {
  const e = err as { status?: number; name?: string } | undefined;
  if (e?.status === 429) return "RATE_LIMIT";
  if (e?.status === 401 || e?.status === 403) return "AUTH";
  if (e?.name === "APIConnectionError" || e?.name === "APIConnectionTimeoutError") {
    return "NETWORK";
  }
  return "UNKNOWN";
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "MISSING_API_KEY" }, { status: 500 });
  }

  let name: unknown;
  try {
    ({ name } = await request.json());
  } catch {
    return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const trimmedName = name.trim();

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 継続生成のための会話履歴を積み上げていく。
      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: userPrompt(trimmedName) },
      ];

      try {
        let pass = 0;
        let totalChars = 0;

        while (pass < MAX_PASSES) {
          pass++;
          const stream = client.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS_PER_PASS,
            system: systemPrompt,
            messages,
          });

          let passText = "";
          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              passText += chunk.delta.text;
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }

          const finalMessage = await stream.finalMessage();
          totalChars += passText.length;

          // 自然に終わった、または安全上限を超えたら終了。
          if (finalMessage.stop_reason !== "max_tokens") break;
          if (totalChars >= MAX_TOTAL_CHARS) break;

          // max_tokens で打ち切られたので、続きを生成させる。
          messages.push({ role: "assistant", content: passText });
          messages.push({ role: "user", content: continuationPrompt });
        }

        controller.close();
      } catch (err) {
        const code = classifyError(err);
        // すでに 200 OK で応答を開始しているため、ステータスは変えられない。
        // 制御マーカーで種別をフロントに伝える。
        try {
          controller.enqueue(encoder.encode(ERROR_MARKER + code));
        } catch {
          // コントローラがすでに閉じている場合は無視する。
        }
        try {
          controller.close();
        } catch {
          // 同上
        }
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
