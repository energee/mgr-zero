// lib/mgr/fixtures/team.ts — Team roster snapshot.
import type { TeamViewModel } from "@/lib/mgr/team-view";

export const teamRoster: TeamViewModel = {
  rows: [
    { key: "maria", title: "Maria Alvarez", detail: "@maria · admin", you: true },
    { key: "dave", title: "Dave Chen", detail: "@dave · brewer", src: "/mock/dave.jpg" },
    { key: "ted", title: "Ted", detail: "@ted · sales", src: "/mock/ted.jpg" },
    { key: "sam", title: "Sam Ortiz", detail: "@sam · warehouse", src: "/mock/sam.jpg" },
  ],
};
