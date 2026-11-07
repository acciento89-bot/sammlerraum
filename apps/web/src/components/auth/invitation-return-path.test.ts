import { describe, it, expect } from "vitest";
import { invitationReturnPath } from "./invitation-return-path";
describe("bounded invitation authentication return", () => {
  it("preserves only an exact same-locale invitation path", () => {
    const path = "/de/invite/" + "a".repeat(43);
    expect(invitationReturnPath(path, "de")).toBe(path);
    for (const bad of [
      "https://evil.invalid",
      "//evil.invalid",
      path + "?next=evil",
      path + "#x",
      path + "\n",
      path + "\r\n",
      path.replace("/de/", "/en/"),
      "/de/../evil",
      null,
    ])
      expect(invitationReturnPath(bad, "de")).toBe("/de/account/profile");
  });
});
