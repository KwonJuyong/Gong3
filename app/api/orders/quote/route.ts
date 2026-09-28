/**
 * 견적서 PDF. 발주를 만들지 않고 입력값만으로 렌더한다(결재 전에 받는 문서라 저장하지 않는다).
 * 금액은 발주 생성과 같은 함수로 계산한다.
 */
import { type NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/app/session-server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { prisma } from "@/app/db";
import { computeAmountsFromSubtotal, DEFAULT_FEE_RATE_BP } from "@/app/lib/money";
import { getPlatformAccount, getQuoteSupplier } from "@/app/lib/orgSettings";
import { canTransact } from "@/app/lib/bizProfile";
import { readImageForPdf } from "@/app/lib/pdfImage";
import { tierOf, enforceFloor } from "@/app/lib/quoteTiers";
import QuotePdf, { type QuoteData } from "@/app/dashboard/orders/QuotePdf";

export const dynamic = "force-dynamic";

const seoulDate = (d: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(d);

/** 견적번호 — 저장하지 않으므로 날짜+시각으로 유일성을 만든다 */
function quoteNo(now: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
    .format(now)
    .replace(/[^0-9]/g, "");
  return `QT-${p.slice(0, 8)}-${p.slice(8, 12)}`;
}

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: userId } });
  // 발주 화면과 같은 조건: 유효한 사업자등록번호가 있거나 ADMIN.
  // canTransact 가 타입을 좁히지 않으므로 me 의 null 검사도 따로 한다.
  if (!me || !(await canTransact(me))) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const int = (k: string) => Number.parseInt((sp.get(k) ?? "").replace(/[^0-9]/g, ""), 10);
  const str = (k: string) => (sp.get(k) ?? "").trim();

  // 서비스명은 임의 문자열이 찍히지 않도록 id 로 받아 DB 에서 읽는다.
  const serviceId = str("serviceId");
  const service = serviceId
    ? await prisma.service.findUnique({ where: { id: serviceId }, select: { name: true } })
    : null;
  const serviceName = service?.name || str("serviceName") || "AI 평가";

  // 보상 항목은 여러 줄을 받는다(회차마다 단가·인원이 다를 수 있다).
  // 같은 이름의 input 이 반복되므로 getAll 로 짝지어 읽는다.
  const labels = sp.getAll("itemLabel");
  const tiers = sp.getAll("itemTier");
  const qtys = sp.getAll("itemQty");
  const rounds = sp.getAll("itemRounds");
  const units = sp.getAll("itemUnit");

  const num = (v: string | undefined) =>
    Number.parseInt((v ?? "").replace(/[^0-9]/g, ""), 10);

  const items = qtys
    .map((q, i) => {
      const tierKey = (tiers[i] ?? "").trim();
      return {
        label: (labels[i] ?? "").trim(),
        tierKey,
        tierLabel: tierKey ? tierOf(tierKey).label : "",
        qty: num(q),
        // 회차 수는 생략 가능하다(대부분 1회). 비면 1로 본다.
        rounds: Number.isInteger(num(rounds[i])) && num(rounds[i]) > 0 ? num(rounds[i]) : 1,
        // 단가 하한은 서버에서도 적용한다.
        unitPrice: tierKey ? enforceFloor(tierKey, num(units[i])) : num(units[i]),
      };
    })
    .filter((it) => Number.isInteger(it.qty) && it.qty > 0 && Number.isInteger(it.unitPrice) && it.unitPrice > 0)
    .map((it, i) => ({
      ...it,
      // 라벨이 비면 서비스명으로 채운다. 여러 줄일 땐 몇 번째인지가 보여야 한다.
      label: it.label || `${serviceName} 평가${qtys.length > 1 ? ` · ${i + 1}회차` : " · 평가단 보상"}`,
    }));

  if (items.length === 0) {
    return NextResponse.json(
      { error: "인원과 1인당 보상액을 입력하세요." },
      { status: 400 },
    );
  }

  const subtotal = items.reduce((s, it) => s + it.qty * it.rounds * it.unitPrice, 0);

  const feeRateBp = Number.isInteger(int("feeRateBp")) ? int("feeRateBp") : DEFAULT_FEE_RATE_BP;
  // 수수료·부가세는 발주와 같은 함수로 계산한다.
  const amounts = computeAmountsFromSubtotal(subtotal, feeRateBp);

  const [supplier, account] = await Promise.all([getQuoteSupplier(), getPlatformAccount()]);
  // 직인은 없어도 발급된다 — readImageForPdf 가 실패 시 null 을 준다.
  const sealImg = await readImageForPdf(supplier.sealUrl);

  const now = new Date();
  const validUntil = new Date(now.getTime() + 30 * 86400_000); // 30일

  const data: QuoteData = {
    quoteNo: quoteNo(now),
    issuedAt: seoulDate(now),
    validUntil: seoulDate(validUntil),
    supplier,
    buyer: {
      name: str("bizName"),
      ceo: str("bizCeo"),
      bizNo: str("bizNo"),
      addr: str("bizAddr"),
      manager: str("manager") || me.name,
    },
    serviceName,
    items,
    deliveryTerm: str("deliveryTerm"),
    feeRateBp,
    ...amounts,
    account: account.account ? `${account.bank} ${account.account} (${account.holder})` : "",
    sealImg,
  };

  // 래퍼 컴포넌트라 renderToBuffer 의 타입과 맞지 않아 단언한다.
  const element = createElement(QuotePdf, { d: data }) as never;
  const buffer = await renderToBuffer(element);

  const filename = `견적서_${data.quoteNo}.pdf`;
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
