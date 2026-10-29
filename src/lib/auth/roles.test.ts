import test from "node:test";
import assert from "node:assert/strict";

import { isKenshuRole, isPublicPath } from "./roles.ts";

test("Kenshu Link roles are accepted", () => {
  for (const role of ["INSTRUCTOR", "COMPANY", "INDIVIDUAL", "ADMIN"]) assert.equal(isKenshuRole(role), true);
});

test("other roles (ENGINEER from Mine / Engineer Match), empty and odd values are not", () => {
  for (const role of ["ENGINEER", "", "instructor", null, undefined, 3]) assert.equal(isKenshuRole(role), false);
});

test("public pages stay open for a Mine login; account pages do not", () => {
  for (const path of ["/", "/instructors", "/instructor-detail", "/login", "/register", "/for-instructors", "/terms", "/privacy"]) {
    assert.equal(isPublicPath(path), true, path);
  }
  for (const path of ["/mypage", "/post-request", "/open-requests", "/request-detail", "/complete-profile"]) {
    assert.equal(isPublicPath(path), false, path);
  }
});
