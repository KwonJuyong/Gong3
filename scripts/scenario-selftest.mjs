import assert from "node:assert/strict";
import {
  compareReadings,
  nextPhase,
  readMeasurement,
  checkItems,
  readChecks,
} from "../app/lib/scenario.ts";

assert.equal(nextPhase([], 1, true), 0);
assert.equal(nextPhase([0], 1, true), 1);
assert.equal(nextPhase([0, 1], 1, true), null);
assert.equal(nextPhase([0], 1, false), null);
assert.equal(nextPhase([0], 2, true), null);
assert.equal(nextPhase([0, 1], 2, false), 2);
assert.equal(nextPhase([0, 1, 2], 2, false), null);
assert.equal(nextPhase([0, 1], 3, false), 3);

const rows = [
  { userId: "a", phase: 0, value: 0, rating: 6 },
  { userId: "a", phase: 1, value: 3, rating: 4 },
  { userId: "a", phase: 2, value: 5, rating: 7 },
  { userId: "b", phase: 0, value: null, rating: 3 },
  { userId: "b", phase: 1, value: 2, rating: 5 },
  { userId: "c", phase: 0, value: 100, rating: 1 },
];
assert.deepEqual(compareReadings(rows, 0, 1), {
  pairs: 2,
  measured: 1,
  submitted: 2,
  prior: 3,
  before: 0,
  after: 3,
  change: 3,
  ratingChange: 0,
});
assert.equal(compareReadings(rows, 1, 2).change, 2);
assert.equal(compareReadings(rows, 1, 3).change, null);
const form = new FormData();
form.set("rating", "1");
form.set("note", "");
form.set("value", "0");
assert.equal(readMeasurement(form).value, 0);
form.set("value", "");
assert.equal(readMeasurement(form), null);
form.set("unknown", "yes");
assert.deepEqual(readMeasurement(form), { value: null, rating: 1, note: "" });
form.set("rating", "8");
assert.equal(readMeasurement(form), null);
assert.deepEqual(checkItems("1. 문서 저장\n- 제목·목록 서식\n\n새로고침 후 유지"), ["문서 저장", "제목·목록 서식", "새로고침 후 유지"]);
form.set("rating", "5");
form.set("checks", JSON.stringify(["yes", "no", "yes"]));
assert.equal(readMeasurement(form, readChecks(form, 3)).value, 2);
assert.equal(readChecks(form, 2), null);
form.set("checks", JSON.stringify(["unknown", "unknown", "unknown"]));
assert.equal(readMeasurement(form, readChecks(form, 3)).value, null);
form.set("checks", JSON.stringify(["yes", "maybe", "no"]));
assert.equal(readChecks(form, 3), null);
console.log("동행 평가 시점·결측·대응 비교·입력·항목 확인 검증 통과");
