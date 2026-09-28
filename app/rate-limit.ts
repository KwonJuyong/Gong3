const attempts = new Map<string, { count: number; resetAt: number }>();

// 주기적으로 만료된 항목 정리 (메모리 누수 방지)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of attempts) {
    if (now > val.resetAt) attempts.delete(key);
  }
}, 60_000);

/**
 * 간단한 인메모리 Rate Limiter
 * @returns null이면 통과, string이면 에러 메시지
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number = 7,
  windowMs: number = 15 * 60 * 1000 // 15분
): string | null {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  entry.count++;

  if (entry.count > maxAttempts) {
    const remainMin = Math.ceil((entry.resetAt - now) / 60_000);
    return `너무 많은 시도입니다. ${remainMin}분 후에 다시 시도해주세요.`;
  }

  return null;
}
