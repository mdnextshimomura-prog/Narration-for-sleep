import Anthropic from "@anthropic-ai/sdk";
import {
  REVIEW_MODEL,
  EDITOR_MODEL,
  REVIEW_MAX_TOKENS,
} from "@/lib/constants";
import {
  scriptBlock,
  reviewTrigger,
  complianceStagePrompt,
  proofreadStagePrompt,
  rubyStagePrompt,
  editorSystemPrompt,
  editorUserPrompt,
} from "@/lib/reviewPrompts";
import type {
  ErrorCode,
  ReviewCandidate,
  ReviewDept,
  ReviewEvent,
  ReviewIssue,
} from "@/types";

export const runtime = "nodejs";
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

// プレフィル `[` から続くJSONを寛容にパースする。
function parseJsonArray<T>(raw: string): T[] {
  const txt = raw.trim();
  try {
    const parsed = JSON.parse(txt);
    if (Array.isArray(parsed)) return parsed as T[];
  } catch {
    // 末尾に余計な文字が付いた場合に備えてフォールバック
  }
  const start = txt.indexOf("[");
  const end = txt.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const parsed = JSON.parse(txt.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed as T[];
    } catch {
      // あきらめて空配列
    }
  }
  return [];
}

function textFromMessage(message: Anthropic.Message): string {
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}

// 検査部門1つ分の呼び出し（Haiku）。
async function runReviewStage(
  client: Anthropic,
  script: string,
  stagePrompt: string,
  dept: ReviewDept,
): Promise<ReviewIssue[]> {
  const message = await client.messages.create({
    model: REVIEW_MODEL,
    max_tokens: REVIEW_MAX_TOKENS,
    system: `${stagePrompt}\n\n${scriptBlock(script)}`,
    messages: [
      { role: "user", content: reviewTrigger },
      { role: "assistant", content: "[" },
    ],
  });

  const issues = parseJsonArray<Partial<ReviewIssue>>("[" + textFromMessage(message));
  return issues
    .filter((i) => i && typeof i.reason === "string")
    .map((i) => ({
      dept,
      category: typeof i.category === "string" ? i.category : "その他",
      severity:
        i.severity === "high" || i.severity === "medium" || i.severity === "low"
          ? i.severity
          : "medium",
      excerpt: typeof i.excerpt === "string" ? i.excerpt : "",
      before: typeof i.before === "string" ? i.before : "",
      after: typeof i.after === "string" ? i.after : "",
      reason: i.reason as string,
    }));
}

// ⑤ 編集判断部（Sonnet）。各部門の指摘JSONを受け取り統合する。
async function runEditor(
  client: Anthropic,
  compliance: ReviewIssue[],
  proofread: ReviewIssue[],
  ruby: ReviewIssue[],
): Promise<ReviewIssue[]> {
  const message = await client.messages.create({
    model: EDITOR_MODEL,
    max_tokens: REVIEW_MAX_TOKENS,
    system: editorSystemPrompt,
    messages: [
      {
        role: "user",
        content: editorUserPrompt(
          JSON.stringify(compliance),
          JSON.stringify(proofread),
          JSON.stringify(ruby),
        ),
      },
      { role: "assistant", content: "[" },
    ],
  });

  const merged = parseJsonArray<Partial<ReviewIssue>>("[" + textFromMessage(message));
  return merged
    .filter((i) => i && typeof i.reason === "string")
    .map((i) => ({
      dept:
        i.dept === "compliance" || i.dept === "proofread" || i.dept === "ruby"
          ? i.dept
          : "proofread",
      category: typeof i.category === "string" ? i.category : "その他",
      severity:
        i.severity === "high" || i.severity === "medium" || i.severity === "low"
          ? i.severity
          : "medium",
      excerpt: typeof i.excerpt === "string" ? i.excerpt : "",
      before: typeof i.before === "string" ? i.before : "",
      after: typeof i.after === "string" ? i.after : "",
      reason: i.reason as string,
    }));
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "MISSING_API_KEY" }, { status: 500 });
  }

  let text: unknown;
  try {
    ({ text } = await request.json());
  } catch {
    return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  if (typeof text !== "string" || text.trim().length < 50) {
    return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const script = text;

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ReviewEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        const stages: Array<[ReviewDept, string]> = [
          ["compliance", complianceStagePrompt],
          ["proofread", proofreadStagePrompt],
          ["ruby", rubyStagePrompt],
        ];

        stages.forEach(([dept]) => send({ type: "stage_start", stage: dept }));

        // 3部門を並行実行。終わったものから進捗を流す。
        const results = await Promise.all(
          stages.map(async ([dept, prompt]) => {
            const issues = await runReviewStage(client, script, prompt, dept);
            send({ type: "stage_done", stage: dept, issueCount: issues.length });
            return issues;
          }),
        );
        const [compliance, proofread, ruby] = results;

        send({ type: "stage_start", stage: "editor" });
        const merged = await runEditor(client, compliance, proofread, ruby);

        const candidates: ReviewCandidate[] = merged.map((issue, index) => ({
          ...issue,
          id: `cand-${index}`,
          applicable: issue.before.length > 0 && script.includes(issue.before),
        }));

        send({ type: "stage_done", stage: "editor", issueCount: candidates.length });
        send({
          type: "result",
          candidates,
          summary: {
            compliance: compliance.length,
            proofread: proofread.length,
            ruby: ruby.length,
          },
        });
        controller.close();
      } catch (err) {
        const code = classifyError(err);
        try {
          send({ type: "error", code });
        } catch {
          // コントローラが閉じている場合は無視
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
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
