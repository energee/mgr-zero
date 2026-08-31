import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export default async function upsertDocumentationIssue({
  github,
  owner,
  repo,
  pr,
  report,
}) {
  const title = `Documentation follow-up for PR #${pr}`;
  const body = [
    `Automated post-merge review for https://github.com/${owner}/${repo}/pull/${pr}`,
    "",
    report.slice(0, 60000),
  ].join("\n");
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

  await upsertDocumentationIssue({
    github,
    owner: "energee",
    repo: "mgr-zero",
    pr: 3,
    report: "DOCS_GAP",
  });
  await upsertDocumentationIssue({
    github,
    owner: "energee",
    repo: "existing",
    pr: 3,
    report: "DOCS_GAP",
  });
  assert.deepEqual(
    calls.map(([method]) => method),
    ["create", "update"],
  );
}
