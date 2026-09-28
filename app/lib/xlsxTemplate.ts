/**
 * 국세청 일괄등록 양식(.xlsx)의 첫 시트에 데이터를 채운다.
 *
 * 양식에 데이터 유효성·인쇄 설정 등이 있어 새로 만들지 않고 원본의 sheetData 만 바꾼다.
 * xlsx 는 zip 이므로 fflate 로 직접 다룬다.
 * 문자열은 inlineStr 로 써서 귀속월(07)이나 주민등록번호가 숫자로 바뀌지 않게 한다.
 *
 * 템플릿은 런타임에 디스크에서 읽는다. next.config 를 output: "standalone" 으로 바꾸면
 * 이 파일이 이미지에 포함되지 않으니 함께 처리해야 한다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

/** 셀 하나의 값. 문자열은 inlineStr(텍스트), 숫자는 그대로. */
export type CellValue = string | number;

/**
 * 템플릿 행 2 에서 그대로 가져온 열별 스타일 인덱스.
 * 원본의 서식(테두리·정렬·숫자표시)을 유지하려고 쓴다.
 */
const COLUMN_STYLE = [2, 2, 4, 4, 3, 3, 4, 5, 5, 5, 5, 4, 5, 5];

const COLUMN_LETTER = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cellXml(colIndex: number, rowNum: number, value: CellValue): string {
  const ref = `${COLUMN_LETTER[colIndex]}${rowNum}`;
  const s = COLUMN_STYLE[colIndex] ?? 0;
  if (typeof value === "number") {
    return `<c r="${ref}" s="${s}"><v>${value}</v></c>`;
  }
  // 빈 문자열은 값 없는 셀로 둔다(양식 요구사항).
  if (value === "") return `<c r="${ref}" s="${s}"/>`;
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

/**
 * 템플릿의 `Sheet1` 에 데이터 행을 채워 넣은 xlsx 바이트를 만든다.
 *
 * @param templatePath 원본 양식 경로 (repo 기준 상대 경로)
 * @param rows 2행부터 넣을 값들. 각 행은 A~N 순서의 14개 값.
 */
export function fillTemplateSheet1(templatePath: string, rows: CellValue[][]): Uint8Array {
  const buf = readFileSync(path.join(process.cwd(), templatePath));
  const files = unzipSync(new Uint8Array(buf));

  const sheetKey = "xl/worksheets/sheet1.xml";
  const sheetXml = strFromU8(files[sheetKey]);

  // 헤더(1행)는 sharedStrings 를 참조하므로 원본 그대로 둔다.
  const headerMatch = sheetXml.match(/<row r="1"[\s\S]*?<\/row>/);
  if (!headerMatch) {
    throw new Error("양식의 헤더 행(1행)을 찾지 못했습니다. 템플릿이 바뀌었는지 확인하세요.");
  }

  const body = rows
    .map((cells, i) => {
      const rowNum = i + 2;
      const inner = cells.map((v, c) => cellXml(c, rowNum, v)).join("");
      return `<row r="${rowNum}" spans="1:14">${inner}</row>`;
    })
    .join("");

  const lastRow = rows.length + 1;
  const patched = sheetXml
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:N${Math.max(lastRow, 1)}"/>`)
    .replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${headerMatch[0]}${body}</sheetData>`);

  files[sheetKey] = strToU8(patched);
  return zipSync(files, { level: 6 });
}
