import { statfs } from "node:fs/promises";
import { consumeQuota } from "../rate-limit";
import { MIN_FREE_DISK_BYTES, UPLOAD_BYTES_PER_DAY, UPLOAD_QUOTA_WINDOW_MS } from "./limits";

/** 업로드 전 검사. 횟수 한도와 달리 실제 용량을 셈(20MB 를 반복하면 횟수만으로는 디스크를 못 지킴). */
export async function checkUploadQuota(
  userId: string,
  scope: keyof typeof UPLOAD_BYTES_PER_DAY,
  bytes: number,
): Promise<string | null> {
  try {
    const fs = await statfs(process.cwd());
    if (Number(fs.bavail) * Number(fs.bsize) < MIN_FREE_DISK_BYTES) {
      console.error("[upload] 디스크 여유 부족으로 업로드 거부");
      return "지금은 파일을 올릴 수 없어요. 잠시 후 다시 시도해 주세요.";
    }
  } catch {
    // 확인 실패는 업로드를 막지 않음
  }
  const over = consumeQuota(`upload-bytes:${scope}:${userId}`, bytes, UPLOAD_BYTES_PER_DAY[scope], UPLOAD_QUOTA_WINDOW_MS);
  return over ? "오늘 올릴 수 있는 용량을 모두 썼어요. 내일 다시 시도해 주세요." : null;
}
