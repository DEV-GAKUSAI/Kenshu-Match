import test from "node:test";
import assert from "node:assert/strict";

import { isKenshuRole } from "./roles.ts";

test("Kenshu Link roles are accepted", () => {
  for (const role of ["INSTRUCTOR", "COMPANY", "INDIVIDUAL", "ADMIN"]) assert.equal(isKenshuRole(role), true);
});

test("other roles (ENGINEER from Mine / Engineer Match), empty and odd values are not", () => {
  for (const role of ["ENGINEER", "", "instructor", null, undefined, 3]) assert.equal(isKenshuRole(role), false);
});
