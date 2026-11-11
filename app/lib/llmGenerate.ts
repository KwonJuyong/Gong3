import OpenAI from "openai";
import { LLM_LONG_TIMEOUT_MS, LLM_MAX_RETRIES } from "./limits";

// LLM 문항 문구 생성(OpenAI). 구성개념과 척도는 고정하고 LLM 은 문구만 만듦
// Structured Outputs(json_schema)로 출력 필드를 constructId/questionText 로 제한함

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const PROMPT_VERSION = "adaptive-v1";
export const ADAPTIVE_SCALE = "LIKERT_5"; // LLM 적응 문항의 고정 척도(5점 동의)

let _client: OpenAI | null = null;
function client(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 환경변수가 설정되지 않았습니다.");
  if (!_client) _client = new OpenAI({ apiKey, timeout: LLM_LONG_TIMEOUT_MS, maxRetries: LLM_MAX_RETRIES });
  return _client;
}

export function activeModel(): string {
  return MODEL;
}

export type GenConstruct = { id: string; name: string; description: string };
export type GenService = {
  name: string;
  preset: string | null;
  modality: string;
  isAiService: boolean;
  hasRecommendation: boolean;
  isSafetyCritical: boolean;
  hasPersonalData: boolean;
  userFacingUi: boolean;
};

const SYSTEM_PROMPT = [
  "당신은 검증된 소프트웨어 품질평가 설문의 '문항 문구'만 작성하는 전문가입니다.",
  "측정 대상(구성개념)과 응답 척도(5점 리커트 동의 척도)는 이미 고정되어 있습니다. 절대 바꾸지 마세요.",
  "각 구성개념에 대해, 주어진 서비스에 자연스럽게 들어맞는 한국어 평가 문항을 정확히 1개 작성하세요.",
  "규칙:",
  "- 5점 동의 척도('전혀 그렇지 않다'~'매우 그렇다')로 응답 가능한 평서문(진술문)일 것.",
  "- 한 문항에 하나의 개념만 담을 것(이중 질문 금지). 유도 질문·부정문 금지.",
  "- 해당 구성개념의 측정 대상을 벗어나지 말 것. 문구만 서비스 맥락에 맞게 조정.",
  "- 서비스명을 자연스럽게 녹이되 과장·마케팅 표현은 쓰지 말 것.",
].join("\n");

/**
 * 입력 형태별 문구 지침
 * modality 는 구성개념 선택(surveyProfile.ts 의 A_MODALITY)에도 반영되고, 여기는 문구만 조정함
 */
const MODALITY_GUIDE: Record<string, string> = {
  text: "이 서비스는 텍스트로 입출력한다. 문장 품질·이해·응답 흐름을 기준으로 표현할 것.",
  image:
    "이 서비스는 이미지를 다룬다. '보이는 결과물'을 기준으로 표현할 것(무엇이 어떻게 보이는가). 텍스트 문장 품질로 표현하지 말 것.",
  voice:
    "이 서비스는 음성으로 입출력한다. '듣고 말하는 상황'을 기준으로 표현할 것(알아듣는 정확도, 말소리의 자연스러움). 화면을 전제로 표현하지 말 것.",
  multimodal:
    "이 서비스는 텍스트·이미지·음성 등 여러 형태를 함께 다룬다. 특정 한 형태만 전제하지 말고, 필요하면 형태 간 관계까지 포함해 표현할 것.",
};

function describeService(s: GenService): string {
  const attrs =
    [
      s.isAiService && "AI 서비스",
      s.hasRecommendation && "추천·개인화",
      s.isSafetyCritical && "안전 민감(safety-critical)",
      s.hasPersonalData && "개인정보 수집",
      s.userFacingUi && "사용자 대면 UI",
    ]
      .filter(Boolean)
      .join(", ") || "없음";
  return [
    `서비스명: ${s.name}`,
    `유형(프리셋): ${s.preset ?? "미지정"}`,
    `입력형태(modality): ${s.modality}`,
    `입력형태 지침: ${MODALITY_GUIDE[s.modality] ?? MODALITY_GUIDE.text}`,
    `속성: ${attrs}`,
  ].join("\n");
}

/** 활성 LLM 적응 구성개념들에 대해 문항 문구를 1회 호출로 생성 */
export async function generateAdaptiveQuestions(
  service: GenService,
  constructs: GenConstruct[],
): Promise<{ constructId: string; questionText: string }[]> {
  if (constructs.length === 0) return [];

  const constructList = constructs
    .map((c) => `- id="${c.id}" | ${c.name}: ${c.description}`)
    .join("\n");

  const resp = await client().chat.completions.create({
    model: MODEL,
    temperature: 0.4,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${describeService(service)}\n\n[문항을 생성할 구성개념 목록]\n${constructList}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "adaptive_questions",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  constructId: { type: "string" },
                  questionText: { type: "string" },
                },
                required: ["constructId", "questionText"],
              },
            },
          },
          required: ["questions"],
        },
      },
    },
  });

  const raw = resp.choices[0]?.message?.content || "{}";
  let parsed: { questions?: { constructId: string; questionText: string }[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("LLM 응답 파싱 실패");
  }

  // 요청한 구성개념 id 만 받음
  const allowed = new Set(constructs.map((c) => c.id));
  return (parsed.questions || [])
    .filter((q) => allowed.has(q.constructId) && (q.questionText || "").trim())
    .map((q) => ({ constructId: q.constructId, questionText: q.questionText.trim() }));
}
