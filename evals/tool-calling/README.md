# Bounded multi-tool evaluation

This corpus evaluates issue #16's bounded orchestration contract offline. `cases.json` is versioned, public, fixture-backed, and strict: every case declares expected, allowed, and forbidden tools; the minimum distinct successful tools; evidence expectations; answer checks; and graceful-degradation behavior. It includes five multi-source cases, the public AI-product-role demo, partial/all-failure fixtures, a call-cap control, and two greeting controls.

Run from the repository root:

```bash
npm run eval:tool-calling:validate
npm run eval:tool-calling:offline -- --output-dir /tmp/johnserra-tool-calling-report
```

Validation imports no Gemini or Supabase credentials and writes no report. Offline mode replays the checked-in fixtures only; it never calls Gemini, Supabase, WordPress, or production chat. Reports are written to the requested directory. Keep `reports/` empty except for `.gitkeep`; use a temporary output directory for local runs.

Metrics include selected-tool precision/recall, unnecessary and incorrect-tool rates, redundant requested/accepted-executed calls, call-limit compliance, successful distinct tools, graceful-degradation pass rate, separate evidence and citation support, answer-faithfulness proxies, and no-tool control accuracy. Numerators and denominators are recorded. Phrase and citation checks are automated proxies, not semantic proof. Infrastructure failures are explicit and excluded from quality passes; this fixture runner has no live reliability claim.

The demo expects complementary public project evidence plus reviewed CV evidence without encoding a project answer or inventing a slug. A production model selection is still bounded to one selection turn and one tool-disabled final turn. The cap, per-tool deadlines, overall deadline, five-tool allowlist, safe errors, trace privacy boundary, and rollback notes are in [the evaluation guide](../../docs/multi-tool-evaluation.md).
