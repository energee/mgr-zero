// lib/mgr/registry-rows.ts — the one row shape and date rule shared by the
// compliance lists: a brand's approvals and registrations (brand-view.ts)
// and the brewery's licenses (licenses-view.ts).
export type RegistryRowView = {
  key: string;
  title: string;
  detail: string;
  verb?: string;
  warning?: boolean;
};

export const expires = (date: string | null) => date ? ` · expires ${date}` : "";
