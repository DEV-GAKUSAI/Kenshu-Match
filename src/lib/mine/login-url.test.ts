import test from "node:test";
import assert from "node:assert/strict";

import { mineLoginUrl, mineRegisterUrl, DEFAULT_MINE_APP_URL } from "./login-url.ts";

test("uses the default Mine address when nothing is set", () => {
  assert.equal(mineLoginUrl(), `${DEFAULT_MINE_APP_URL}/apps?launch=kenshulink`);
  assert.equal(mineLoginUrl(""), `${DEFAULT_MINE_APP_URL}/apps?launch=kenshulink`);
  assert.equal(mineLoginUrl("   "), `${DEFAULT_MINE_APP_URL}/apps?launch=kenshulink`);
});

test("uses a configured address and ignores trailing slashes", () => {
  assert.equal(mineLoginUrl("https://mine.example.com/"), "https://mine.example.com/apps?launch=kenshulink");
  assert.equal(mineLoginUrl("https://mine.example.com"), "https://mine.example.com/apps?launch=kenshulink");
});

test("lecturer sign-up goes to Mine and then opens Kenshu Link", () => {
  assert.equal(
    mineRegisterUrl(),
    `${DEFAULT_MINE_APP_URL}/register?next=%2Fapps%3Flaunch%3Dkenshulink`,
  );
  assert.equal(
    mineRegisterUrl("https://mine.example.com/"),
    "https://mine.example.com/register?next=%2Fapps%3Flaunch%3Dkenshulink",
  );
});
