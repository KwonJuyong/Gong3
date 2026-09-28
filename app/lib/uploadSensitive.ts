/**
 * 전자서명·직인 업로드(클라이언트 헬퍼).
 *
 * 공개 경로(/api/upload → public/uploads) 대신 민감 첨부 저장소(/api/attachments)에 올린다.
 * 돌려받은 URL 을 signatureUrl 등에 그대로 저장하면 되고, PDF 는 readImageForPdf 가 읽는다.
 */

/** SIGNATURE(전자서명) · SEAL(직인). 이전 문서를 다시 출력할 수 있도록 교체하지 않고 쌓는다. */
export type SensitiveImageKind = "SIGNATURE" | "SEAL";

/** ok 로 판별한다(타입이 url 을 좁힐 수 있도록). */
export type UploadOutcome =
  /** `signatureUrl` 등에 그대로 저장할 값 */
  { ok: true; url: string } | { ok: false; error: string };

/** 파일 하나를 올리고 저장용 URL 을 돌려준다. 예외 대신 error 를 돌려주고 호출부가 표시한다. */
export async function uploadSensitiveImage(
  file: File,
  kind: SensitiveImageKind,
): Promise<UploadOutcome> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    const res = await fetch("/api/attachments", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json?.error ?? "업로드에 실패했습니다." };
    return { ok: true, url: `/api/attachments/${json.attachment.id}` };
  } catch {
    return { ok: false, error: "업로드에 실패했습니다. 잠시 후 다시 시도하세요." };
  }
}
