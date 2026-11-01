// lib/mgr/fixtures/team.ts — Team roster and pending invitations snapshot.
import type { TeamViewModel } from "@/lib/mgr/team-view";

export const teamRoster: TeamViewModel = {
  rows: [
    { key: "maria", title: "Maria Alvarez <maria@demobrewing.com>", detail: "Admin", you: true, src: "/mock/maria.jpg" },
    { key: "dave", title: "Dave Chen <dave@demobrewing.com>", detail: "Brewer", src: "/mock/dave.jpg" },
    { key: "ted", title: "Ted <ted@demobrewing.com>", detail: "Sales", src: "/mock/ted.jpg" },
    { key: "sam", title: "Sam Ortiz <sam@demobrewing.com>", detail: "Warehouse", src: "/mock/sam.jpg" },
  ],
  invitations: [
    { key: "invite-jo", email: "jo@demobrewing.com", detail: "Taproom · Sent Oct 21, 2026" },
  ],
};
