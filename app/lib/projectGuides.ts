/** 평가 참고자료·매뉴얼 첨부(Project.guides) 공용 타입·검증·주소 헬퍼 */

export type ProjectGuide = {
  url: string;
  name: string;
  kind: "image" | "file";
};

export const MAX_PROJECT_GUIDES = 5;

const GUIDE_URL_RE =
  /^\/api\/uploads\/[0-9a-f-]{36}\.(png|jpe?g|gif|webp|pdf|txt|csv|tsv|md|json|log|docx?|xlsx?|pptx?|hwpx?|zip|7z|rar)$/i;

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp)$/i;

/** DB JSON 또는 폼 문자열에서 안전한 참고자료 목록만 추출함 */
export function parseProjectGuides(raw: unknown): ProjectGuide[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return [];
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const out: ProjectGuide[] = [];
  for (const item of list) {
    if (out.length >= MAX_PROJECT_GUIDES) break;
    if (!item || typeof item !== "object") continue;
    const url = String((item as { url?: unknown }).url ?? "");
    const name = String((item as { name?: unknown }).name ?? "").trim().slice(0, 200);
    if (!GUIDE_URL_RE.test(url) || !name) continue;
    const kind: "image" | "file" = IMAGE_EXT_RE.test(url) ? "image" : "file";
    out.push({ url, name, kind });
  }
  return out;
}

/** 브라우저에서 새 탭 미리보기가 가능한 형식(이미지·PDF)인지 판정함 */
export function isPreviewableGuide(g: ProjectGuide): boolean {
  return g.kind === "image" || g.url.toLowerCase().endsWith(".pdf");
}

/** 미리보기 주소. 이미지·PDF는 인라인 표시, 기타 문서는 다운로드 */
export function guideViewUrl(g: ProjectGuide): string {
  const qs = new URLSearchParams({ name: g.name });
  if (g.url.toLowerCase().endsWith(".pdf")) qs.set("inline", "1");
  return `${g.url}?${qs.toString()}`;
}

/** 강제 다운로드 주소 */
export function guideDownloadUrl(g: ProjectGuide): string {
  const qs = new URLSearchParams({ name: g.name, download: "1" });
  return `${g.url}?${qs.toString()}`;
}

/** 클립보드 붙여넣기 파일에 확장자가 빠진 경우 MIME 기준으로 파일명을 보정함 */
export function normalizeUploadFile(file: File): File {
  if (file.name && /\.[a-z0-9]+$/i.test(file.name)) return file;
  const extMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };
  const ext = extMap[file.type];
  if (!ext) return file;
  return new File([file], `pasted-${Date.now()}.${ext}`, { type: file.type });
}
