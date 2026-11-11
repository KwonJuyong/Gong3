import path from "path";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Font,
  StyleSheet,
} from "@react-pdf/renderer";

// 한글 폰트 등록 (public/fonts): 모듈 로드 시 1회
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
// 줄바꿈 하이픈 제거(한글)
Font.registerHyphenationCallback((word) => [word]);

export interface ClaimEntry {
  date: string;
  start: string;
  end: string;
  content: string;
  amount: number;
}

export interface ClaimPdfData {
  affiliation: string;
  name: string;
  rrn: string; // 복호화된 평문 (없으면 빈 문자열)
  phone: string;
  address: string;
  accountNumber: string;
  bankName: string;
  entries: ClaimEntry[];
  totalAmount: number;
  consent: { personal: boolean; unique: boolean; thirdParty: boolean };
  signatureImg?: { data: Buffer; format: "png" | "jpg" } | null;
  directorSignImg?: { data: Buffer; format: "png" | "jpg" } | null;
}

const BORDER = "#000";

const s = StyleSheet.create({
  page: {
    fontFamily: "NanumGothic",
    fontSize: 8,
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 32,
    color: "#000",
  },
  title: { fontSize: 16, fontWeight: "bold", textAlign: "center", marginBottom: 10 },
  // 공통 테이블 셀
  row: { flexDirection: "row" },
  cell: {
    borderRightWidth: 0.7,
    borderColor: BORDER,
    paddingVertical: 3,
    paddingHorizontal: 3,
    justifyContent: "center",
  },
  labelCell: { backgroundColor: "#f2f2f2", fontWeight: "bold", textAlign: "center" },
  tableTop: { borderTopWidth: 0.7, borderColor: BORDER },
  rowBorder: { borderBottomWidth: 0.7, borderLeftWidth: 0.7, borderColor: BORDER },
  center: { textAlign: "center" },
  right: { textAlign: "right" },
  headCell: {
    backgroundColor: "#f2f2f2",
    fontWeight: "bold",
    textAlign: "center",
    borderRightWidth: 0.7,
    borderColor: BORDER,
    paddingVertical: 4,
    justifyContent: "center",
  },
  sign: { width: 42, height: 18, objectFit: "contain", alignSelf: "center" },
  consentBox: {
    marginTop: 12,
    borderWidth: 0.7,
    borderColor: BORDER,
    padding: 8,
  },
  consentTitle: { fontWeight: "bold", textAlign: "center", marginBottom: 3, fontSize: 9 },
  small: { fontSize: 7, lineHeight: 1.35 },
  subBox: { borderWidth: 0.7, borderColor: BORDER, paddingHorizontal: 6, paddingVertical: 4, marginTop: 4 },
  subHead: { fontWeight: "bold", fontSize: 8, marginBottom: 1 },
  sectMark: { fontSize: 7, fontWeight: "bold", marginTop: 1 },
  sub: { fontSize: 7, marginLeft: 7, lineHeight: 1.3 },
  agreeLine: { fontWeight: "bold", textAlign: "center", fontSize: 8, marginTop: 2, marginBottom: 1 },
  consentLine: { fontWeight: "bold", textAlign: "center", marginTop: 4, fontSize: 8 },
  footer: { marginTop: 12 },
  footerOrg: { fontSize: 14, fontWeight: "bold", marginTop: 8 },
});

function won(n: number): string {
  return `${(n || 0).toLocaleString("ko-KR")}원`;
}

function chk(v: boolean): string {
  // NanumGothic 에 체크박스 글리프가 없어 채워진 박스로 표시
  return v ? "(동의함 ■  동의하지 않음 □)" : "(동의함 □  동의하지 않음 ■)";
}

// 인적사항 셀 (라벨/값 한 칸)
function InfoCell({
  label,
  value,
  labelW,
  valueW,
  lastRight,
}: {
  label: string;
  value: string;
  labelW: number;
  valueW: number;
  lastRight?: boolean;
}) {
  return (
    <>
      <View style={[s.cell, s.labelCell, { width: labelW }]}>
        <Text>{label}</Text>
      </View>
      <View style={[s.cell, { width: valueW, borderRightWidth: lastRight ? 0.7 : 0.7 }]}>
        <Text>{value || ""}</Text>
      </View>
    </>
  );
}

export default function LaborClaimPdf({ data }: { data: ClaimPdfData }) {
  const entries = data.entries || [];
  // 최소 5행 유지(양식 모양)
  const rows: (ClaimEntry | null)[] = [...entries];
  while (rows.length < 5) rows.push(null);

  // 근무내역 컬럼 폭 (합계 = 본문 폭)
  const col = { date: 70, time: 80, content: 200, amount: 70, claim: 55, confirm: 56 };

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>일일 근무 현황 및 일일노무비 청구 확인서</Text>

        <View style={[s.tableTop]}>
          <View style={[s.row, s.rowBorder]}>
            <InfoCell label="소속" value={data.affiliation} labelW={40} valueW={120} />
            <InfoCell label="성명" value={data.name} labelW={35} valueW={60} />
            <InfoCell label="주민등록번호" value={data.rrn} labelW={62} valueW={84} />
            <InfoCell label="연락처" value={data.phone} labelW={38} valueW={92} lastRight />
          </View>
          <View style={[s.row, s.rowBorder]}>
            <InfoCell label="주소" value={data.address} labelW={40} valueW={215} />
            <InfoCell label="계좌번호" value={data.accountNumber} labelW={50} valueW={100} />
            <InfoCell label="은행명" value={data.bankName} labelW={40} valueW={86} lastRight />
          </View>
        </View>

        <View style={[s.row, { marginTop: 0 }]}>
          <View style={[s.headCell, s.rowBorder, { width: col.date }]}>
            <Text>근무일자</Text>
          </View>
          <View style={[s.headCell, { borderBottomWidth: 0.7, borderColor: BORDER, width: col.time }]}>
            <Text>근무시간</Text>
          </View>
          <View style={[s.headCell, { borderBottomWidth: 0.7, borderColor: BORDER, width: col.content }]}>
            <Text>근무내용</Text>
          </View>
          <View style={[s.headCell, { borderBottomWidth: 0.7, borderColor: BORDER, width: col.amount }]}>
            <Text>일일노무비{"\n"}(지급금액)</Text>
          </View>
          <View style={[s.headCell, { borderBottomWidth: 0.7, borderColor: BORDER, width: col.claim }]}>
            <Text>청구확인{"\n"}(근무자)</Text>
          </View>
          <View style={[s.headCell, { borderBottomWidth: 0.7, borderColor: BORDER, width: col.confirm }]}>
            <Text>근무확인{"\n"}(연구책임자)</Text>
          </View>
        </View>

        {rows.map((e, i) => (
          <View style={[s.row]} key={i}>
            <View style={[s.cell, { borderBottomWidth: 0.7, borderLeftWidth: 0.7, borderColor: BORDER, width: col.date }]}>
              <Text style={s.center}>{e?.date || ""}</Text>
            </View>
            <View style={[s.cell, { borderBottomWidth: 0.7, borderColor: BORDER, width: col.time }]}>
              <Text style={s.center}>{e ? `${e.start} – ${e.end}` : ""}</Text>
            </View>
            <View style={[s.cell, { borderBottomWidth: 0.7, borderColor: BORDER, width: col.content }]}>
              <Text>{e?.content || ""}</Text>
            </View>
            <View style={[s.cell, { borderBottomWidth: 0.7, borderColor: BORDER, width: col.amount }]}>
              <Text style={s.right}>{e ? won(e.amount) : ""}</Text>
            </View>
            <View style={[s.cell, { borderBottomWidth: 0.7, borderColor: BORDER, width: col.claim, alignItems: "center" }]}>
              {e && data.signatureImg ? (
                <Image style={s.sign} src={data.signatureImg} />
              ) : (
                <Text style={s.center}>{e ? "(인)" : ""}</Text>
              )}
            </View>
            <View style={[s.cell, { borderBottomWidth: 0.7, borderColor: BORDER, width: col.confirm, alignItems: "center" }]}>
              {e && data.directorSignImg ? (
                <Image style={s.sign} src={data.directorSignImg} />
              ) : (
                <Text style={s.center}>{e ? "(인)" : ""}</Text>
              )}
            </View>
          </View>
        ))}

        <View style={[s.row]}>
          <View
            style={[
              s.cell,
              s.labelCell,
              { borderBottomWidth: 0.7, borderLeftWidth: 0.7, borderColor: BORDER, width: col.date + col.time + col.content },
            ]}
          >
            <Text style={s.center}>합 계</Text>
          </View>
          <View style={[s.cell, { borderBottomWidth: 0.7, borderColor: BORDER, width: col.amount }]}>
            <Text style={s.right}>{won(data.totalAmount)}</Text>
          </View>
          <View style={[s.cell, { borderBottomWidth: 0.7, borderColor: BORDER, width: col.claim + col.confirm }]}>
            <Text> </Text>
          </View>
        </View>

        <View style={s.consentBox}>
          <Text style={s.consentTitle}>{"<개인정보 수집·이용에 관한 동의서>"}</Text>
          <Text style={s.small}>
            소득세법 제164조 및 개인정보보호법 제15조, 제24조에 의거하여 아래와 같이 개인정보에 대한 수집·이용에
            관하여 동의 여부를 요청 드립니다.
          </Text>

          <View style={s.subBox}>
            <Text style={s.subHead}>□ 개인정보의 수집·이용 및 목적에 대한 내용</Text>
            <Text style={s.sectMark}>§ 개인정보의 수집 및 이용 목적</Text>
            <Text style={s.sub}>- 기본 인적사항 파악, 연구관련 활동(강의, 자문, 인터뷰, 일일용역 등)에 대한 활동비 지급</Text>
            <Text style={s.sectMark}>§ 개인정보 수집항목</Text>
            <Text style={s.sub}>- 성명, 소속, 전화번호(휴대폰), 주소, 계좌번호</Text>
            <Text style={s.sectMark}>§ 개인정보 보유 및 이용기간 : 개인정보를 취득한 해당연도로부터 5년째 학년도 말까지</Text>
            <Text style={s.sectMark}>§ 동의하지 않을 경우의 처리</Text>
            <Text style={s.sub}>- 이용자는 개인정보 수집을 거부할 수 있는 권리가 있으며, 이 경우 활동비 지급이 제한됨으로 이에 대한 불이익이 발생할 수 있습니다.</Text>
          </View>
          <Text style={s.agreeLine}>개인정보의 수집·이용 및 목적에 대한 내용에 동의합니다. {chk(data.consent?.personal)}</Text>

          <View style={s.subBox}>
            <Text style={s.subHead}>□ 고유식별정보의 수집·이용 및 목적에 대한 내용</Text>
            <Text style={s.sectMark}>§ 고유식별정보의 수집 및 이용 목적</Text>
            <Text style={s.sub}>- 본인 확인, 연구관련 활동(강의, 자문, 인터뷰, 일일용역 등)에 대한 활동비 지급</Text>
            <Text style={s.sectMark}>§ 고유식별정보 수집항목</Text>
            <Text style={s.sub}>- 주민등록번호, 외국인등록번호</Text>
            <Text style={s.sectMark}>§ 고유식별정보 보유 및 이용기간 : 개인정보를 취득한 해당연도로부터 5년째 학년도 말까지</Text>
            <Text style={s.sectMark}>§ 동의하지 않을 경우의 처리</Text>
            <Text style={s.sub}>- 이용자는 개인정보 수집을 거부할 수 있는 권리가 있으며, 이 경우 활동비 지급이 제한됨으로 이에 대한 불이익이 발생할 수 있습니다.</Text>
          </View>
          <Text style={s.agreeLine}>고유식별정보의 수집·이용 및 목적에 대한 내용에 동의합니다. {chk(data.consent?.unique)}</Text>

          <View style={s.subBox}>
            <Text style={s.subHead}>□ 개인정보의 제3자 제공 동의서</Text>
            <Text style={s.sectMark}>§ 제3자 개인정보를 제공받는 기관</Text>
            <Text style={s.sub}>- 한국연구재단, 보건사업진흥원 등 관련 연구비 지원기관과 연구비 감독기관</Text>
            <Text style={s.sectMark}>§ 제3자 제공 목적</Text>
            <Text style={s.sub}>- 연구비 관리 및 정산, 정부통계조사, 세금관련 등</Text>
            <Text style={s.sectMark}>§ 제3자 제공 항목 : 개인정보 항목과 동일</Text>
            <Text style={s.sectMark}>§ 동의하지 않을 경우의 처리</Text>
            <Text style={s.sub}>- 이용자는 개인정보 수집을 거부할 수 있는 권리가 있으며, 이 경우 활동비 지급이 제한됨으로 이에 대한 불이익이 발생할 수 있습니다.</Text>
          </View>
          <Text style={s.agreeLine}>개인정보의 제3자 제공에 대한 내용에 동의합니다. {chk(data.consent?.thirdParty)}</Text>
        </View>

        <View style={s.footer}>
          <Text>붙임 : 1. 신분증 사본, 통장사본 각 1부</Text>
          <Text style={s.footerOrg}>한림대학교 AI에듀테크센터 귀하</Text>
        </View>
      </Page>
    </Document>
  );
}
