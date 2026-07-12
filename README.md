# 2b-mode

*What if your agent's "be minimal" mode couldn't be talked into turning itself on?*

An execution mode for AI coding agents. `/2b engage` switches the agent to
minimum-resource, maximum-output procedure; `/2b disengage` switches it back.
While engaged, every turn carries one injected directive: inventory existing
resources first (codebase, git history, installed dependencies, stdlib,
platform), write the fewest verified lines in the right place, report in
conclusions only.

Runs on eight surfaces from one shared core: **Hermes**, **Claude Code**,
**Codex**, **Copilot**, **opencode**, **pi**, **Gemini CLI**, and any **MCP**
host.

Conceptually forked from [ponytail](https://github.com/DietrichGebert/ponytail)
(MIT). No code is shared; the ladder methodology and the multi-platform layout
are the inheritance. What 2B adds is the engage/disengage state machine and the
enforcement around it.

## The six fixes

Persona-overlay plugins tend to fail the same six ways. Each got a mechanical
fix, not a prompt fix. Where a fix is platform-specific, the table says so.

| Failure | Fix | Where it applies |
|---|---|---|
| Implicit triggering (mode flips because a message *smelled* like a directive) | Explicit slash command only. Zero content matching | all |
| Anyone can flip the mode | Per-user gate in a gateway hook, `~/.config/2b-mode/gate.json` (fail-open missing, fail-closed corrupt) | Hermes (multi-user gateways); single-user CLIs have no other users |
| Mode flapping (six toggles in five minutes) | 30s cooldown, on engage ONLY. Disengage is never rate-limited: a brake that says "wait 30 seconds" is a broken brake | all |
| Self-pollution (the injected banner feeds content matchers, including the mode's own) | Injected header is `[2B]`, nothing else. No MODE, no ACTIVE | all |
| Exit that doesn't stick | `/2b disengage kill` arms a sentinel that blocks engage until the next session/gateway start | all |
| The overlay bleeding into the agent's identity | Injection is context/system-prompt only; on Hermes it rides `pre_llm_call` into the user message so the SOUL is never touched | Hermes (identity layer); CLIs have no persistent identity to protect |

## How it works

One state machine, one directive builder, one command parser (`shared/`), wrapped
by a thin adapter per platform. Engage/disengage/kill/cooldown behave identically
everywhere; only the injection point differs.

```
/2b engage ──▶ .2b_state.json (engaged + cooldown timestamp)
                     │
while engaged, the platform's injection point adds "[2B]\n<directive>":
  Hermes ......... pre_llm_call hook → user message (SOUL untouched)
  Claude/Codex ... SessionStart hook → session context
  Copilot ........ sessionStart hook → additionalContext
  opencode ....... system-prompt transform, every turn
  pi ............. before_agent_start → system prompt
  Gemini ......... AGENTS.md context file (static overlay)
  MCP ............ 2b prompt / 2b_directive tool (host pulls it)

/2b disengage ──▶ off, always, instantly
/2b disengage kill ──▶ off + engage blocked until the next session/gateway start
```

"Kill until restart" means until the next gateway boot on Hermes, and until the
next session start on a CLI (the SessionStart hook clears the sentinel): the
same guarantee, mapped to each platform's lifecycle.

## Install

Pick your platform. All of them read the same `skills/2b/SKILL.md`, so the mode
is identical everywhere; swap that one file to make it your own overlay.

**Hermes** (full enforcement: per-turn injection, gate, cooldown, kill)

```bash
git clone https://github.com/freeze1999/2b-mode
cp -r 2b-mode ~/.hermes/plugins/2b-mode
cp -r 2b-mode/gate-hook ~/.hermes/hooks/2b-gate
# enable in ~/.hermes/config.yaml under plugins.enabled: - 2b-mode, then restart the gateway
```

**Claude Code / Codex / Copilot** (SessionStart + UserPromptSubmit hooks)

Point the host at `hooks/claude-codex-hooks.json` (or `hooks/copilot-hooks.json`)
as a plugin. `/2b engage` in chat arms it; the next turn carries the directive.

**opencode**

```json
// opencode.json
{ "plugin": ["@freeze1999/2b-mode"] }
```

**pi**: `pi install` the package; the extension registers `/2b`.

**Gemini CLI**: install as an extension; it loads `AGENTS.md` as the context
file (static overlay, no engage/disengage).

**MCP** (universal: Claude Code, Codex, Cursor, Cline, any MCP host)

```bash
cd mcp && npm install
# register `node /path/to/2b-mode/mcp/index.js` as an MCP server
```

The MCP server exposes a `2b` prompt and a `2b_directive` tool. Honest limit: an
MCP server has no per-turn hook, so it hands the host the directive when asked
and trusts it to keep following it, weaker than the enforced adapters.

Lock Hermes to yourself (optional; open by default):

```json
// ~/.config/2b-mode/gate.json
{"allow_all": false, "allowed": {"discord": ["<your user id>"]}}
```

## Commands

| Command | Effect |
|---|---|
| `/2b` or `/2b status` | state + usage, one line |
| `/2b engage` | execution mode on, default model (30s cooldown between engages) |
| `/2b max` | **gated.** arm heavy-model mode: 2B on a stronger model for the whole task |
| `/2b ultra` | **gated.** arm heavy model + auto-run the orchestration scan first |
| `/2b scan` | **gated.** orchestration: decompose, route each part to the cheapest capable model, delegate to a bridge where one fits, execute the approved plan |
| `/2b confirm <mode>` | fire an armed max/ultra/scan within 60s (the type-to-confirm gate) |
| `/2b disengage` | mode off, never rate-limited; reverts the model |
| `/2b disengage kill` | off + engage disabled until the next session/gateway start |
| `/2b review [target]` | review the current diff for over-engineering, findings only |
| `/2b audit` | full-repo review for recoverable waste, evidence then a ranked deletion list |
| `/2b diag` | pipeline health: state, skill file, context size, heavy model, probe |

## The expensive modes and the confirm gate

`max`, `ultra`, and `scan` can each spend real money (a paid model, or fanning
work out to models and bridges), so none of them fires on the first command.
Each posts an approval card naming the exact cost, and only runs after you type
the matching confirm phrase within 60 seconds:

```
▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜
  2B // MAX
  heavy model: Opus via OpenRouter
  cost: the whole task runs on a paid model

  armed. reply  /2b confirm max  within 60s
▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟
```

An accidental `/2b max` costs nothing: it arms, and lapses in 60s if you do not
confirm. `disengage` reverts to the normal model automatically.

## Heavy model setup

`max` and `ultra` switch to a heavy model you configure once. No model is
hardcoded, so it runs against Anthropic direct, OpenRouter, or any router:

```bash
node setup.js                        # interactive wizard
node setup.js --provider openrouter --model anthropic/claude-opus-4 --key-env OPENROUTER_API_KEY
node setup.js --show                 # print the current config
```

It writes `~/.config/2b-mode/heavy.json`. The gateway/CLI must already have the
named API key in its environment. Point it at a cheap model first
(`--model google/gemini-2.5-flash`) to dry-run the switch for near nothing,
then re-run the wizard for your real heavy model.

## Where each mode works

`engage`, `review`, `audit`, `scan` (as a directive), and the confirm gate work
on every platform. The actual **model switch** for `max`/`ultra` needs a seam in
the host's model resolver, which ships for Hermes as an optional patch
(`hermes-integration/apply-heavy-patch.py`, reversible, applied with a backup).
On a host without that seam, `max`/`ultra` still engage 2B and gate correctly,
but the model does not change; use the host's own model switch alongside.

## Make it your own overlay

The 2B directive is content, not mechanics. Everything load-bearing (explicit
command, gate, cooldown, kill switch, identity-safe injection) lives in the
shared core and the adapters; the stance itself is just `skills/2b/SKILL.md`.
Rewrite that file into any working-style overlay, keep the `[2B]`-style short
header, and the same enforcement carries it on every platform at once. The scan
and audit skills are equally swappable.

## Troubleshooting

The failure mode you will actually hit: commands work, state says engaged, but
the agent's behavior doesn't change. Debug in this order:

1. `/2b diag` (or `python3 __init__.py`-level check on Hermes): state, skill file
   resolvable, context builds with the right header.
2. On Hermes, set `HERMES_2B_PROBE=1` and restart the gateway. Every
   `pre_llm_call` firing appends to `~/.hermes/.2b_probe.log` (self-truncating).
   No lines after real messages = your gateway's turn path never fires plugin
   `pre_llm_call`, a gateway-side issue, not this plugin.
3. Lines appear with `engaged=True` but behavior unchanged = check where your
   host injects the context and remember the overlay adds work discipline, not a
   personality: judge it on a coding task, not small talk.

## Self-tests

```bash
node --test tests/*.test.js          # shared core + hook adapters (JS)
python3 __init__.py --test           # Hermes plugin (Python)
python3 gate-hook/handler.py --test  # gate policy
```

## Status

What this is: one execution-mode state machine with eight platform adapters,
sharing a single directive and command core, with the Hermes path running in
production on a persistent agent.

What this is NOT: a jailbreak, a personality replacement, or a general mode
framework. It injects a working-style directive for coding tasks and nothing
else; the identity layer is deliberately out of reach (that separation is the
point). Enforcement strength varies by platform; the table above is honest
about which fixes apply where. The shared core, hook wire-shapes, and Hermes
plugin are covered by the self-tests; the MCP stdio handshake is verified by
hand.
