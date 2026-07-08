# 2b-mode

*What if your agent's "be minimal" mode couldn't be talked into turning itself on?*

A battle overlay plugin for the [Hermes agent](https://github.com/NousResearch/hermes-agent) gateway. `/2b engage` swaps a persistent agent into a silent, precise, minimal-strike coding stance; `/2b disengage` swaps it back. Between the two commands, every LLM turn carries one injected directive: question whether the code needs to exist, reuse before writing, stdlib before custom, one line before fifty, conclusions only.

Conceptually forked from [ponytail](https://github.com/DietrichGebert/ponytail) (MIT). No code is shared; the ladder methodology is the inheritance. What's new is the enforcement around it.

## The six fixes

Persona-overlay plugins tend to fail the same six ways. Each got a mechanical fix, not a prompt fix:

| Failure | Fix |
|---|---|
| Implicit triggering (mode flips because a message *smelled* like a directive) | Explicit slash command only. Zero content matching, no `pre_gateway_dispatch` sniffing at all |
| Anyone can flip the mode | Per-user gate in a gateway hook, `~/.config/2b-mode/gate.json`. Missing config fails open, corrupt config fails closed |
| Mode flapping (six toggles in five minutes) | 30s cooldown, on engage ONLY. Disengage is never rate-limited: a brake that says "wait 30 seconds" is a broken brake |
| Self-pollution (the injected banner feeds content matchers, including the mode's own) | Injected header is `[2B]`, nothing else. No MODE, no ACTIVE |
| Exit that doesn't stick | `/2b disengage kill` arms a sentinel that blocks engage until the gateway restarts |
| The overlay bleeding into the agent's identity | Injection rides `pre_llm_call` context, which Hermes appends to the user message. The system prompt is never touched, byte for byte |

## How it works

```
/2b engage ──▶ state file (.2b_state.json)
                      │
every turn while engaged:
pre_llm_call ──▶ {"context": "[2B]\n<combat directive>"} ──▶ user message
                                                             (system prompt untouched)
/2b disengage ──▶ off, always, instantly
/2b disengage kill ──▶ off + engage blocked until gateway restart
```

The gate lives in a separate gateway hook because Hermes plugin command handlers receive only the argument string, never the caller. The gateway's `command:2b` hook receives `platform` and `user_id` and can deny before dispatch, so authorization mounts there.

## Install

```bash
git clone https://github.com/freeze1999/2b-mode
cp -r 2b-mode ~/.hermes/plugins/2b-mode
cp -r 2b-mode/gate-hook ~/.hermes/hooks/2b-gate
# enable in ~/.hermes/config.yaml under plugins.enabled: - 2b-mode
# then restart your gateway
```

Lock it to yourself (optional; open by default):

```json
// ~/.config/2b-mode/gate.json
{"allow_all": false, "allowed": {"discord": ["<your user id>"]}}
```

## Commands

| Command | Effect |
|---|---|
| `/2b` or `/2b status` | state + usage, one line |
| `/2b engage` | combat stance on (30s cooldown between engages) |
| `/2b disengage` | stance off, never rate-limited |
| `/2b disengage kill` | off + engage disabled until gateway restart |
| `/2b scan [target]` | review the current diff for over-engineering, findings only, ranked |
| `/2b audit` | full-repo sweep for dead weight, evidence then kill list |
| `/2b diag` | injection-pipeline health in one reply: state, skill file, context size, probe |

## Make it your own overlay

The 2B persona is content, not mechanics. Everything load-bearing (explicit
command, gate, cooldown, kill switch, identity-safe injection) lives in the
plugin; the stance itself is just `skills/2b/SKILL.md`. Rewrite that file
into any working-style overlay you want, keep the `[2B]`-style short header,
and the same enforcement carries it. The scan and audit skills are equally
swappable.

## Troubleshooting

The failure mode you will actually hit: commands work, state says engaged,
but the agent's behavior doesn't change. Debug it in this order (this is
the order that settled it in production):

1. `/2b diag`, checks the plugin's own half: state, skill file resolvable,
   context builds with the right header.
2. Set `HERMES_2B_PROBE=1` in the gateway's environment and restart it.
   Every `pre_llm_call` firing now appends a line to
   `~/.hermes/.2b_probe.log` (self-truncates at 1MB). No lines after real
   messages = your gateway's turn path never fires plugin `pre_llm_call`,
   which is a gateway-side issue, not this plugin.
3. Lines appear with `engaged=True` but behavior is unchanged = check where
   your Hermes version injects plugin context (`agent/turn_context.py`,
   `agent/conversation_loop.py`): it should append to the current user
   message. Then remember the overlay adds work discipline, not a
   personality: judge it on a coding task, not small talk.

## Self-tests

Both moving parts carry their own suites, pure logic, no gateway needed:

```bash
python3 __init__.py --test          # 18 checks: state machine, cooldown, kill, injection, diag, probe
python3 gate-hook/handler.py --test # 8 checks: gate policy incl. fail-open/fail-closed
```

## Status

What this is: a Hermes gateway plugin plus one gateway hook, running in production on one persistent agent. The state machine, gate policy, and injection content are covered by the self-tests above.

What this is NOT: a jailbreak, a personality replacement, or a general mode framework. It injects a working-style directive for coding tasks and nothing else; the agent's identity layer is deliberately out of reach (that separation is the point). Tested against the Hermes gateway only; the ladder content is agent-agnostic, the mechanics are not.
