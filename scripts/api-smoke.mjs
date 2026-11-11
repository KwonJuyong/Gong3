import assert from "node:assert/strict";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3100";
const routes = [
  ["POST", "/api/upload", 401],
  ["POST", "/api/messages/upload", 401],
  ["POST", "/api/attachments", 401],
  ["GET", "/api/attachments/missing", 401],
  ["DELETE", "/api/attachments/missing", 401],
  ["GET", "/api/uploads/missing.png", 404],
  ["GET", "/api/messages/stream", 401],
  ["GET", "/api/frame-check?p=missing", 404],
  ["GET", "/api/export?projectId=missing", 401],
  ["POST", "/api/query/export", 401],
  ["GET", "/api/orders/quote", 401],
  ["GET", "/api/payroll/pdf/missing", 401],
  ["GET", "/api/payroll/export/missing", 401],
  ["GET", "/api/settlement/payout/missing", 401],
  ["GET", "/api/settlement/withholding/missing", 401],
  ["GET", "/api/settlement/withholding/monthly", 401],
  ["GET", "/api/settlement/withholding/simple-statement", 401],
  ["POST", "/api/settlement/invoice-sync", 401],
  ["GET", "/api/settlement/tax-reminder", 401],
  ["POST", "/api/settlement/tax-reminder", 401],
  ["POST", "/api/insights/sync", 401],
];

for (const cookie of ["", "user_id=forged.0.7200.9999999999.9999999999.invalid"]) {
  for (const [method, path, status] of routes) {
    const response = await fetch(new URL(path, base), {
      method, headers: cookie ? { cookie } : {}, redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    assert.equal(response.status, status, `${method} ${path}`);
    await response.body?.cancel();
  }
}
console.log(`API 인증 차단 ${routes.length * 2}건 통과`);
