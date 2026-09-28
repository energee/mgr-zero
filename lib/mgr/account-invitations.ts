export type AccountInvitation = {
  id: string; breweryName: string; kind: "staff" | "customer";
  role: string | null; customerName: string | null; expiresAt: string;
};
