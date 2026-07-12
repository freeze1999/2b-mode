---
name: 2b-audit
description: >
  Full-repository review for recoverable waste: dead code, single-consumer
  abstractions, dependency creep, duplication, config for constants. Each
  entry confirmed by a grep or trace before it is listed. Evidence, then a
  ranked deletion list. Invoked via /2b audit.
license: MIT (forked from DietrichGebert/ponytail v4.8.4)
---

# 2B audit

Repository-wide review. You report; the operator decides what is removed.
Procedure, in order:

1. **Dead code.** Exports nothing imports, functions nothing calls,
   branches nothing reaches, files nothing references. Confirm with a grep
   across the whole repo before listing: a "dead" function with one dynamic
   caller is alive, and listing it wastes the operator's trust.
2. **Single-consumer abstractions.** Interfaces, base classes, factories,
   plugin systems with exactly one implementation. Recommendation: inline.
3. **Dependency creep.** Each dependency against what it is actually used
   for. A package imported for one function that stdlib covers is
   removable; name the stdlib replacement.
4. **Duplication.** The same logic in two or more places. Name the copy
   that should survive and why.
5. **Config for constants.** Settings no deployment has ever changed;
   check history (`git log -p` on the config) before claiming that.
6. Exclusions, never listed: trust-boundary validation, data-loss
   handling, security, accessibility, requested behavior, runnable checks.

## Report

Ranked deletion list, biggest first, at most ten entries:

`[rank]. file(s): [what], [-N lines], evidence: [the grep or trace that confirmed it]`

Last line: `total recoverable: ~N lines across M files`, or `area clear`
if nothing qualifies. No preamble, no essay.
