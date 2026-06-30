#!/bin/bash
# Posts this gate job's result to the dashboard push-collector (POST /ci/runs). Runs as the
# final workflow step on the self-hosted runner. It MUST NEVER fail the gate: it no-ops when
# unconfigured and swallows all POST errors. No secrets are logged.
set -u
[ -n "${CI_COLLECTOR_URL:-}" ] || exit 0

# conclusion = the workflow job.status, passed in as JOB_STATUS (success/failure/cancelled).
body=$(jq -n \
  --arg repo "${GITHUB_REPOSITORY:-}" --arg node "${CI_REPORT_NODE:-}" \
  --arg conclusion "${JOB_STATUS:-unknown}" --arg sha "${GITHUB_SHA:-}" \
  --arg workflow "${GITHUB_WORKFLOW:-}" --arg branch "${GITHUB_REF_NAME:-}" \
  --arg run_id "${GITHUB_RUN_ID:-}" --arg run_attempt "${GITHUB_RUN_ATTEMPT:-}" \
  --arg job "${GITHUB_JOB:-}" \
  '{repo:$repo,node:$node,conclusion:$conclusion,sha:$sha,workflow:$workflow,branch:$branch,run_id:$run_id,run_attempt:$run_attempt,job:$job}')

curl -fsS --max-time 5 -X POST "$CI_COLLECTOR_URL" \
  -H "Authorization: Bearer ${CI_COLLECTOR_TOKEN:-}" \
  -H "Content-Type: application/json" \
  -d "$body" >/dev/null 2>&1 || true
exit 0
