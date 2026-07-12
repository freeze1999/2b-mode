#!/usr/bin/env python3
"""Apply (or roll back) the 2b-mode heavy-model seam in the Hermes gateway.

/2b max and /2b ultra set a `heavy` flag in ~/.hermes/.2b_state.json. This
patch teaches the gateway's per-turn model resolver to honor that flag: when
2B is heavy-engaged and the user has NOT set a manual /model override, the turn
runs on the model from ~/.config/2b-mode/heavy.json. Clearing the flag (any
/2b disengage) reverts automatically, with no capture-and-restore.

It is a no-op unless a heavy mode was explicitly confirmed, so a gateway with
2B in standby behaves exactly as before.

Usage:
  python3 apply-heavy-patch.py apply    [--run-py PATH]
  python3 apply-heavy-patch.py rollback [--run-py PATH]
  python3 apply-heavy-patch.py status   [--run-py PATH]

Default --run-py: ~/.hermes/hermes-agent/gateway/run.py
Re-applying is safe (idempotent). Restart the gateway after apply/rollback.
"""
import sys, shutil
from pathlib import Path

ANCHOR = "        override = self._session_model_overrides.get(resolved_session_key) if resolved_session_key else None\n"

BLOCK = '''        # --- 2b-mode heavy seam (BEGIN) ---
        # When /2b max|ultra is engaged and no manual /model override is set,
        # run on the configured heavy model. Rather than resolve credentials
        # here (fragile), set `override` and let the existing override machinery
        # below handle it, including the no-api_key env fallback. A no-op in 2B
        # standby, and manual /model always wins because we only fire on empty.
        if not override:
            try:
                _sd = Path.home() / ".hermes"
                _st = json.loads((_sd / ".2b_state.json").read_text())
                if _st.get("engaged") and _st.get("heavy") and not (_sd / ".2b_killswitch").exists():
                    _hp = os.environ.get("HERMES_2B_HEAVY_FILE") or str(Path.home() / ".config" / "2b-mode" / "heavy.json")
                    _hv = json.loads(Path(_hp).read_text())
                    if _hv.get("model"):
                        _hk = os.environ.get(_hv["api_key_env"]) if _hv.get("api_key_env") else None
                        logger.info("2b-mode heavy engaged: session=%s -> %s (%s)",
                                    resolved_session_key or "", _hv["model"], _hv.get("provider"))
                        override = {
                            "model": _hv["model"],
                            "provider": _hv.get("provider"),
                            "base_url": _hv.get("base_url") or None,
                            "api_key": _hk,
                            "api_mode": _hv.get("api_mode"),
                        }
            except Exception as _e:
                logger.debug("2b-mode heavy seam skipped: %s", _e)
        # --- 2b-mode heavy seam (END) ---
'''

MARK_BEGIN = "        # --- 2b-mode heavy seam (BEGIN) ---\n"
MARK_END = "        # --- 2b-mode heavy seam (END) ---\n"


def default_run_py():
    return Path.home() / ".hermes" / "hermes-agent" / "gateway" / "run.py"


def read(p): return Path(p).read_text()


def is_applied(text): return MARK_BEGIN in text


def apply(p):
    t = read(p)
    if is_applied(t):
        print("already applied (idempotent no-op)"); return 0
    if ANCHOR not in t:
        print("ANCHOR not found; gateway version differs. Aborting, no change made.")
        print("Expected line:\n" + ANCHOR); return 1
    if t.count(ANCHOR) != 1:
        print(f"ANCHOR appears {t.count(ANCHOR)} times, expected 1. Aborting."); return 1
    shutil.copy2(p, str(p) + ".2b-bak")
    Path(p).write_text(t.replace(ANCHOR, ANCHOR + BLOCK, 1))
    print(f"applied. backup: {p}.2b-bak"); return 0


def rollback(p):
    t = read(p)
    if not is_applied(t):
        print("not applied; nothing to roll back"); return 0
    start = t.index(MARK_BEGIN); end = t.index(MARK_END) + len(MARK_END)
    Path(p).write_text(t[:start] + t[end:])
    print("rolled back (seam removed)"); return 0


def status(p):
    print("applied" if is_applied(read(p)) else "not applied"); return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    cmd = args[0] if args else ""
    run_py = str(default_run_py())
    if "--run-py" in args:
        run_py = args[args.index("--run-py") + 1]
    fn = {"apply": apply, "rollback": rollback, "status": status}.get(cmd)
    if not fn:
        print(__doc__); sys.exit(2)
    sys.exit(fn(run_py))
