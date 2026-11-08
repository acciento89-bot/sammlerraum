import { afterEach, expect, it } from "vitest";
import { clearMoneyDrafts } from "./legacy-money-draft";
import {
  rememberAcknowledgedItemCreation,
  recallAcknowledgedItemCreation,
  forgetAcknowledgedItemCreation,
} from "./acknowledged-item-creation";
const collection = "00000000-0000-4000-8000-000000000001",
  item = "00000000-0000-4000-8000-000000000002",
  other = "00000000-0000-4000-8000-000000000003";
afterEach(clearMoneyDrafts);
it("hands off only the acknowledged identity for that actor and collection", () => {
  rememberAcknowledgedItemCreation("a", collection, item);
  expect(recallAcknowledgedItemCreation("a", collection)).toBe(item);
  expect(recallAcknowledgedItemCreation("a", other)).toBeUndefined();
  forgetAcknowledgedItemCreation("a", collection, other);
  expect(recallAcknowledgedItemCreation("a", collection)).toBe(item);
  forgetAcknowledgedItemCreation("a", collection, item);
  expect(recallAcknowledgedItemCreation("a", collection)).toBeUndefined();
});
it("clears on observed actor replacement and explicit logout", () => {
  rememberAcknowledgedItemCreation("a", collection, item);
  expect(recallAcknowledgedItemCreation("b", collection)).toBeUndefined();
  rememberAcknowledgedItemCreation("b", collection, item);
  clearMoneyDrafts();
  expect(recallAcknowledgedItemCreation("b", collection)).toBeUndefined();
});
it("does not accept an invented non-ID or unbound collection", () => {
  expect(() => rememberAcknowledgedItemCreation("a", collection, "pending")).toThrow();
  expect(() => rememberAcknowledgedItemCreation("a", "", item)).toThrow();
});
