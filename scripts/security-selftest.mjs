import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicAddress } from "../app/lib/publicAddress.ts";
import { readUploadForm } from "../app/lib/uploadForm.ts";
import { consumeQuota } from "../app/rate-limit.ts";

test("내부·예약 주소와 IPv6 우회 차단", () => {
  for (const address of [
    "127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254",
    "0.0.0.0", "100.64.0.1", "192.0.2.1", "198.18.0.1", "224.0.0.1", "255.255.255.255",
    "::", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:7f00:1",
    "fc00::1", "fd00::1", "fe80::1", "febf::1", "ff02::1", "64:ff9b::7f00:1",
    "2001:db8::1", "2002:7f00:1::", "3fff::1", "invalid",
  ]) assert.equal(isPublicAddress(address), false, address);
  for (const address of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111", "2001:4860:4860::8888"]) {
    assert.equal(isPublicAddress(address), true, address);
  }
  const host = new URL("http://[::ffff:127.0.0.1]/").hostname.slice(1, -1);
  assert.equal(isPublicAddress(host), false);
});

const request = (body, headers = {}) => new Request("http://localhost/api/upload", {
  method: "POST", body, headers, duplex: "half",
});

test("용량 헤더 없는 정상 폼과 실제 수신량 집계", async () => {
  const form = new FormData();
  form.set("file", new File(["sample"], "test.txt", { type: "text/plain" }));
  const req = request(form);
  const actualBytes = (await req.clone().arrayBuffer()).byteLength;
  const result = await readUploadForm(req, 1024);
  assert.ok(!("error" in result));
  assert.equal(await result.form.get("file").text(), "sample");
  assert.equal(result.bytes, actualBytes);
  assert.equal(consumeQuota("security-upload", result.bytes, actualBytes, 60_000), false);
  assert.equal(consumeQuota("security-upload", result.bytes, actualBytes, 60_000), true);
});

test("누락·축소한 용량 헤더로 본문 한도 우회 불가", async () => {
  for (const headers of [{}, { "content-length": "1" }]) {
    let cancelled = false;
    const body = new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(32 * 1024)); },
      cancel() { cancelled = true; },
    });
    const result = await readUploadForm(request(body, headers), 1024);
    assert.equal(result.status, 413);
    assert.equal(cancelled, true);
  }
});

test("잘못된 헤더·폼은 400, 선언된 초과 용량은 413", async () => {
  for (const length of ["-1", "NaN", "1.5"]) {
    assert.equal((await readUploadForm(request("x", { "content-length": length }), 1024)).status, 400);
  }
  assert.equal((await readUploadForm(request("x", { "content-length": "999999" }), 1024)).status, 413);
  assert.equal((await readUploadForm(request("not multipart"), 1024)).status, 400);
});

test("본문 한도 경계값 허용", async () => {
  const body = "a=" + "x".repeat(64 * 1024 + 1024 - 2);
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  const result = await readUploadForm(request(body, headers), 1024);
  assert.ok(!("error" in result));
  assert.equal(result.bytes, body.length);
  assert.equal((await readUploadForm(request(body + "x", headers), 1024)).status, 413);
});
