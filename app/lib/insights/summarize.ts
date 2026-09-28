import "server-only";
import OpenAI from "openai";

// 수집 항목의 한국어 요약. 기존 OPENAI_* 설정을 쓴다.
// 원문을 대체하지 않도록 1~2문장으로 짧게 만든다.

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// 한 번에 넘기는 항목 수. 항목당 1회 호출하면 호출 수가 그대로 비용이라 묶어서 보낸다.
const BATCH_SIZE = 8;

let _client: OpenAI | null = null;
function client(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 환경변수가 설정되지 않았습니다.");
  if (!_client) _client = new OpenAI({ apiKey });
  return _client;
}

const SYSTEM_PROMPT = [
  "당신은 AI 분야 논문·소식을 한국어로 아주 짧게 요약하는 편집자입니다.",
  "규칙:",
  "- 항목마다 정확히 1~2문장. 원문을 대체할 만큼 길게 쓰지 마세요.",
  "- 무엇을 했고 왜 중요한지만 담고, 수치·실험 세부는 넣지 마세요.",
  "- 주어진 내용에 없는 사실을 지어내지 마세요.",
  "- 번역투를 피하고 자연스러운 한국어로 쓰되, 정착된 전문용어는 그대로 두세요.",
  "- 각 항목의 id를 반드시 그대로 돌려주세요.",
].join("\n");

export type SummarizeInput = { id: string; title: string; abstract: string };

/**
 * 항목별 한국어 요약. 반환은 id → 요약 맵.
 * 배치 하나가 실패해도 예외를 던지지 않고 그 배치만 비운다(항목은 제목·링크로 표시된다).
 */
export async function summarizeItems(
  items: SummarizeInput[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (items.length === 0) return result;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const allowed = new Set(batch.map((b) => b.id));

    const payload = batch
      .map((b) => `id="${b.id}"\n제목: ${b.title}\n초록: ${b.abstract.slice(0, 1200)}`)
      .join("\n\n---\n\n");

    try {
      const resp = await client().chat.completions.create({
        model: MODEL,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: payload },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "insight_summaries",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                summaries: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      id: { type: "string" },
                      summaryKo: { type: "string" },
                    },
                    required: ["id", "summaryKo"],
                  },
                },
              },
              required: ["summaries"],
            },
          },
        },
      });

      const parsed = JSON.parse(resp.choices[0]?.message?.content || "{}") as {
        summaries?: { id: string; summaryKo: string }[];
      };
      // 요청하지 않은 id 는 버린다
      for (const s of parsed.summaries || []) {
        if (allowed.has(s.id) && s.summaryKo?.trim()) {
          result.set(s.id, s.summaryKo.trim());
        }
      }
    } catch (e) {
      console.error("[insights] 요약 배치 실패:", e);
    }
  }

  return result;
}
