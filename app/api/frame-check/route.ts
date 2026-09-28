import { NextResponse, type NextRequest } from "next/server";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { prisma } from "@/app/db";
import { getSessionUserId } from "@/app/session-server";

/**
 * 평가할 서비스를 iframe 으로 띄울 수 있는지 판정한다.
 *
 * X-Frame-Options·CSP frame-ancestors 로 막힌 서비스는 브라우저가 거부 사실을 페이지에
 * 알려주지 않으므로 서버에서 응답 헤더를 확인한다. 판단할 수 없으면 null.
 *
 * SSRF 를 막기 위해 URL 이 아니라 평가 id 만 받고, 사설·예약 주소는 리다이렉트마다 다시 확인한다.
 * 상대 서버의 헤더나 본문은 돌려주지 않는다.
 */

const TIMEOUT_MS = 4000;
const MAX_REDIRECTS = 3;
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; embeddable: boolean | null }>();

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

async function isPublicHost(url: URL): Promise<boolean> {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  try {
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/** 응답 헤더로 판정. 우리 오리진을 명시적으로 허용한 경우만 true. */
function allowsFraming(headers: Headers, ourHost: string): boolean {
  const xfo = headers.get("x-frame-options")?.trim().toLowerCase();
  if (xfo && xfo !== "allowall") return false; // DENY·SAMEORIGIN·ALLOW-FROM(폐기) 전부 교차 출처 차단

  const csp = headers.get("content-security-policy");
  if (csp) {
    for (const directive of csp.split(/[;,]/)) {
      const [name, ...values] = directive.trim().split(/\s+/);
      if (name?.toLowerCase() !== "frame-ancestors") continue;
      const ok = values.some((v) => v === "*" || v.replace(/^https?:\/\//, "").replace(/\/$/, "") === ourHost);
      if (!ok) return false;
    }
  }
  return true;
}

async function check(link: string, ourHost: string): Promise<boolean | null> {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isPublicHost(url))) return null;
    let res: Response;
    try {
      res = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      return null;
    }
    await res.body?.cancel().catch(() => {});
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url);
      continue;
    }
    return allowsFraming(res.headers, ourHost);
  }
  return null;
}

export async function GET(req: NextRequest) {
  // /api/* 는 middleware 밖이라 여기서 직접 본다. 존재를 알리지 않도록 404.
  const userId = await getSessionUserId();
  const projectId = req.nextUrl.searchParams.get("p");
  if (!userId || !projectId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [user, project] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { link: true, creatorId: true, enrollments: { where: { userId, status: "ACCEPTED" }, select: { id: true } } },
    }),
  ]);
  const allowed = !!project && (user?.role === "ADMIN" || project.creatorId === userId || project.enrollments.length > 0);
  if (!allowed || !project?.link) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const hit = cache.get(project.link);
  let embeddable: boolean | null;
  if (hit && Date.now() - hit.at < CACHE_MS) {
    embeddable = hit.embeddable;
  } else {
    embeddable = await check(project.link, req.nextUrl.host);
    cache.set(project.link, { at: Date.now(), embeddable });
  }
  return NextResponse.json({ embeddable }, { headers: { "Cache-Control": "private, max-age=600" } });
}
