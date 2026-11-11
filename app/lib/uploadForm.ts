type UploadFormResult =
  | { form: FormData; bytes: number }
  | { error: string; status: 400 | 413 };

export async function readUploadForm(request: Request, maxFileSize: number): Promise<UploadFormResult> {
  const maxBytes = maxFileSize + 64 * 1024;
  const tooLarge = { error: "파일 크기가 업로드 한도를 넘었어요.", status: 413 } as const;
  const invalid = { error: "업로드 요청이 올바르지 않아요.", status: 400 } as const;
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length)) return invalid;
    if (Number(length) > maxBytes) return tooLarge;
  }
  if (!request.body) return invalid;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {});
        return tooLarge;
      }
      chunks.push(value);
    }
    // Content-Length 생략·축소 여부와 무관하게 실제 수신량으로 제한·집계
    const body = new Uint8Array(Buffer.concat(chunks, bytes));
    const form = await new Response(body, { headers: request.headers }).formData();
    return { form, bytes };
  } catch {
    return invalid;
  } finally {
    reader.releaseLock();
  }
}
