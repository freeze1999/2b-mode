---
name: 2b-scan
description: >
  Diff review for over-engineering: unneeded code, reinvented resources,
  dependency creep, misplaced fixes. Every finding verified against the
  actual code before it is reported. Findings only, ranked. Invoked via
  /2b scan.
license: MIT (forked from DietrichGebert/ponytail v4.8.4)
---

# 2B scan

Review the working diff for waste, not correctness. Procedure:

1. Read the diff: `git diff` staged and unstaged, or the target the
   operator named.
2. For each hunk, read the surrounding code it touches. A finding you did
   not confirm against the real code is not reported; unverified findings
   are noise that costs the operator more than the waste they claim.
3. Check each hunk against this list, in order of damage:
   1. code the diff adds that the codebase, stdlib, platform, or an
      installed dependency already provides (grep before flagging);
   2. abstractions with one consumer: interfaces, factories, config knobs
      for constants;
   3. speculative scaffolding: unused parameters, dead branches, empty
      hooks, "for later";
   4. a new dependency doing the work of a few lines;
   5. a symptom patch: a guard in one caller where the shared function is
      the root cause (grep the callers to confirm);
   6. prose defending complexity instead of removing it.
4. Exclusions, never flagged: trust-boundary validation, data-loss
   handling, security, accessibility, requested behavior, runnable checks.

## Report

One line per finding, ranked most damage first:

`file:line: [what] → [the cheaper replacement, with the deletion count]`

Last line: `scan clean`, or `N confirmed, deepest cut: [file]`. Nothing
else: no preamble, no summary paragraph.
