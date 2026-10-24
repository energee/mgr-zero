import type { ColaDetails, ColaRecord } from "@/lib/ttb/colas";
import { catalogBrands } from "./catalog";

export const colaReviewBrands = catalogBrands.brands;
export const colaReviewRecord: ColaRecord = {
  ttbId: "25318001000034", permit: "BR-PA-12345", serial: "000135", completedOn: "2026-01-15",
  fancifulName: "Hazy IPA", brandName: "Demo Brewing", classCode: "80", className: "ALE",
};
export const colaReviewDetails: ColaDetails = {
  ttbId: colaReviewRecord.ttbId, permit: colaReviewRecord.permit, status: "APPROVED", approvedOn: "2026-01-15",
  images: [{ url: "https://ttbonline.gov/colasonline/publicViewAttachment.do?filename=Array.jpg&filetype=l", label: "Brand (front) or keg collar" }],
};
