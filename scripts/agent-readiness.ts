// scripts/agent-readiness.ts — prints the registry-backed rows of the readiness
// scorecard in docs/plans/agent-access.md. Run it after each task in that plan.
//   bun run scripts/agent-readiness.ts
import "@/lib/commands/all";
import { listTools } from "@/lib/commands/registry";
import { measureReadiness } from "@/lib/mgr/agent-readiness";

const counts = measureReadiness(listTools());
console.log(`U1 Input field uses with a stated meaning: ${counts.fieldUsesWithMeaning} of ${counts.fieldUses}`);
console.log(`U2 Operations described in 7 words or more: ${counts.describedOperations} of ${counts.operations}`);
console.log(`U5 Commands that say how to undo them: ${counts.commandsWithUndo} of ${counts.commands}`);
console.log(`Totals: ${counts.queries} queries, ${counts.commands} commands, ${counts.commandIdFieldUses} command id field uses`);
