"""Gateway hook: per-user gate for /2b.

Fired as command:2b with {"platform", "user_id", ...} BEFORE dispatch
(gateway/run.py fires command:<canonical> via emit_collect and honors
{"decision": "deny"}). Plugin command handlers only receive raw_args, so
authorization has to live here, on the gateway bus.

Config: ~/.config/2b-mode/gate.json
  {"allow_all": true}                                   # open (default)
  {"allow_all": false,
   "allowed": {"discord": ["123"], "telegram": ["456"]}}

Fail-open on a MISSING config (fresh install must not brick the command),
fail-CLOSED on a corrupt one (a half-written gate must gate).

Self-test: python3 handler.py --test
"""
from __future__ import annotations

import json
import os
from pathlib import Path

GATE_FILE = Path(os.environ.get(
    "HERMES_2B_GATE_FILE",
    str(Path.home() / ".config" / "2b-mode" / "gate.json"))).expanduser()

DENY = {"decision": "deny", "message": "[2B] Access denied."}


def gate_allows(platform: str, user_id) -> bool:
    if not GATE_FILE.exists():
        return True
    try:
        cfg = json.loads(GATE_FILE.read_text())
    except Exception:
        return False
    if cfg.get("allow_all", True):
        return True
    allowed = cfg.get("allowed", {})
    ids = allowed.get(str(platform or "").lower(), [])
    return str(user_id) in [str(i) for i in ids]


async def handle(event_type: str, context: dict):
    if gate_allows(context.get("platform", ""), context.get("user_id")):
        return None
    return DENY


def _self_test() -> int:
    import tempfile
    global GATE_FILE
    checks = []

    def ok(name, cond):
        checks.append((name, bool(cond)))

    with tempfile.TemporaryDirectory() as td:
        GATE_FILE = Path(td) / "gate.json"
        ok("missing config fails open", gate_allows("discord", "1"))
        GATE_FILE.write_text('{"allow_all": true}')
        ok("allow_all true opens", gate_allows("discord", "1"))
        GATE_FILE.write_text(json.dumps(
            {"allow_all": False, "allowed": {"discord": ["42"], "telegram": [7]}}))
        ok("listed id allowed", gate_allows("discord", "42"))
        ok("int id in config matches str caller", gate_allows("telegram", "7"))
        ok("platform is case-insensitive", gate_allows("Discord", 42))
        ok("unlisted id denied", not gate_allows("discord", "43"))
        ok("unlisted platform denied", not gate_allows("whatsapp", "42"))
        GATE_FILE.write_text("{corrupt")
        ok("corrupt config fails closed", not gate_allows("discord", "42"))

    failed = [n for n, c in checks if not c]
    for n, c in checks:
        print(("PASS " if c else "FAIL ") + n)
    print(f"{len(checks) - len(failed)}/{len(checks)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    import sys
    if "--test" in sys.argv:
        raise SystemExit(_self_test())
    print(__doc__)
