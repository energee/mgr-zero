import { expect, it } from "vitest";
import StaffMissingPage, { metadata as staffMetadata } from "@/app/(app)/[...missing]/page";
import PortalMissingPage, { metadata as portalMetadata } from "@/app/(portal)/portal/[...missing]/page";

it.each([
  ["staff", StaffMissingPage],
  ["portal", PortalMissingPage],
])("renders the existing %s not-found boundary for an unmatched address", (_audience, page) => {
  expect(page).toThrow(expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
});

it.each([staffMetadata, portalMetadata])("names the missing-address browser tab", metadata => {
  expect(metadata.title).toBe("Not found");
});
