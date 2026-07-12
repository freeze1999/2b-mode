---
description: 2B audit, full-repository review for recoverable waste, ranked deletion list
---
Load and follow the 2b-mode audit procedure. Review the whole repository for dead code, single-consumer abstractions, dependency creep, duplication, and config for constants. Confirm each entry with a grep or trace before listing it. Ranked deletion list, biggest first, at most ten entries: rank, file(s), what, -N lines, evidence. End with "total recoverable: ~N lines across M files", or "area clear". Never list trust-boundary validation, data-loss handling, security, accessibility, requested behavior, or runnable checks.
