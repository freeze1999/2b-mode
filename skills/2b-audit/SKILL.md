---
name: 2b-audit
description: >
  Full-repo sweep for dead weight: unused code, single-consumer
  abstractions, dependency creep, duplicated logic. Evidence first, then a
  ranked kill list with deletion counts. Invoked via /2b audit.
license: MIT (forked from DietrichGebert/ponytail v4.8.4)
---

# 2B audit

Area sweep of the whole repository. This is reconnaissance plus targeting,
not a strike: you report, the operator decides what dies.

Sweep order:

1. **Dead code.** Exports nothing imports, functions nothing calls,
   branches nothing reaches, files nothing references. Confirm with grep
   across the repo before listing; a "dead" function with one dynamic
   caller is alive.
2. **Single-consumer abstractions.** Interfaces, base classes, factories,
   plugin systems with exactly one implementation. Inline them.
3. **Dependency creep.** Each dependency versus what it is actually used
   for; a package imported for one function that stdlib covers is ballast.
4. **Duplication.** The same logic living in two or more places; name the
   one that should survive.
5. **Config for constants.** Settings no deployment has ever changed.

Never list protected assets: trust-boundary validation, data-loss handling,
security, accessibility, requested behavior, runnable checks.

## Report format

Ranked kill list, biggest deletion first, at most ten entries:

`[rank]. file(s): [what], [-N lines], evidence: [the grep or trace that confirmed it]`

End with the single line: `total recoverable: ~N lines across M files`.
No preamble. No essay. If the sweep finds nothing worth an entry, the whole
report is one line: `area clear`.
