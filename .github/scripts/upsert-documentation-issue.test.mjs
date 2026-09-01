import assert from "node:assert/strict";
import test from "node:test";
import upsertDocumentationIssue, { issueBody, normalizeFindings } from "./upsert-documentation-issue.mjs";

const gap = {
  status: "DOCS_GAP",
  findings: [{
    kind: "conflict",
    implementation_location: "app/(app)/catalog/product-form.tsx:31",
    documentation_owner: "docs/user-guide.md",
    gap: "The guide names a field that is not shown.",
    correction: "Replace the stale field name with the visible form label.",
  }],
};

test("validates and normalizes structured findings", () => {
  assert.deepEqual(normalizeFindings(gap), [{
    kind: "conflict",
    implementationLocation: "app/(app)/catalog/product-form.tsx:31",
    documentationOwner: "docs/user-guide.md",
    gap: "The guide names a field that is not shown.",
    correction: "Replace the stale field name with the visible form label.",
  }]);
});

test("rejects DOCS_OK and empty DOCS_GAP results", () => {
  assert.throws(() => normalizeFindings({ status: "DOCS_OK", findings: [] }), /DOCS_GAP/);
  assert.throws(() => normalizeFindings({ status: "DOCS_GAP", findings: [] }), /at least one/);
});

test("issue body identifies location, owning document, gap, correction, and security boundary", () => {
  const body = issueBody({ owner: "energee", repo: "mgr-zero", pr: 13, result: gap });
  assert.match(body, /Implementation location: app\/\(app\)\/catalog\/product-form\.tsx:31/);
  assert.match(body, /Owning document: docs\/user-guide\.md/);
  assert.match(body, /Missing or conflicting documentation:/);
  assert.match(body, /Exact correction required:/);
  assert.match(body, /separate deterministic job/);
});

test("upserts one idempotent issue per PR", async () => {
  const calls = [];
  const github = {
    paginate: async (_method, input) =>
      input.repo === "mgr-zero" ? [] : [{ number: 7, title: "Documentation follow-up for PR #13" }],
    rest: {
      issues: {
        listForRepo() {},
        create: async (input) => calls.push(["create", input]),
        update: async (input) => calls.push(["update", input]),
      },
    },
  };

  await upsertDocumentationIssue({ github, owner: "energee", repo: "mgr-zero", pr: 13, result: gap });
  await upsertDocumentationIssue({ github, owner: "energee", repo: "existing", pr: 13, result: gap });

  assert.deepEqual(calls.map(([method]) => method), ["create", "update"]);
  assert.equal(calls[1][1].issue_number, 7);
});
