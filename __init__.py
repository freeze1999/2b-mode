"""2B Mode — battle overlay plugin for Hermes.

/2b engage swaps in a silent, precise, minimal-strike coding directive.
The directive rides pre_llm_call context injection, which Hermes appends to
the USER message (agent/turn_context.py), never the system prompt: the SOUL
and the cacheable prefix stay byte-identical.

Fixes over the ponytail lineage this forked from:
  - explicit slash command only; zero content sniffing, no
    pre_gateway_dispatch rewriting
  - per-user gate lives in the gateway hook ~/.hermes/hooks/2b-gate/
    (command handlers never see the caller, the command:2b hook does)
  - 30s engage cooldown; disengage and kill are NEVER rate-limited
    (a rate-limited brake is a broken brake)
  - no self-polluting banner: the injected header is "[2B]", nothing that
    a content matcher could feed back on
  - hard kill switch: /2b disengage kill blocks engage until gateway
    restart (the sentinel is cleared in register(), i.e. at boot)
  - state survives restarts in STATE_DIR/.2b_state.json

Self-test: python3 __init__.py --test
"""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

STATE_DIR = Path(os.environ.get("HERMES_2B_STATE_DIR",
                                str(Path.home() / ".hermes"))).expanduser()
STATE_FILE = STATE_DIR / ".2b_state.json"
KILL_FILE = STATE_DIR / ".2b_killswitch"
ENGAGE_COOLDOWN_S = 30

ROOT = Path(__file__).resolve().parent
SKILLS_DIR = ROOT / "skills"
CORE_SKILL = SKILLS_DIR / "2b" / "SKILL.md"

SKILL_COMMANDS = {
    "scan": ("2b-scan", "Review the current diff. Findings only, ranked."),
    "audit": ("2b-audit", "Sweep the repo for dead weight. Evidence, then the kill list."),
}


# ── State (pure helpers, injectable clock) ────────────────────────────────────

def _load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {}


def _save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state))


def is_engaged() -> bool:
    return bool(_load_state().get("engaged"))


def is_killed() -> bool:
    return KILL_FILE.exists()


def cooldown_remaining(now: float | None = None) -> float:
    """Seconds until engage is allowed again. Applies to ENGAGE only."""
    now = time.time() if now is None else now
    last = _load_state().get("last_engage_toggle", 0)
    return max(0.0, ENGAGE_COOLDOWN_S - (now - last))


def engage(now: float | None = None) -> str:
    now = time.time() if now is None else now
    if is_killed():
        return "[2B] Kill switch armed. Engage disabled until gateway restart."
    if is_engaged():
        return "[2B] Already engaged."
    wait = cooldown_remaining(now)
    if wait > 0:
        return f"[2B] Cooldown. {int(wait) + 1}s."
    _save_state({"engaged": True, "last_engage_toggle": now})
    return "[2B] Engaged."


def disengage(kill: bool = False, now: float | None = None) -> str:
    """Never rate-limited, never blocked. The brake always brakes."""
    now = time.time() if now is None else now
    state = _load_state()
    was = bool(state.get("engaged"))
    _save_state({"engaged": False, "last_engage_toggle": now})
    if kill:
        KILL_FILE.parent.mkdir(parents=True, exist_ok=True)
        KILL_FILE.touch()
        return "[2B] Disengaged. Kill switch armed until gateway restart."
    return "[2B] Disengaged." if was else "[2B] Not engaged."


def status_line() -> str:
    if is_killed():
        return "[2B] Killed until gateway restart. /2b engage | disengage [kill] | scan | audit"
    state = "engaged" if is_engaged() else "standby"
    return f"[2B] {state}. /2b engage | disengage [kill] | scan | audit"


# ── Context injection ─────────────────────────────────────────────────────────

def _strip_frontmatter(text: str) -> str:
    return re.sub(r"^---[\s\S]*?---\s*", "", text or "", count=1)


def build_context() -> str:
    """The injected directive. Header is '[2B]' only: short, and free of any
    phrase a content matcher could key on (no MODE, no ACTIVE)."""
    try:
        body = _strip_frontmatter(CORE_SKILL.read_text(encoding="utf-8")).strip()
    except OSError:
        body = ("You are 2B. Silent. Precise. Minimal strike: reuse before "
                "writing, stdlib before custom, one line before fifty, the "
                "minimum code that works. No filler, no flirting, "
                "conclusions only. Never simplify away trust-boundary "
                "validation, data-loss handling, security, or requested "
                "behavior.")
    return f"[2B]\n{body}"


def _pre_llm_call(**_kwargs) -> dict | None:
    if is_engaged() and not is_killed():
        return {"context": build_context()}
    return None


# ── Command ───────────────────────────────────────────────────────────────────

def _skill_prompt(command: str, args: str) -> str:
    skill, blurb = SKILL_COMMANDS[command]
    tail = f"\n\nTarget: {args.strip()}" if args.strip() else ""
    return f"Load and follow the Hermes plugin skill `2b-mode:{skill}`. {blurb}{tail}"


def _make_handler(ctx):
    def handler(raw_args: str) -> str:
        arg = (raw_args or "").strip()
        low = arg.lower()
        if low in ("", "status"):
            return status_line()
        if low == "engage":
            return engage()
        if low in ("disengage", "off"):
            return disengage()
        if low in ("disengage kill", "kill"):
            return disengage(kill=True)
        head, _, rest = arg.partition(" ")
        if head.lower() in SKILL_COMMANDS:
            prompt = _skill_prompt(head.lower(), rest)
            try:
                if ctx.inject_message(prompt):
                    return f"[2B] {head.lower()} queued."
            except Exception:
                pass
            return prompt
        return status_line()
    return handler


def register(ctx) -> None:
    # Kill switch semantics: armed until restart. This IS the restart.
    try:
        KILL_FILE.unlink(missing_ok=True)
    except Exception:
        pass

    for child in sorted(SKILLS_DIR.iterdir()) if SKILLS_DIR.exists() else []:
        skill_md = child / "SKILL.md"
        if child.is_dir() and skill_md.exists():
            ctx.register_skill(child.name, skill_md)

    ctx.register_hook("pre_llm_call", _pre_llm_call)
    ctx.register_command(
        "2b",
        _make_handler(ctx),
        description="2B battle overlay: engage, disengage [kill], scan, audit, status.",
        args_hint="[engage|disengage [kill]|scan|audit|status]",
    )

    log = getattr(ctx, "logger", None)
    if log:
        try:
            log.info("[2b-mode] registered (command + pre_llm_call + %d skills)",
                     len(list(SKILLS_DIR.iterdir())) if SKILLS_DIR.exists() else 0)
        except Exception:
            pass


# ── Self-test ─────────────────────────────────────────────────────────────────

def _self_test() -> int:
    import tempfile
    global STATE_DIR, STATE_FILE, KILL_FILE
    with tempfile.TemporaryDirectory() as td:
        STATE_DIR = Path(td)
        STATE_FILE = STATE_DIR / ".2b_state.json"
        KILL_FILE = STATE_DIR / ".2b_killswitch"
        t0 = 1_000_000.0

        checks = []

        def ok(name, cond):
            checks.append((name, bool(cond)))

        ok("starts disengaged", not is_engaged())
        ok("engage works", engage(t0) == "[2B] Engaged." and is_engaged())
        ok("double engage refused", engage(t0 + 1) == "[2B] Already engaged.")
        ok("disengage never cooled", disengage(now=t0 + 2) == "[2B] Disengaged.")
        ok("re-engage inside 30s cooled", engage(t0 + 5).startswith("[2B] Cooldown"))
        ok("re-engage after 30s works", engage(t0 + 33) == "[2B] Engaged.")
        ok("kill disengages and arms", "Kill switch armed" in disengage(kill=True, now=t0 + 40))
        ok("killed blocks engage past cooldown", "Kill switch" in engage(t0 + 100))
        ok("killed suppresses injection", _pre_llm_call() is None)
        KILL_FILE.unlink()  # what register() does at boot
        ok("restart clears kill", engage(t0 + 200) == "[2B] Engaged.")
        ctxt = build_context()
        ok("context header exact", ctxt.startswith("[2B]\n"))
        ok("context has no matchable banner", "MODE" not in ctxt and "ACTIVE" not in ctxt.split("\n")[0])
        ok("engaged injects", (_pre_llm_call() or {}).get("context", "").startswith("[2B]"))
        ok("corrupt state fails safe", (STATE_FILE.write_text("junk") or True) and not is_engaged())

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
