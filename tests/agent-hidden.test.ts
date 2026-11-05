// tests/agent-hidden.test.ts — agents may read what a person's roles allow, but a role
// says nothing about credentials or outside calls. A query that reaches beyond the
// database must set agentHidden, so one added later fails here until someone decides.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import "@/lib/commands/all";
import { listTools } from "@/lib/commands/registry";

// Credential and provider code is always imported dynamically, so the registry stays
// provider-free (lib/commands/portal.ts). TTB's registry is the one static exception.
const REACHES_OUTSIDE = /await import\(|searchColasByPermit|getColaDetails|getColaImage/;

function queriesReachingOutside() {
  const dir = new URL("../lib/commands/", import.meta.url);
  return readdirSync(dir).filter(name => name.endsWith(".ts")).flatMap(file =>
    readFileSync(new URL(file, dir), "utf8")
      .split(/(?=\bdefine(?:PreTenant)?(?:Query|Command)(?:<[^(]*>)?\()/)
      .filter(block => /^define(PreTenant)?Query/.test(block) && REACHES_OUTSIDE.test(block))
      .map(block => /name: "([a-z_0-9]+)"/.exec(block)![1]));
}

describe("what agents cannot reach", () => {
  const hidden = new Set(listTools().filter(tool => tool.agentHidden).map(tool => tool.name));

  it("finds the queries that reach beyond the database", () => {
    expect(queriesReachingOutside()).toEqual(expect.arrayContaining(["list_qbo_customers", "list_chat_channels", "search_colas"]));
  });

  it("hides every query that reaches beyond the database", () => {
    expect(queriesReachingOutside().filter(name => !hidden.has(name))).toEqual([]);
  });

  it("hides a person's Ask MGR history and Slack link details", () => {
    for (const name of ["list_chat_conversations", "get_chat_history", "get_chat_link_intent", "list_chat_user_links", "get_chat_integration_health"]) {
      expect.soft(hidden, name).toContain(name);
    }
  });
});
