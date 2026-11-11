import "server-only";
import { MAIL_TIMEOUT_MS } from "./limits";

/**
 * 메일 발송. Resend REST API 를 fetch 로 직접 호출함
 *
 * isConfigured() 가 false 면 호출부가 사용자에게 사유를 보여줌
 * MAIL_FROM 도메인은 Resend 에서 검증돼 있어야 함. 샌드박스 주소(onboarding@resend.dev)는
 * Resend 가입 주소로만 보낼 수 있어 운영에 쓸 수 없음
 */

const ENDPOINT = "https://api.resend.com/emails";

export function isConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;
}

export interface MailInput {
  to: string;
  subject: string;
  /** 본문(HTML). 텍스트 대체본은 Resend 가 자동 생성함 */
  html: string;
}

export interface MailResult {
  ok: boolean;
  error?: string;
}

export async function sendMail({ to, subject, html }: MailInput): Promise<MailResult> {
  if (!isConfigured()) return { ok: false, error: "메일 발송이 설정되지 않았습니다." };

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [to],
        subject,
        html,
        // 발신 도메인에는 수신 메일함이 없으므로 답장 받을 주소를 따로 붙임
        // 미설정이면 키를 빼야 함(빈 문자열은 400).
        ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}),
      }),
    });

    if (!res.ok) {
      // 실패 사유(도메인 미검증·키 오류 등)는 서버 로그에만 남김
      const body = await res.text().catch(() => "");
      console.error(`[mail] Resend ${res.status}: ${body.slice(0, 500)}`);
      return { ok: false, error: "메일 발송에 실패했습니다." };
    }
    return { ok: true };
  } catch (e) {
    console.error("[mail] 발송 실패", e);
    return { ok: false, error: "메일 발송에 실패했습니다." };
  }
}

/** 링크에 쓸 사이트 주소. compose 에 이미 있는 SITE_URL 을 재사용함 */
export function siteUrl(): string {
  return (process.env.SITE_URL || "https://evalia.co.kr").replace(/\/+$/, "");
}

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** 메일 본문에 사용자 입력(이름 등)을 넣을 때. HTML 메일이라 이스케이프가 필요함 */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c]);
}
