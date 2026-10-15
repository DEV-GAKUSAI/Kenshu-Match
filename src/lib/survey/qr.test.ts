import assert from "node:assert/strict";
import test from "node:test";

import { qrMatrix, qrSvg } from "./qr.ts";

const url = "https://kenshu-match.vercel.app/survey?t=" + "a1b2c3d4".repeat(8);

test("size follows the length of the text", () => {
  assert.equal(qrMatrix("A").length, 21); // version 1
  assert.equal(qrMatrix(url).length, 41); // version 6
  assert.equal(qrMatrix("r".repeat(213)).length, 57); // version 10, the largest
});

test("the three corner finder squares are always drawn", () => {
  const m = qrMatrix(url);
  const n = m.length;
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    assert.equal(m[r][c], true);
    assert.equal(m[r + 3][c + 3], true);
    assert.equal(m[r + 1][c + 1], false);
    assert.equal(m[r + 6][c + 6], true);
  }
});

test("the same text always gives the same code", () => {
  assert.deepEqual(qrMatrix(url), qrMatrix(url));
});

test("text that is too long is refused", () => {
  assert.throws(() => qrMatrix("x".repeat(214)), /qr_text_too_long/);
});

test("japanese text works and the svg is well formed", () => {
  assert.ok(qrMatrix("研修アンケート").length >= 21);
  const svg = qrSvg("hi", 120);
  assert.match(svg, /^<svg [^>]*width="120"/);
  assert.match(svg, /<\/svg>$/);
});
