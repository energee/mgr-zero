import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

function normalizeFindings(result) {
  assert.equal(result?.status, "DOCS_GAP", "only DOCS_GAP results create documentation issues");
  assert.ok(Array.isArray(result.findings), "DOCS_GAP result must include findings");
  assert.ok(result.findings.length > 0, "DOCS_GAP result must include at least one finding");
  assert.ok(result.findings.length <= 10, "DOCS_GAP result may include at most ten findings");

  return result.findings.map((finding, index) => {
    assert.ok(["missing", "conflict"].includes(finding.kind), `finding ${index + 1} has invalid kind`);
    for (const field of ["implementation_location", "documentation_owner", "gap", "correction"]) {
      assert.equal(typeof finding[field], "string", `finding ${index + 1} missing ${field}`);
      assert.ok(finding[field].trim(), `finding ${index + 1} has empty ${field}`);
    }
    return {
      kind: finding.kind,
      implementationLocation: finding.implementation_location.trim(),
      documentationOwner: finding.documentation_owner.trim(),
      gap: finding.gap.trim(),
      correction: finding.correction.trim(),
    };
  });
}

function issueBody({ owner, repo, pr, result }) {
  const findings = normalizeFindings(result);
  return [
    `Automated post-merge documentation review for https://github.com/${owner}/${repo}/pull/${pr}.`,
    "",
    "Claude performed a read-only review with repository `contents: read` and `pull-requests: read` permissions and only the Read, Grep, and Glob tools. This issue was created by a separate deterministic job with `issues: write`; Claude cannot commit to main, edit files, or write issues directly.",
    "",
    "## Required documentation corrections",
    "",
    ...findings.flatMap((finding, index) => [
      `### ${index + 1}. ${finding.kind}`,
      `- Implementation location: ${finding.implementationLocation}`,
      `- Owning document: ${finding.documentationOwner}`,
      `- Missing or conflicting documentation: ${finding.gap}`,
      `- Exact correction required: ${finding.correction}`,
      "",
    ]),
  ].join("\n").slice(0, 60000);
}

export default async function upsertDocumentationIssue({
  github,
  owner,
  repo,
  pr,
  result,
}) {
  const title = `Documentation follow-up for PR #${pr}`;
  const body = issueBody({ owner, repo, pr, result });
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: "all",
    per_page: 100,
  });
  const existing = issues.find(
    (issue) => !issue.pull_request && issue.title === title,
  );

  return existing
    ? github.rest.issues.update({
        owner,
        repo,
        issue_number: existing.number,
        title,
        body,
        state: "open",
      })
    : github.rest.issues.create({ owner, repo, title, body });
}

export { issueBody, normalizeFindings };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const calls = [];
  const github = {
    paginate: async (_method, input) =>
      input.repo === "mgr-zero"
        ? []
        : [{ number: 7, title: "Documentation follow-up for PR #3" }],
    rest: {
      issues: {
        listForRepo() {},
        create: async (input) => calls.push(["create", input]),
        update: async (input) => calls.push(["update", input]),
      },
    },
  };
  const result = {
    status: "DOCS_GAP",
    findings: [{
      kind: "missing",
      implementation_location: "app/example/page.tsx:12",
      documentation_owner: "docs/user-guide.md",
      gap: "New button is undocumented.",
      correction: "Add the button purpose, steps, fields, result, and errors.",
    }],
  };

  await upsertDocumentationIssue({ github, owner: "energee", repo: "mgr-zero", pr: 3, result });
  await upsertDocumentationIssue({ github, owner: "energee", repo: "existing", pr: 3, result });
  assert.deepEqual(calls.map(([method]) => method), ["create", "update"]);
}
