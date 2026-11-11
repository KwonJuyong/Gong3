import { NextResponse, type NextRequest } from "next/server";
import { lookup } from "dns/promises";
import { lookup as lookupCb, type LookupAddress } from "dns";
import { request as httpRequest, type IncomingHttpHeaders } from "http";
import { request as httpsRequest } from "https";
import { isIP, type LookupFunction } from "net";
import { prisma } from "@/app/db";
import { getSessionUserId } from "@/app/session-server";
import { isPublicAddress } from "@/app/lib/publicAddress";
import { checkLimit } from "@/app/lib/limits";

/**
 * 평가할 서비스를 iframe 으로 띄울 수 있는지 판정함
 *
 * X-Frame-Options·CSP frame-ancestors 로 막힌 서비스는 브라우저가 거부 사실을 페이지에
 * 알려주지 않으므로 서버에서 응답 헤더를 확인함. 판단할 수 없으면 null.
 *
 * SSRF 를 막기 위해 URL 이 아니라 평가 id 만 받고, 사설·예약 주소는 리다이렉트마다 다시 확인함
 * 상대 서버의 헤더나 본문은 돌려주지 않음
 */

const TIMEOUT_MS = 4000;
const MAX_REDIRECTS = 3;
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; embeddable: boolean | null }>();

async function isPublicHost(url: URL): Promise<boolean> {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  try {
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => isPublicAddress(a.address));
  } catch {
    return false;
  }
}

/**
 * 연결할 때 쓰는 주소를 그 자리에서 검사함. 미리 확인한 뒤 fetch 가 다시 조회하면
 * 그 사이 DNS 응답을 내부 주소로 바꾸는 방식(DNS 리바인딩)으로 검사를 피할 수 있음
 */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  lookupCb(hostname, { all: true }, (err, addrs: LookupAddress[]) => {
    if (err) return callback(err, "", 0);
    if (addrs.length === 0 || addrs.some((a) => !isPublicAddress(a.address))) {
      return callback(new Error("private address"), "", 0);
    }
    if ((options as { all?: boolean }).all) {
      return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addrs);
    }
    callback(null, addrs[0].address, addrs[0].family);
  });
};

/** 본문은 읽지 않고 상태·헤더만 받음 */
function fetchHead(url: URL): Promise<{ status: number; headers: IncomingHttpHeaders } | null> {
  return new Promise((resolve) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      { method: "GET", lookup: publicOnlyLookup, timeout: TIMEOUT_MS },
      (res) => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers });
        res.destroy();
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}

const headerValue = (h: IncomingHttpHeaders, name: string): string | undefined => {
  const v = h[name];
  return Array.isArray(v) ? v.join(", ") : v;
};

/** 응답 헤더로 판정. 우리 오리진을 명시적으로 허용한 경우만 true. */
function allowsFraming(headers: IncomingHttpHeaders, ourHost: string): boolean {
  const xfo = headerValue(headers, "x-frame-options")?.trim().toLowerCase();
  if (xfo && xfo !== "allowall") return false; // DENY·SAMEORIGIN·ALLOW-FROM(폐기) 전부 교차 출처 차단

  const csp = headerValue(headers, "content-security-policy");
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
    // IP 를 직접 적은 주소는 lookup 을 거치지 않으므로 여기서도 봄
    if (!(await isPublicHost(url))) return null;
    const res = await fetchHead(url);
    if (!res) return null;
    const loc = headerValue(res.headers, "location");
    if (res.status >= 300 && res.status < 400 && loc) {
      try {
        url = new URL(loc, url);
      } catch {
        return null;
      }
      continue;
    }
    return allowsFraming(res.headers, ourHost);
  }
  return null;
}

export async function GET(req: NextRequest) {
  // /api/* 는 middleware 밖이라 여기서 직접 봄. 존재를 알리지 않도록 404.
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

  const cacheKey = `${req.nextUrl.host}:${project.link}`;
  const hit = cache.get(cacheKey);
  let embeddable: boolean | null;
  if (hit && Date.now() - hit.at < CACHE_MS) {
    embeddable = hit.embeddable;
  } else {
    // 외부 서버로 요청이 나가는 경로. 판단 불가(null)면 화면은 버튼만 숨김
    if (checkLimit("frameCheck", userId)) return NextResponse.json({ embeddable: null });
    embeddable = await check(project.link, req.nextUrl.host);
    for (const [key, entry] of cache) {
      if (Date.now() - entry.at >= CACHE_MS) cache.delete(key);
    }
    if (cache.size >= 1000) cache.clear();
    cache.set(cacheKey, { at: Date.now(), embeddable });
  }
  return NextResponse.json({ embeddable }, { headers: { "Cache-Control": "private, max-age=600" } });
}
