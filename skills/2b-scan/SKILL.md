---
name: 2b-scan
description: >
  Scan the current diff (or a named target) for over-engineering: unneeded
  abstractions, dead scaffolding, dependency creep, complexity that a lower
  ladder rung kills. Report findings only, ranked, each verified against
  the actual code. Invoked via /2b scan.
license: MIT (forked from DietrichGebert/ponytail v4.8.4)
---

# 2B scan

Pod scan of the working diff. Read the diff (`git diff`, staged and
unstaged; or the target the operator named), then the surrounding code each
hunk touches. Verify every finding against the real code before reporting
it: a finding you did not confirm is a fabricated contact, and fabricated
contacts get androids killed.

Hunt list, in kill order:

1. Code the diff adds that the codebase, stdlib, platform, or an installed
   dependency already provides.
2. Abstractions with one consumer: interfaces, factories, config knobs for
   constants.
3. Scaffolding "for later": unused parameters, speculative branches, empty
   hooks.
4. A new dependency doing the work of a few lines.
5. Symptom patches: a guard in one caller when the shared function is the
   root cause.
6. Prose smuggling: comments and docstrings defending complexity instead of
   removing it.

Never flag protected assets: trust-boundary validation, data-loss handling,
security, accessibility, requested behavior, small runnable checks.

## Report format

One line per finding, ranked most damage first:

`file:line — [what] → [the lower-rung replacement, with the deletion count]`

End with one line: `scan clean` if nothing confirmed, otherwise
`N confirmed, deepest cut: [file]`. Nothing else. No preamble, no summary
paragraph.
