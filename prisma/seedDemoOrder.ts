/**
 * 스테이징 시연용 마켓플레이스 데이터: 기업 계정·사업자정보·서비스와 완결된 발주 1건
 * (학생 응답·보상·지급·원장). deploy-staging.sh 가 --ensure 로 매 배포마다 부름
 *
 *   docker exec -e DEMO_SEED=1 ai-eval-staging-app \
 *     node --conditions=react-server -r ts-node/register prisma/seedDemoOrder.ts [--ensure|--clean]
 *
 * - app/lib/ledger.ts 가 server-only 를 import 하므로 --conditions=react-server 가 필요함
 * - 인자 없이 부르면 기존 시연 데이터를 지우고 새로 만듦. --ensure 는 있으면 건너뜀
 * - 원장에 가짜 수납·지급을 쌓으므로 운영 DB 에서 돌리지 않음(DEMO_SEED=1 필수).
 *   --clean 은 이 스크립트가 만든 demo- 행만 지움
 * - 계좌번호는 명백한 가짜 값이고 주민등록번호는 넣지 않음
 */

import { PrismaClient, Prisma, type User, type Response } from "@prisma/client";
import bcrypt from "bcrypt";
import { computeAmountsFromSubtotal } from "../app/lib/money";
import { computeWithholding } from "../app/lib/withholding";
import { isValidBizNo } from "../app/lib/bizNo";
import * as ledger from "../app/lib/ledger";
import {
  DEMO_PASSWORD,
  DEMO_BUYER_EMAIL,
  DEMO_STUDENT_EMAILS,
} from "../app/lib/stagingAccounts";

const prisma = new PrismaClient();

// 계정·비밀번호는 app/lib/stagingAccounts.ts 에서 가져옴(로그인 화면 안내와 같은 값).
const PW = DEMO_PASSWORD;
/** 체크섬을 통과하는 가짜 사업자번호 */
const DEMO_BIZ_NO = "1234567891";
const DEMO_ORDER_NO = "ORD-DEMO-0001";
const DEMO_PAYMENT_REF = "DEMO-PAY-0001";

const BUYER_EMAIL = DEMO_BUYER_EMAIL;
const STUDENT_EMAILS = DEMO_STUDENT_EMAILS;
const ALL_EMAILS = [BUYER_EMAIL, ...STUDENT_EMAILS];

/** 1인 보상액(최저시급 10,320 × 3시간) */
const REWARD_PER_PERSON = 30960;
const PANEL_SIZE = 6;

function guard() {
  if (process.env.DEMO_SEED !== "1") {
    console.error("DEMO_SEED=1 이 없으면 돌지 않는다 (운영 DB 오염 방지).");
    console.error(
      "  docker exec -e DEMO_SEED=1 ai-eval-staging-app " +
        "node --conditions=react-server -r ts-node/register prisma/seedDemoOrder.ts",
    );
    process.exit(1);
  }
}

async function clean() {
  console.log("시연 데이터 삭제...");

  const order = await prisma.order.findUnique({
    where: { orderNo: DEMO_ORDER_NO },
    include: { rewards: true, payments: true },
  });

  if (order) {
    // 원장 → 지급 → 보상 → 결제 → 발주 순. FK 역순임
    await prisma.ledgerEntry.deleteMany({ where: { orderId: order.id } });
    await prisma.payout.deleteMany({
      where: { rewardId: { in: order.rewards.map((r) => r.id) } },
    });
    await prisma.reward.deleteMany({ where: { orderId: order.id } });
    await prisma.payment.deleteMany({ where: { orderId: order.id } });
    const projectId = order.projectId;
    await prisma.order.delete({ where: { id: order.id } });

    if (projectId) {
      await prisma.response.deleteMany({ where: { projectId } });
      await prisma.enrollment.deleteMany({ where: { projectId } });
      await prisma.project.delete({ where: { id: projectId } });
    }
  }

  await prisma.service.deleteMany({ where: { name: { startsWith: "[시연]" } } });

  const users = await prisma.user.findMany({
    where: { studentId: { in: ALL_EMAILS } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.payrollProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.bizProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  console.log(`삭제 완료 (계정 ${ids.length}개)`);
}

async function seed() {
  if (!isValidBizNo(DEMO_BIZ_NO)) {
    // 상수를 손으로 고쳤을 때 조용히 통과하지 않도록 여기서 끊음
    throw new Error(`DEMO_BIZ_NO(${DEMO_BIZ_NO}) 가 체크섬을 통과하지 못한다.`);
  }

  console.log("시연 데이터 생성...");
  const hash = await bcrypt.hash(PW, 10);
  const now = new Date();

  // 로그인 ID 가 이메일이므로 studentId 에 이메일을 넣고 emailVerifiedAt 을 채움
  const buyer = await prisma.user.upsert({
    where: { studentId: BUYER_EMAIL },
    update: {},
    create: {
      studentId: BUYER_EMAIL,
      email: BUYER_EMAIL,
      emailVerifiedAt: now,
      password: hash,
      name: "시연기업 담당자",
      major: "(주)시연테크",
      role: "DEVELOPER",
      userType: "DEVELOPER",
    },
  });

  await prisma.bizProfile.upsert({
    where: { userId: buyer.id },
    update: {},
    create: {
      userId: buyer.id,
      bizNo: DEMO_BIZ_NO,
      bizName: "(주)시연테크",
      bizCeo: "홍길동",
      bizAddr: "강원특별자치도 춘천시 한림대학길 1",
      bizEmail: BUYER_EMAIL,
      attestedAt: now,
      // 팝빌을 부르지 않으므로 확인하지 않은 상태(null)로 둠
      bizState: null,
    },
  });

  const students: User[] = [];
  for (let i = 0; i < STUDENT_EMAILS.length; i++) {
    const email = STUDENT_EMAILS[i];
    const u = await prisma.user.upsert({
      where: { studentId: email },
      update: {},
      create: {
        studentId: email,
        email,
        emailVerifiedAt: now,
        password: hash,
        name: `시연평가자${i + 1}`,
        major: ["소프트웨어학부", "빅데이터학과", "심리학과", "경영학과", "디자인학부", "체육학과"][i],
        role: "USER",
        userType: "STUDENT",
      },
    });
    await prisma.payrollProfile.upsert({
      where: { userId: u.id },
      update: {},
      create: {
        userId: u.id,
        bankName: ["국민", "신한", "우리", "하나", "농협", "카카오뱅크"][i],
        // 명백한 가짜 번호
        accountNumber: `000-00-${String(100000 + i)}`,
        holderName: `시연평가자${i + 1}`,
        consentAt: now,
        // rrnEnc 는 비워둠. 시연에 불필요하고, 넣으면 이 파일이 민감정보가 됨
      },
    });
    students.push(u);
  }

  const service = await prisma.service.create({
    data: {
      name: "[시연] 개인화 학습 챗봇",
      ownerId: buyer.id,
      modality: "text",
      isAiService: true,
      userFacingUi: true,
    },
  });

  const project = await prisma.project.create({
    data: {
      title: "[시연] 개인화 학습 챗봇 사용성 평가",
      description: "중간발표 시연용 평가입니다. 실제 평가가 아닙니다.",
      location: "온라인",
      startTime: new Date(now.getTime() - 7 * 864e5),
      endTime: new Date(now.getTime() - 1 * 864e5),
      status: "FINISHED",
      questionSource: "MANUAL",
      fundingType: "COMPANY",
      creatorId: buyer.id,
      minParticipants: 1,
      maxParticipants: PANEL_SIZE,
      approvedAt: new Date(now.getTime() - 8 * 864e5),
      questions: [
        // 문항 문구 필드는 label 임(app/lib/projectQuestions.ts).
        { type: "likert5", label: "챗봇의 답변이 이해하기 쉬웠다." },
        { type: "likert5", label: "원하는 정보를 빠르게 찾을 수 있었다." },
        { type: "text", label: "개선이 필요하다고 느낀 점을 자유롭게 적어주세요." },
      ] as Prisma.InputJsonValue,
    },
  });

  const responses: Response[] = [];
  for (const s of students) {
    await prisma.enrollment.create({
      data: { projectId: project.id, userId: s.id, status: "ACCEPTED" },
    });
    const r = await prisma.response.create({
      data: {
        projectId: project.id,
        userId: s.id,
        answers: {
          "0": 4,
          "1": 3,
          "2": "응답 속도는 만족스러웠으나, 긴 질문에서 답이 끊기는 경우가 있었습니다.",
        } as Prisma.InputJsonValue,
      },
    });
    responses.push(r);
  }

  const subtotal = PANEL_SIZE * REWARD_PER_PERSON;
  // 수수료율은 8.8% 로 둠(코드 기본값은 20%).
  const amounts = computeAmountsFromSubtotal(subtotal, 880);

  const order = await prisma.order.create({
    data: {
      orderNo: DEMO_ORDER_NO,
      serviceId: service.id,
      projectId: project.id,
      buyerId: buyer.id,
      bizNo: DEMO_BIZ_NO,
      bizName: "(주)시연테크",
      bizCeo: "홍길동",
      bizAddr: "강원특별자치도 춘천시 한림대학길 1",
      bizEmail: BUYER_EMAIL,
      panelSize: PANEL_SIZE,
      rewardPerPerson: REWARD_PER_PERSON,
      subtotal: amounts.subtotal,
      feeRateBp: 880,
      fee: amounts.fee,
      vat: amounts.vat,
      totalAmount: amounts.totalAmount,
      status: "PAID",
    },
  });

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      ref: DEMO_PAYMENT_REF,
      amount: amounts.totalAmount,
      status: "PAID",
      depositorName: "(주)시연테크",
      paidAt: new Date(now.getTime() - 2 * 864e5),
      taxInvoiceIssued: true,
      // 시연용 승인번호(DEMO 표시)
      taxInvoiceNtsNum: "DEMO-00000000-00000000-00000000",
      taxInvoiceNtsState: 304,
      taxInvoiceNtsCheckedAt: now,
    },
  });

  // 원장 기록은 상태 변경과 같은 트랜잭션에서 함
  await prisma.$transaction(async (tx) => {
    await ledger.record(tx, {
      kind: "PAYMENT_IN",
      amount: amounts.totalAmount,
      orderId: order.id,
      paymentId: payment.id,
      memo: "[시연] 수납",
    });
    await ledger.record(tx, {
      kind: "VAT_COLLECTED",
      amount: amounts.vat,
      orderId: order.id,
      paymentId: payment.id,
      memo: "[시연] 수납액에 포함된 부가세",
    });

    for (let i = 0; i < responses.length; i++) {
      const s = students[i];
      const wh = computeWithholding(REWARD_PER_PERSON, "OTHER");

      const reward = await tx.reward.create({
        data: {
          orderId: order.id,
          userId: s.id,
          responseId: responses[i].id,
          grossAmount: REWARD_PER_PERSON,
          incomeType: "OTHER",
          taxRateBp: 880,
          taxAmount: wh.taxAmount,
          taxExempt: wh.exempt,
          netAmount: wh.netAmount,
          // 정산 화면에서 승인을 시연할 수 있도록 마지막 두 명은 검수 대기로 둠
          status: i < 4 ? "PAID" : "PENDING",
          reviewedAt: i < 4 ? now : null,
        },
      });

      if (i < 4) {
        const profile = await tx.payrollProfile.findUnique({ where: { userId: s.id } });
        const payout = await tx.payout.create({
          data: {
            rewardId: reward.id,
            payoutKey: `DEMO-PO-${i + 1}`,
            bankName: profile?.bankName ?? "국민",
            accountNumber: profile?.accountNumber ?? "000-00-000000",
            holderName: profile?.holderName ?? s.name,
            amount: wh.netAmount,
            status: "PAID",
            paidAt: now,
          },
        });
        await ledger.recordPayout(tx, {
          payoutId: payout.id,
          orderId: order.id,
          netAmount: wh.netAmount,
          taxAmount: wh.taxAmount,
          memo: `[시연] ${s.name} 보상 지급`,
        });
      }
    }
  });

  console.log("시연 데이터 생성 완료");
  console.log(`   기업 계정   : ${BUYER_EMAIL}  (비번 ${PW})`);
  console.log(`   학생 계정   : demo-student1~6@example.com  (비번 ${PW})`);
  console.log(`   발주        : ${DEMO_ORDER_NO} · 청구 ${amounts.totalAmount.toLocaleString()}원`);
  console.log(`                 (보상 ${subtotal.toLocaleString()} + 수수료 ${amounts.fee.toLocaleString()} + 부가세 ${amounts.vat.toLocaleString()})`);
  console.log(`   보상        : 6건 — 지급 완료 4 · 검수 대기 2`);
  console.log("");
  console.log("   주의: 관리자 계정은 만들지 않는다 — 시연은 기존 관리자로 로그인해서 한다.");
}

async function main() {
  guard();

  if (process.argv.includes("--clean")) {
    await clean();
    return;
  }

  /**
   * --ensure: 시연 계정이 없을 때만 만듦(deploy-staging.sh 가 쓰는 모드).
   * 기본 모드는 지우고 다시 만들므로 준비해 둔 상태가 사라지고, 다른 평가가 시연 학생을
   * 참조하면 FK 때문에 실패함
   */
  if (process.argv.includes("--ensure")) {
    const exists = await prisma.user.findUnique({
      where: { studentId: BUYER_EMAIL },
      select: { id: true },
    });
    if (exists) {
      // 이전 형식(text)으로 저장된 시연 평가 문항만 label 로 고침
      const demo = await prisma.project.findMany({ where: { title: { startsWith: "[시연]" } }, select: { id: true, questions: true } });
      for (const p of demo) {
        const qs = (p.questions as unknown as Record<string, unknown>[]) || [];
        if (!qs.some((q) => typeof q?.text === "string" && !q?.label)) continue;
        const fixed = qs.map(({ text, ...rest }) => (typeof text === "string" && !rest.label ? { ...rest, label: text } : { text, ...rest }));
        await prisma.project.update({ where: { id: p.id }, data: { questions: fixed as Prisma.InputJsonValue } });
        console.log(`시연 평가 문항 문구 칸 고침(text → label): ${p.id}`);
      }
      console.log("시연 데이터가 이미 있다 — 건너뛴다 (다시 만들려면 --clean 후 재실행)");
      return;
    }
  }

  await clean(); // 재실행 안전: 이전 시연 데이터를 먼저 걷어냄
  await seed();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
