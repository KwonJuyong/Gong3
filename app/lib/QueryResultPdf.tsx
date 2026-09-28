import path from "path";
import { Document, Page, View, Text, Font, StyleSheet } from "@react-pdf/renderer";

// 한글 폰트 등록(public/fonts). 모듈 로드 시 한 번 실행된다.
Font.register({
  family: "NanumGothic",
  fonts: [
    { src: path.join(process.cwd(), "public", "fonts", "NanumGothic-Regular.ttf") },
    { src: path.join(process.cwd(), "public", "fonts", "NanumGothic-Bold.ttf"), fontWeight: "bold" },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "NanumGothic", fontSize: 8 },
  title: { fontSize: 13, fontWeight: "bold", marginBottom: 4 },
  meta: { fontSize: 8, color: "#555", marginBottom: 2 },
  note: { fontSize: 7, color: "#8a5a00", marginTop: 6 },
  table: { marginTop: 10, borderTop: "1pt solid #333", borderLeft: "1pt solid #333" },
  row: { flexDirection: "row" },
  th: {
    flex: 1, padding: 4, fontWeight: "bold", backgroundColor: "#f0f0f0",
    borderRight: "1pt solid #333", borderBottom: "1pt solid #333",
  },
  td: { flex: 1, padding: 4, borderRight: "1pt solid #333", borderBottom: "1pt solid #333" },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, fontSize: 7, color: "#777", textAlign: "center" },
});

export type QueryPdfData = {
  title: string;
  question: string;
  requester: string;
  generatedAt: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  notes: string[];
};

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "예" : "아니오";
  return String(v);
};

/** 조회 결과 PDF. 12열을 넘으면 가로 방향으로 출력한다. */
export function QueryResultPdf({ data }: { data: QueryPdfData }) {
  const landscape = data.columns.length > 6;
  return (
    <Document>
      <Page size="A4" orientation={landscape ? "landscape" : "portrait"} style={styles.page}>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.meta}>질의: {data.question}</Text>
        <Text style={styles.meta}>
          요청자: {data.requester} · 생성: {data.generatedAt} · {data.rows.length}건
        </Text>

        <View style={styles.table}>
          <View style={styles.row} fixed>
            {data.columns.map((c) => (
              <Text key={c} style={styles.th}>{c}</Text>
            ))}
          </View>
          {data.rows.map((r, i) => (
            <View key={i} style={styles.row} wrap={false}>
              {data.columns.map((c) => (
                <Text key={c} style={styles.td}>{cell(r[c])}</Text>
              ))}
            </View>
          ))}
        </View>

        {data.notes.map((n, i) => (
          <Text key={i} style={styles.note}>※ {n}</Text>
        ))}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `AI 평가단 플랫폼 · ${pageNumber} / ${totalPages} · 조회 권한 범위 내에서 생성된 자료입니다`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
