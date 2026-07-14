# Protect the 2B state files from the agent

The 2B state file carries `engaged`, `heavy`, the cooldown, and the pending
confirm. `heavy.json` selects the PAID model. If the agent can write these with
its own tools, it can set `heavy` by hand and skip the type-to-confirm spend
gate entirely.

This is not theoretical. On 2026-07-14 a `/2b engage` was queued behind a busy
agent, leaked into the conversation as plain text (see
`apply-command-bypass-patch.py`), and the agent helpfully emulated the command
by editing `.2b_state.json` directly. Every gate was bypassed: cooldown, kill
switch, and the approval card.

The enforcement layer must be protected from the thing it is enforcing on.

## Fix

Add these to your agent's protected-path / tool-write deny list (on Hermes with
the AUTOMATA inspector, this is the `PROTECTED` list):

    ~/.hermes/.2b_state.json
    ~/.hermes/.2b_killswitch
    ~/.config/2b-mode/          # heavy.json (picks the paid model) + gate.json

The plugin writes these **in-process**, so the legitimate command path is
unaffected. Only tool-layer writes by the agent are gated.

Pair this with `apply-command-bypass-patch.py`, which stops the command from
leaking to the model in the first place.
