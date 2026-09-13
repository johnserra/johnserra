# Bounded evidence-agent offline report

Corpus: issue-19-2026-09-13
Completed: 2026-09-13T21:31:27.381Z
Mode: deterministic checked-in fixture replay; no provider, credentials, or network calls.

## Aggregate

- Cases: 12; terminated: 12/12; completed: 10/12.
- Stop-reason accuracy: 12/12.
- Claim support proxy: 8/9; citation support proxy: 8/8.
- Shortest-path correctness: 1/1.
- Accepted tool executions: 14; retrieval rounds: 11; verification passes: 6.
- Revisions: 2; qualifications: 6; removed claims: 1.
- Infrastructure failures: 3; usage completeness complete/partial/unknown: 5/4/3.

## Cases

| Case | Stop reason | Complete | Tools | Rounds | Verify | Revised | Qualified | Latency ms | Usage | Infra failure |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|
| direct-greeting | direct_no_tools | yes | 0 | 0 | 0 | no | no | 120 | complete | no |
| sufficient-first-round | supported_evidence | yes | 2 | 1 | 1 | no | no | 3200 | complete | no |
| insufficient-then-second-round | supported_evidence | yes | 3 | 2 | 1 | no | no | 8200 | partial | no |
| unsupported-claim-removed | qualified_completion | yes | 1 | 1 | 1 | yes | no | 4100 | complete | no |
| partial-tool-failure | qualified_completion | yes | 1 | 1 | 1 | yes | yes | 5200 | partial | no |
| all-tools-failed | all_tools_failure | yes | 0 | 1 | 0 | no | yes | 3000 | unknown | no |
| verifier-timeout | verifier_failure | yes | 1 | 1 | 1 | no | yes | 9000 | unknown | yes |
| malformed-verifier-output | verifier_failure | yes | 1 | 1 | 1 | no | yes | 3900 | partial | no |
| overall-deadline | deadline_exceeded | no | 2 | 1 | 0 | no | no | 45000 | partial | yes |
| budget-exhaustion | budget_exceeded | yes | 3 | 1 | 0 | no | yes | 7600 | complete | no |
| cancellation | cancellation | no | 0 | 0 | 0 | no | no | 40 | unknown | yes |
| raw-cap-enforcement | budget_exceeded | yes | 0 | 1 | 0 | no | yes | 200 | complete | no |

These claim and citation figures are deterministic structural proxies over the fixture metadata, not semantic proof. Infrastructure failures are reported separately and never converted into quality passes. Token and cost totals are only meaningful for cases whose usage accounting is marked complete or partial; unknown values remain unknown.
