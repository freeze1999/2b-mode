---
description: 2B scan — review the current diff for over-engineering, findings only
---
Load and follow the 2b-mode scan discipline. Read the current diff (git diff, staged and unstaged; or the target: {{args}}) and the code each hunk touches. Verify every finding against the real code. Report one line per finding, ranked most damage first: file:line — what → the lower-rung replacement with a deletion count. End with "scan clean" or "N confirmed, deepest cut: file". Never flag trust-boundary validation, data-loss handling, security, accessibility, requested behavior, or small runnable checks.
