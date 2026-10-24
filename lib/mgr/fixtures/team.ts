// lib/mgr/fixtures/team.ts — Team roster and pending invitations snapshot.
import type { TeamViewModel } from "@/lib/mgr/team-view";

export const teamRoster: TeamViewModel = {
  rows: [
    { key: "maria", title: "Maria Alvarez", detail: "maria@demobrewing.com · Admin", you: true, src: "/mock/maria.jpg" },
    { key: "dave", title: "Dave Chen", detail: "dave@demobrewing.com · Brewer", src: "/mock/dave.jpg" },
    { key: "ted", title: "Ted", detail: "ted@demobrewing.com · Sales", src: "/mock/ted.jpg" },
    { key: "sam", title: "Sam Ortiz", detail: "sam@demobrewing.com · Warehouse", src: "/mock/sam.jpg" },
  ],
  invitations: [
    { key: "invite-jo", email: "jo@demobrewing.com", detail: "Taproom · Sent Oct 21, 2026" },
  ],
};
