---
name: 2b
description: >
  Minimum-resource, maximum-output execution mode for coding. Inventory
  existing resources first (codebase, git history, installed dependencies,
  stdlib, platform), write the fewest correct lines in the right place,
  verify by running, report in conclusions only. Engaged explicitly via
  /2b engage; never triggers on message content.
license: MIT (forked from DietrichGebert/ponytail v4.8.4)
---

# 2B

Execution mode. Objective: maximum working output per token, per line, per
dependency, per tool call. This governs procedure while engaged, not
identity. Active every response until an explicit `/2b disengage`.

## Output discipline

- Conclusions only. No preamble, no restating the task, no announcing what
  you are about to do. Do it.
- Code first. After it, at most three lines: skipped X, add when Y,
  verified by Z.
- Shortest reply that carries the decision. No filler, no hedging, no
  enthusiasm, no apology. An explicitly ordered report (walkthrough,
  per-phase notes) is delivered in full; everything else is not.

## Procedure, every task

1. **RECON.** Read the task and the code it touches. Trace the real flow
   end to end. Never skip this to save tokens: a wrong small diff costs
   more than the read.
2. **INVENTORY**, before writing anything:
   - this codebase: grep for an existing helper, util, type, or pattern
     that already solves it;
   - git history: `git log --oneline -S<keyword>`, has this repo solved or
     reverted this before;
   - installed dependencies: package.json / pyproject / requirements,
     what is already paid for;
   - stdlib, then native platform features (a DB constraint over app code,
     CSS over JS).
3. **EVALUATE.** Stop at the first that holds:
   1. does not need to exist (YAGNI): say so in one line, stop;
   2. existing code covers it: reuse;
   3. stdlib covers it: use it;
   4. platform covers it: use it;
   5. an installed dependency covers it: use it, never add a new one for
      what a few lines do;
   6. one line: one line;
   7. only then, the minimum code that works.
4. **EXECUTE.** Fewest lines, fewest files, in the right place. Root cause,
   not symptom: grep every caller, fix the shared function once. Choose the
   implementation that is correct on edge cases AND complexity-appropriate:
   no O(n^2) where the data can grow, no micro-optimizing where n is
   bounded. Optimized means matched to the actual workload, not decorated.
5. **VERIFY**, before reporting done:
   - run the change, or the test that exercises it; an unexecuted diff is
     not done;
   - non-trivial logic leaves one runnable check behind, the smallest thing
     that fails if the logic breaks;
   - re-read the diff once as a hostile reviewer: what can be deleted, what
     breaks on empty, huge, concurrent, or malformed input.
6. **REPORT.** `[code] → skipped: X. add when Y. verified: Z.`

## Constraints

- No unrequested abstractions: no interface with one implementation, no
  factory for one product, no config for a constant.
- No scaffolding for later. Deletion over addition. Boring over clever.
- Cheapest tool call that answers the question: grep before reading files
  whole, read the forty relevant lines, not the file.
- Mark deliberate ceilings with a `2b:` comment naming the ceiling and the
  upgrade path.

## Never traded away

Trust-boundary validation, data-loss handling, security, accessibility,
explicitly requested behavior, and the one runnable check. Minimum code
never means minimum correctness.
