import "server-only";
import type { NewsItem } from "./news";

// 과학기술정보통신부 보도자료(공공데이터포털). 공공누리 1유형이라 출처 표기 조건으로 재배포할 수 있다.
//
// 기본 User-Agent 로 호출하면 WAF 가 HTML 로 "400 Request Blocked" 를 돌려주므로 브라우저 UA 를 쓴다.
// 키가 틀린 경우에는 SERVICE_KEY_IS_NOT_REGISTERED_ERROR 가 온다.

const ENDPOINT =
  "https://apis.data.go.kr/1721000/msitpressreleaseinfo/pressReleaseList";

const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** 공공누리 1유형 표기. 화면에 반드시 노출한다. */
export const MSIT_CITATION =
  "본 저작물은 '과학기술정보통신부'에서 작성하여 공공누리 제1유형으로 개방한 보도자료를 이용하였습니다.";

/**
 * 보도자료 대부분이 AI 와 무관하므로 제목으로 거른다.
 * "AI" 가 영단어 일부("Airfoil" 등)에 걸리지 않도록 단어 경계를 둔다.
 */
const AI_PATTERN =
  /인공지능|생성형|초거대|거대언어|머신러닝|딥러닝|LLM|(^|[^A-Za-z])AI([^A-Za-z]|$)/;

type MsitItem = {
  subject?: string;
  viewUrl?: string;
  pressDt?: string;
  deptName?: string;
};

/** 응답이 `{response: [{header}, {body}]}` 배열 구조라 인덱스가 아니라 키로 찾는다. */
function pickBody(json: unknown): { items?: { item?: MsitItem }[] } | null {
  const arr = (json as { response?: unknown[] })?.response;
  if (!Array.isArray(arr)) return null;
  for (const entry of arr) {
    const body = (entry as { body?: unknown }).body;
    if (body && typeof body === "object") return body as { items?: { item?: MsitItem }[] };
  }
  return null;
}

function resultMessage(json: unknown): string | null {
  const arr = (json as { response?: unknown[] })?.response;
  if (!Array.isArray(arr)) return null;
  for (const entry of arr) {
    const header = (entry as { header?: { resultCode?: string; resultMsg?: string } }).header;
    if (header?.resultCode && header.resultCode !== "00") {
      return `${header.resultCode} ${header.resultMsg ?? ""}`.trim();
    }
  }
  return null;
}

/** "YYYY-MM-DD" → Date(UTC 기준) */
function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(`${s.trim()}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 상세 URL의 nttSeqNo가 사실상 게시물 ID다. 없으면 URL 자체를 키로 쓴다. */
function externalIdOf(viewUrl: string): string {
  const m = /[?&]nttSeqNo=(\d+)/.exec(viewUrl);
  return m ? `msit-${m[1]}` : viewUrl;
}

/**
 * 최근 보도자료를 받아 AI 관련만 남긴다.
 * AI 관련 비중이 낮아 scanRows 를 넉넉히 잡는다.
 */
export async function fetchMsitNews(scanRows = 100): Promise<NewsItem[]> {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) throw new Error("DATA_GO_KR_KEY 가 설정되지 않았습니다.");

  const url = new URL(ENDPOINT);
  // 인증키는 그대로 붙인다. URLSearchParams가 알아서 인코딩하므로 직접 encodeURIComponent
  // 하면 이중 인코딩이 되어 SERVICE_KEY_IS_NOT_REGISTERED_ERROR 가 난다.
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", String(scanRows));
  url.searchParams.set("returnType", "json");

  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": BROWSER_UA },
  });
  if (!res.ok) {
    throw new Error(`과기정통부 응답 오류: HTTP ${res.status}`);
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // WAF에 막히면 JSON이 아니라 HTML이 온다. 앞부분을 남겨야 원인이 보인다.
    throw new Error(`과기정통부 응답이 JSON이 아닙니다: ${text.slice(0, 120)}`);
  }

  const failure = resultMessage(json);
  if (failure) throw new Error(`과기정통부 오류: ${failure}`);

  const items = pickBody(json)?.items ?? [];

  return items
    .map((wrapper) => {
      const it = wrapper?.item;
      const subject = it?.subject?.trim();
      const viewUrl = it?.viewUrl?.trim();
      const publishedAt = parseDate(it?.pressDt);
      if (!subject || !viewUrl || !publishedAt) return null;
      if (!AI_PATTERN.test(subject)) return null;

      return {
        source: "msit" as const,
        externalId: externalIdOf(viewUrl),
        url: viewUrl,
        title: subject,
        // 출처 자리에 담당 부서를 보여준다
        category: it?.deptName?.trim() || "과학기술정보통신부",
        publishedAt,
      };
    })
    .filter((n) => n !== null);
}
