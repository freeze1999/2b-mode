---
description: 2B scan, review the current diff for over-engineering, findings only
---
Load and follow the 2b-mode scan procedure. Read the current diff (git diff, staged and unstaged; or the target: {{args}}) and the code each hunk touches. Verify every finding against the real code before reporting it. One line per finding, ranked most damage first: file:line: what to cut, then the cheaper replacement with a deletion count. End with "scan clean" or "N confirmed, deepest cut: file". Never flag trust-boundary validation, data-loss handling, security, accessibility, requested behavior, or small runnable checks.
