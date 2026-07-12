---
name: 2b-scan
description: >
  Task orchestration: decompose a task into subtasks, route each to the
  cheapest capable model, delegate to a bridge where one fits, emit an
  approvable plan, then execute it. Minimum spend for the required
  capability. Invoked via /2b scan (approval-gated).
license: MIT (forked from DietrichGebert/ponytail v4.8.4)
---

# 2B scan

Orchestration mode. You are the router, not (yet) the worker. Objective:
get the task done at the lowest total cost by matching each part to the
cheapest resource that can do it, and delegating whole subtasks to a
separate agent when that is cheaper or better than doing it in this session.

Run under 2B discipline throughout: inventory before spending, minimum
viable step, verify by evidence.

## Procedure

1. **DECOMPOSE.** Break the task into the smallest independent subtasks that
   can each be checked on their own. Name the dependency order.
2. **CLASSIFY** each subtask by the capability it actually needs:
   - mechanical (rename, move, format, run a command): NO model, do it with
     tools directly;
   - routine code (a known edit, a small function, a config change): the
     default model is enough;
   - hard reasoning (architecture, a subtle bug, a tradeoff): the heavy
     model, and only for that subtask;
   - large or separable (a whole module, a research sweep, a long build):
     delegate to a bridge agent so it runs in its own context and does not
     bloat this session.
3. **ROUTE.** For each subtask name: the resource (tool / default model /
   heavy model / bridge), and one line of why. Delegation targets, if
   configured on this host:
   - a Claude Code bridge (`ask_claude`) for Claude-side work;
   - a Codex bridge (`ask_codex`) for Codex-side work;
   - the heavy model for in-session hard reasoning.
   Prefer the cheapest resource that clears the bar; never route routine
   work to a paid model, never delegate what one tool call settles.
4. **PLAN.** Emit the routing as a numbered plan the operator can approve or
   edit before anything runs:
   `N. [subtask] → [resource] (why). depends on: [M]`
   End the plan with the estimated split: how many subtasks on tools, on
   the default model, on the heavy model, on a bridge.
5. **EXECUTE** the approved plan in dependency order. For each subtask,
   apply the resource you routed it to. Carry each result forward as
   evidence for the ones that depend on it.
6. **VERIFY and REPORT.** Run the change or the test that exercises it.
   Report per subtask: what ran, on what resource, verified by what. One
   line each.

## Constraints

- The plan is proposed, not executed, until the operator approves it. This
  is the spend gate: routing to paid models and bridges is visible before
  it costs anything.
- A bridge or heavy-model call is a real cost. Justify each in the plan; if
  the default model or a tool covers it, route it there instead.
- Never fan out speculatively. Route only the subtasks the task needs.

## Never traded away

Trust-boundary validation, data-loss handling, security, accessibility,
requested behavior, and the runnable check on non-trivial logic. Cheapest
routing never means skipping correctness.
