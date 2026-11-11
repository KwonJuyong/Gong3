import "server-only";
import { zipSync, strToU8 } from "fflate";
import { csvCell } from "./csv";

/**
 * 조회 결과 내보내기(xlsx·CSV). xlsx 는 zip 이므로 이미 쓰고 있는 fflate 로 직접 만듦
 * 문자열은 모두 inlineStr 로 써서 학번 같은 숫자 모양 문자열이 숫자로 바뀌지 않게 함
 */

export type Cell = string | number | boolean | null | undefined;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 0 → A, 25 → Z, 26 → AA */
function colLetter(i: number): string {
  let s = "";
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function cellXml(col: number, row: number, v: Cell): string {
  const ref = `${colLetter(col)}${row}`;
  if (v === null || v === undefined || v === "") return `<c r="${ref}"/>`;
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
  const s = typeof v === "boolean" ? (v ? "예" : "아니오") : String(v);
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(s)}</t></is></c>`;
}

/**
 * 표 하나를 담은 최소 xlsx 바이트를 만듦
 *
 * 시트 이름에 `: \ / ? * [ ]` 가 있으면 엑셀이 열지 못하고, 31자 제한이 있음
 */
export function buildXlsx(columns: string[], rows: Array<Record<string, Cell>>, sheetName = "조회결과"): Uint8Array {
  const safeName = (sheetName || "Sheet1").replace(/[:\\/?*[\]]/g, "_").slice(0, 31);

  const body: string[] = [];
  body.push(`<row r="1">${columns.map((c, i) => cellXml(i, 1, c)).join("")}</row>`);
  rows.forEach((r, ri) => {
    const cells = columns.map((c, ci) => cellXml(ci, ri + 2, r[c] as Cell)).join("");
    body.push(`<row r="${ri + 2}">${cells}</row>`);
  });

  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${body.join("")}</sheetData></worksheet>`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="${esc(safeName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `</Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  };

  return zipSync(files, { level: 6 });
}

/** CSV. 엑셀이 UTF-8 을 알아보도록 BOM 을 붙임(안 붙이면 한글이 깨짐). */
export function buildCsv(columns: string[], rows: Array<Record<string, Cell>>): string {
  const cell = (v: Cell): string => csvCell(typeof v === "boolean" ? (v ? "예" : "아니오") : v);
  const lines = [columns.map(cell).join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c] as Cell)).join(","));
  return "﻿" + lines.join("\r\n");
}

/** 다운로드 파일명. 한글 파일명이 깨지지 않도록 RFC 5987 형식도 같이 냄 */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
