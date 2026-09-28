import path from "path";
import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { wonInKorean } from "../../lib/money";
import type { PdfImage } from "../../lib/pdfImage";

/**
 * 견적서 PDF. 기업이 내부 결재에 쓰는 문서라 발주 전에 입력값만으로 만든다(/api/orders/quote).
 * 견적서는 법정 서식이 아니어서 자유 양식으로 직접 그린다. 한글 폰트는 NanumGothic.
 */

Font.register({
  family: "NanumGothic",
  fonts: [
    { src: path.join(process.cwd(), "public", "fonts", "NanumGothic-Regular.ttf") },
    {
      src: path.join(process.cwd(), "public", "fonts", "NanumGothic-Bold.ttf"),
      fontWeight: "bold",
    },
  ],
});
// 한글에는 자동 하이픈을 쓰지 않는다.
Font.registerHyphenationCallback((word) => [word]);

export interface QuoteItem {
  /** 품목명. 예: "개인화 챗봇 테스트 · 1회차" */
  label: string;
  /** 소요시간 구간 표시(비어 있어도 된다) */
  tierLabel: string;
  /** 인원 */
  qty: number;
  /** 회차 수(같은 조건을 반복하는 횟수) */
  rounds: number;
  /** 1인당 보상 (세전) */
  unitPrice: number;
}

export interface QuoteData {
  quoteNo: string;
  issuedAt: string;
  validUntil: string;
  /** 공급자(플랫폼) */
  supplier: {
    name: string;
    bizNo: string;
    ceo: string;
    addr: string;
    contact: string;
  };
  /** 공급받는자(기업) */
  buyer: {
    name: string;
    ceo: string;
    bizNo: string;
    addr: string;
    manager: string;
  };
  /** 직인 이미지. 없으면 직인 없이 만든다. */
  sealImg: PdfImage | null;
  serviceName: string;
  /** 보상 항목(회차마다 단가·인원이 다를 수 있어 여러 줄). 발주는 한 줄일 때만 가능하다. */
  items: QuoteItem[];
  /** 납기·이행 기간(예: "발주 후 3주 이내"). 비면 줄을 생략한다. */
  deliveryTerm: string;
  feeRateBp: number;
  subtotal: number;
  fee: number;
  vat: number;
  totalAmount: number;
  /** 입금 계좌. 비어 있으면 "-" 로 표시한다. */
  account: string;
}

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

/** 공급받는자 칸을 그릴지. manager 는 항상 값이 있어(로그인 사용자 이름) 판단에서 뺀다. */
function hasBuyer(b: QuoteData["buyer"]): boolean {
  return !!(b.name || b.bizNo || b.ceo || b.addr);
}

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "NanumGothic", fontSize: 9, color: "#111" },
  title: { fontSize: 20, fontWeight: "bold", textAlign: "center", marginBottom: 4 },
  quoteNo: { fontSize: 9, textAlign: "center", color: "#666", marginBottom: 20 },

  parties: { flexDirection: "row", gap: 12, marginBottom: 18 },
  party: { flex: 1, borderWidth: 1, borderColor: "#ccc", padding: 10 },
  partyTitle: { fontSize: 9, fontWeight: "bold", marginBottom: 6, color: "#444" },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 52, color: "#666" },
  value: { flex: 1 },

  total: {
    borderWidth: 1,
    borderColor: "#111",
    padding: 12,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { fontSize: 10, fontWeight: "bold" },
  totalRight: { alignItems: "flex-end" },
  totalValue: { fontSize: 16, fontWeight: "bold" },
  totalKorean: { fontSize: 9, color: "#444", marginTop: 3 },

  // 공급자 칸 안에 겹쳐 찍는 직인
  sealBox: { position: "absolute", right: 8, bottom: 8, width: 52, height: 52 },
  seal: { width: 52, height: 52, objectFit: "contain" },

  signLine: { marginTop: 18, alignItems: "flex-end" },
  signText: { fontSize: 10 },
  signWrap: { flexDirection: "row", alignItems: "center", marginTop: 2 },

  // (인) 자리. 직인은 이 위에 겹쳐 찍고, 직인이 없어도 도장 찍을 공간(44×44)을 남긴다.
  sealSlot: {
    position: "relative",
    width: 44,
    height: 44,
    marginLeft: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  sealSlotImg: { position: "absolute", top: 0, left: 0, width: 44, height: 44, objectFit: "contain" },

  th: { flexDirection: "row", backgroundColor: "#f2f2f2", borderTopWidth: 1, borderColor: "#ccc" },
  td: { flexDirection: "row", borderTopWidth: 1, borderColor: "#eee" },
  cell: { padding: 6 },
  cName: { flex: 1 },
  cTier: { width: 66 },
  cUnit: { width: 76, textAlign: "right" },
  cQty: { width: 40, textAlign: "right" },
  cRound: { width: 40, textAlign: "right" },
  cAmt: { width: 88, textAlign: "right" },
  bold: { fontWeight: "bold" },

  sumRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 6 },
  sumLabel: { width: 90, textAlign: "right", color: "#666", paddingRight: 8 },
  sumValue: { width: 100, textAlign: "right" },

  note: { marginTop: 22, borderTopWidth: 1, borderColor: "#ccc", paddingTop: 10 },
  noteTitle: { fontWeight: "bold", marginBottom: 4 },
  noteLine: { color: "#444", marginBottom: 2, lineHeight: 1.4 },
});

/**
 * @param hideEmpty 값이 비면 줄을 그리지 않는다(공급받는자용).
 * 공급자 정보는 빠진 것이 보이도록 "-" 로 남긴다.
 */
function Field({
  label,
  value,
  hideEmpty,
}: {
  label: string;
  value: string;
  hideEmpty?: boolean;
}) {
  if (hideEmpty && !value) return null;
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || "-"}</Text>
    </View>
  );
}

export default function QuotePdf({ d }: { d: QuoteData }) {
  return (
    <Document title={`견적서 ${d.quoteNo}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>견 적 서</Text>
        <Text style={s.quoteNo}>
          {d.quoteNo} · 작성일 {d.issuedAt}
        </Text>

        <View style={s.parties}>
          <View style={s.party}>
            <Text style={s.partyTitle}>공급자</Text>
            <Field label="상호" value={d.supplier.name} />
            <Field label="사업자번호" value={d.supplier.bizNo} />
            <Field label="대표자" value={d.supplier.ceo} />
            <Field label="주소" value={d.supplier.addr} />
            <Field label="연락처" value={d.supplier.contact} />
            {/* 직인(공급자 칸 안) */}
            {d.sealImg && (
              <View style={s.sealBox}>
                <Image style={s.seal} src={d.sealImg} />
              </View>
            )}
          </View>
          {/* 공급받는자 정보가 없으면 칸을 생략하고 공급자 칸이 전체 폭을 쓴다. */}
          {hasBuyer(d.buyer) && (
            <View style={s.party}>
              <Text style={s.partyTitle}>공급받는자</Text>
              <Field label="상호" value={d.buyer.name} hideEmpty />
              <Field label="사업자번호" value={d.buyer.bizNo} hideEmpty />
              <Field label="대표자" value={d.buyer.ceo} hideEmpty />
              <Field label="주소" value={d.buyer.addr} hideEmpty />
              <Field label="담당자" value={d.buyer.manager} hideEmpty />
            </View>
          )}
        </View>

        {/* 합계 금액(숫자와 한글 병기) */}
        <View style={s.total}>
          <Text style={s.totalLabel}>견적 금액 (부가세 포함)</Text>
          <View style={s.totalRight}>
            <Text style={s.totalValue}>{won(d.totalAmount)}</Text>
            <Text style={s.totalKorean}>{wonInKorean(d.totalAmount)}</Text>
          </View>
        </View>

        <View>
          <View style={s.th}>
            <Text style={[s.cell, s.cName, s.bold]}>품목</Text>
            <Text style={[s.cell, s.cTier, s.bold]}>소요시간</Text>
            <Text style={[s.cell, s.cUnit, s.bold]}>단가</Text>
            <Text style={[s.cell, s.cQty, s.bold]}>인원</Text>
            <Text style={[s.cell, s.cRound, s.bold]}>회차</Text>
            <Text style={[s.cell, s.cAmt, s.bold]}>금액</Text>
          </View>
          {d.items.map((it, i) => (
            <View style={s.td} key={i}>
              <Text style={[s.cell, s.cName]}>{it.label}</Text>
              <Text style={[s.cell, s.cTier]}>{it.tierLabel || "-"}</Text>
              <Text style={[s.cell, s.cUnit]}>{won(it.unitPrice)}</Text>
              <Text style={[s.cell, s.cQty]}>{it.qty}</Text>
              <Text style={[s.cell, s.cRound]}>{it.rounds}</Text>
              <Text style={[s.cell, s.cAmt]}>{won(it.qty * it.rounds * it.unitPrice)}</Text>
            </View>
          ))}
          <View style={s.td}>
            <Text style={[s.cell, s.cName]}>
              플랫폼 수수료 ({d.feeRateBp / 100}%) · 모집·검수·정산 대행
            </Text>
            <Text style={[s.cell, s.cTier]} />
            <Text style={[s.cell, s.cUnit]}>{won(d.fee)}</Text>
            <Text style={[s.cell, s.cQty]}>1식</Text>
            <Text style={[s.cell, s.cRound]} />
            <Text style={[s.cell, s.cAmt]}>{won(d.fee)}</Text>
          </View>
        </View>

        <View style={s.sumRow}>
          <Text style={s.sumLabel}>공급가액</Text>
          <Text style={s.sumValue}>{won(d.subtotal + d.fee)}</Text>
        </View>
        <View style={s.sumRow}>
          <Text style={s.sumLabel}>부가세(10%)</Text>
          <Text style={s.sumValue}>{won(d.vat)}</Text>
        </View>
        <View style={s.sumRow}>
          <Text style={[s.sumLabel, s.bold]}>합계</Text>
          <Text style={[s.sumValue, s.bold]}>{won(d.totalAmount)}</Text>
        </View>

        <View style={s.note}>
          <Text style={s.noteTitle}>견적 조건</Text>
          <Text style={s.noteLine}>· 유효기간: {d.validUntil} 까지</Text>
          {d.deliveryTerm ? (
            <Text style={s.noteLine}>· 납기: {d.deliveryTerm}</Text>
          ) : null}
          <Text style={s.noteLine}>
            · 결제: 무통장입금(계좌이체). 전자세금계산서를 발행합니다.
          </Text>
          {/* 계좌가 비어 있어도 줄을 남겨 빠진 것이 보이게 한다. */}
          <Text style={s.noteLine}>· 입금 계좌: {d.account || "-"}</Text>
          {/* 미달분 환불은 견적서에 적지 않는다(정산 마감 때 계산된다). */}
          <Text style={s.noteLine}>
            · 본 견적서는 거래 조건 제시를 위한 문서이며 세금계산서를 대체하지 않습니다.
          </Text>
        </View>

        {/* 문서 끝의 발행자 표시 */}
        <View style={s.signLine}>
          <Text style={s.signText}>위와 같이 견적합니다.</Text>
          <View style={s.signWrap}>
            <Text style={s.signText}>
              {d.issuedAt} · {d.supplier.name || "-"}
              {d.supplier.ceo ? ` ${d.supplier.ceo}` : ""}
            </Text>
            {/* (인) 위에 직인을 겹쳐 찍는다 */}
            <View style={s.sealSlot}>
              <Text style={s.signText}>(인)</Text>
              {d.sealImg && <Image style={s.sealSlotImg} src={d.sealImg} />}
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
