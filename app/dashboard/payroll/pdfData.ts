import { renderToBuffer } from "@react-pdf/renderer";
import type { LaborClaim } from "@prisma/client";
import { createElement } from "react";
import LaborClaimPdf, { type ClaimPdfData, type ClaimEntry } from "./LaborClaimPdf";
import { decryptRRN } from "../../lib/crypto";
import { prisma } from "../../db";
import { readImageForPdf } from "../../lib/pdfImage";


/** LaborClaim 레코드 -> PDF 데이터 (주민번호 복호화, 서명 이미지 로드) */
export async function buildClaimPdfData(claim: LaborClaim): Promise<ClaimPdfData> {
  const entries: ClaimEntry[] = Array.isArray(claim.entries) ? (claim.entries as unknown as ClaimEntry[]) : [];
  const consent = (claim.consent || {}) as { personal?: boolean; unique?: boolean; thirdParty?: boolean };

  let rrn = "";
  if (claim.rrnEnc) {
    try {
      // 저장 형식(숫자만·하이픈 포함)과 무관하게 서류에는 000000-0000000 으로 찍음
      const plain = decryptRRN(claim.rrnEnc);
      const d = plain.replace(/[^0-9]/g, "");
      rrn = d.length === 13 ? `${d.slice(0, 6)}-${d.slice(6)}` : plain;
    } catch {
      rrn = "";
    }
  }

  // 연구책임자(근무확인) 서명은 모든 서류에 같은 것을 씀
  const directorSetting = await prisma.appSetting.findUnique({ where: { key: "directorSignUrl" } });
  const [signatureImg, directorSignImg] = await Promise.all([
    readImageForPdf(claim.signatureUrl),
    readImageForPdf(directorSetting?.value),
  ]);

  return {
    affiliation: claim.affiliation || "",
    name: claim.name || "",
    rrn,
    phone: claim.phone || "",
    address: claim.address || "",
    accountNumber: claim.accountNumber || "",
    bankName: claim.bankName || "",
    entries,
    totalAmount: claim.totalAmount || 0,
    consent: {
      personal: !!consent.personal,
      unique: !!consent.unique,
      thirdParty: !!consent.thirdParty,
    },
    signatureImg,
    directorSignImg,
  };
}

/** 청구서 PDF Buffer 생성 */
export async function renderClaimPdfBuffer(claim: LaborClaim): Promise<Buffer> {
  const data = await buildClaimPdfData(claim);
  // LaborClaimPdf의 루트는 <Document> 이지만 래퍼 컴포넌트라 타입 단언이 필요
  const element = createElement(LaborClaimPdf, { data }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buf = await renderToBuffer(element);
  return buf as Buffer;
}
