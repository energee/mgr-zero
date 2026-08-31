#!/usr/bin/env node
const prompt = process.argv.at(-1) || "";
if (prompt.includes("read-only planner")) {
  console.log(JSON.stringify({ summary: "Mock plan", steps: ["Implement"], risks: [], acceptanceCriteria: ["Tests pass"] }));
} else if (prompt.includes("read-only reviewer")) {
  console.log(JSON.stringify({ verdict: "approve", findings: [] }));
} else {
  console.log(JSON.stringify({ summary: "Mock implementation", filesChanged: [], verification: ["Mock check"], remainingRisks: [] }));
}
