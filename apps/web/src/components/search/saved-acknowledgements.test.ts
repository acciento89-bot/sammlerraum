import { clearSearchSession } from "./search-url-state";
import { afterEach, expect, it } from "vitest";
import {
  rememberSavedAcknowledgement,
  readSavedAcknowledgement,
  clearSavedAcknowledgements,
} from "./saved-acknowledgements";
afterEach(clearSavedAcknowledgements);
const id = "00000000-0000-4000-8000-000000000001";
const ack = {
  id,
  name: "Acknowledged",
  revision: 3,
  createdAt: "2026-11-05T12:00:00.000Z",
  updatedAt: "2026-11-05T12:00:00.000Z",
};
it("retains only acknowledged metadata across failed navigation, without keeping definitions", () => {
  rememberSavedAcknowledgement("owner", { ...ack, definition: { text: "private raw operands" } });
  expect(readSavedAcknowledgement("owner", id)).toEqual(ack);
  expect(JSON.stringify(readSavedAcknowledgement("owner", id))).not.toContain("operands");
});
it("clears all retained metadata on identity replacement and session expiry", () => {
  rememberSavedAcknowledgement("first", ack);
  expect(readSavedAcknowledgement("second", id)).toBeUndefined();
  expect(readSavedAcknowledgement("first", id)).toBeUndefined();
  rememberSavedAcknowledgement("first", ack);
  clearSavedAcknowledgements();
  expect(readSavedAcknowledgement("first", id)).toBeUndefined();
});
it("bounds acknowledgements and refuses unvalidated metadata", () => {
  for (let n = 1; n <= 21; n++)
    rememberSavedAcknowledgement("owner", {
      ...ack,
      id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    });
  expect(readSavedAcknowledgement("owner", id)).toBeUndefined();
  expect(() => rememberSavedAcknowledgement("owner", { ...ack, revision: 0 })).toThrow();
});

it("the shared logout/session clear also removes acknowledgements when search pages are unmounted", () => {
  rememberSavedAcknowledgement("owner", ack);
  clearSearchSession();
  expect(readSavedAcknowledgement("owner", id)).toBeUndefined();
});
