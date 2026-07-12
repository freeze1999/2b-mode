"""2B Mode, execution-mode plugin for Hermes.

/2b engage swaps in a minimum-resource, maximum-output coding directive.
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

# Opt-in firing log: set HERMES_2B_PROBE=1 (and restart the gateway) to log
# every pre_llm_call firing. This is the diagnostic that settled the first
# real injection debug; /2b diag reads it back.
PROBE = os.environ.get("HERMES_2B_PROBE", "").strip().lower() in ("1", "true", "yes")
PROBE_LOG = STATE_DIR / ".2b_probe.log"

ENGAGE_COOLDOWN_S = 30
CONFIRM_WINDOW_S = 60

# Heavy-model config (shared with the gateway resolver patch). Deployment-set,
# never hardcoded. See ~/.config/2b-mode/heavy.json and the setup wizard.
def _config_dir() -> Path:
    xdg = os.environ.get("XDG_CONFIG_HOME")
    return Path(xdg) / "2b-mode" if xdg else Path.home() / ".config" / "2b-mode"

HEAVY_FILE = Path(os.environ.get("HERMES_2B_HEAVY_FILE", str(_config_dir() / "heavy.json")))


def load_heavy() -> dict | None:
    try:
        cfg = json.loads(HEAVY_FILE.read_text())
        if isinstance(cfg, dict) and cfg.get("model"):
            return cfg
    except Exception:
        pass
    return None


def heavy_configured() -> bool:
    return load_heavy() is not None


def heavy_label() -> str:
    c = load_heavy()
    if not c:
        return "NOT configured (run the 2b-mode setup)"
    return c.get("label") or f"{c.get('model')} ({c.get('provider', '')})".strip(" ()")


# review = the ungated diff-review skill; audit = ungated repo review. scan is
# the GATED orchestration mode, handled separately.
SKILL_COMMANDS = {
    "review": ("2b-review", "Review the current diff for over-engineering. Findings only, ranked."),
    "audit": ("2b-audit", "Review the repository for recoverable waste. Evidence, then a ranked deletion list."),
}
GATED = ("max", "ultra", "scan")


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


def engage(now: float | None = None, heavy: str | None = None) -> str:
    now = time.time() if now is None else now
    if is_killed():
        return "[2B] Kill switch armed. Engage disabled until gateway restart."
    if is_engaged():
        return "[2B] Already engaged."
    wait = cooldown_remaining(now)
    if wait > 0:
        return f"[2B] Cooldown. {int(wait) + 1}s."
    s = {"engaged": True, "last_engage_toggle": now}
    if heavy:
        s["heavy"] = heavy
    _save_state(s)
    return f"[2B] Engaged ({heavy})." if heavy else "[2B] Engaged."


def heavy_mode() -> str | None:
    """The active heavy mode (max/ultra), read by the gateway resolver to pick
    the heavy model. None when not heavy-engaged, so the model reverts."""
    if is_engaged() and not is_killed():
        return _load_state().get("heavy") or None
    return None


def disengage(kill: bool = False, now: float | None = None) -> str:
    """Never rate-limited, never blocked. The brake always brakes. Clearing the
    state also clears the heavy flag, so the model reverts automatically."""
    now = time.time() if now is None else now
    state = _load_state()
    was = bool(state.get("engaged"))
    _save_state({"engaged": False, "last_engage_toggle": now})
    if kill:
        KILL_FILE.parent.mkdir(parents=True, exist_ok=True)
        KILL_FILE.touch()
        return "[2B] Disengaged. Kill switch armed until gateway restart."
    return "[2B] Disengaged." if was else "[2B] Not engaged."


# ── Confirm flow (type-to-confirm gate for max / ultra / scan) ────────────────

def set_pending(mode: str, phrase: str, now: float | None = None) -> None:
    now = time.time() if now is None else now
    s = _load_state()
    s["pending"] = {"mode": mode, "phrase": phrase, "expires": now + CONFIRM_WINDOW_S}
    _save_state(s)


def get_pending(now: float | None = None) -> dict | None:
    now = time.time() if now is None else now
    p = _load_state().get("pending")
    if not p:
        return None
    if now > p.get("expires", 0):
        clear_pending()
        return None
    return p


def clear_pending() -> None:
    s = _load_state()
    s.pop("pending", None)
    _save_state(s)


def approval_card(mode: str) -> str:
    label = heavy_label()
    lines = {
        "max": ("2B // MAX", f"heavy model: {label}", "the whole task runs on a paid model"),
        "ultra": ("2B // ULTRA", f"heavy model: {label}", "orchestration scan THEN the paid model on every subtask"),
        "scan": ("2B // SCAN", "orchestration mode", "decomposes the task and may delegate to paid models and bridges"),
    }[mode]
    return "\n".join([
        "▛" + "▀" * 31 + "▜",
        f"  {lines[0]}",
        f"  {lines[1]}",
        f"  cost: {lines[2]}",
        "",
        f"  armed. reply  /2b confirm {mode}  within 60s",
        "▙" + "▄" * 31 + "▟",
    ])


_USAGE = "/2b engage | disengage [kill] | max | ultra | scan | review | audit | diag"


def status_line() -> str:
    if is_killed():
        return f"[2B] Killed until gateway restart. {_USAGE}"
    hv = heavy_mode()
    if hv:
        state = f"engaged ({hv}: {heavy_label()})"
    else:
        state = "engaged" if is_engaged() else "standby"
    return f"[2B] {state}. {_USAGE}"


# ── Context injection ─────────────────────────────────────────────────────────

def _strip_frontmatter(text: str) -> str:
    return re.sub(r"^---[\s\S]*?---\s*", "", text or "", count=1)


def build_context() -> str:
    """The injected directive. Header is '[2B]' only: short, and free of any
    phrase a content matcher could key on (no MODE, no ACTIVE)."""
    try:
        body = _strip_frontmatter(CORE_SKILL.read_text(encoding="utf-8")).strip()
    except OSError:
        body = ("Minimum-resource, maximum-output execution mode. Inventory "
                "first: existing code, git history, installed dependencies, "
                "stdlib, platform. Write the fewest correct lines in the "
                "right place; verify by running before reporting done; "
                "conclusions only, no filler. Never simplify away "
                "trust-boundary validation, data-loss handling, security, "
                "or requested behavior.")
    return f"[2B]\n{body}"


def _probe_mark() -> None:
    if not PROBE:
        return
    try:
        if PROBE_LOG.exists() and PROBE_LOG.stat().st_size > 1_000_000:
            PROBE_LOG.unlink()
        with open(PROBE_LOG, "a") as f:
            f.write("%f fired engaged=%s killed=%s\n" % (
                time.time(), is_engaged(), is_killed()))
    except Exception:
        pass


def _pre_llm_call(**_kwargs) -> dict | None:
    _probe_mark()
    if is_engaged() and not is_killed():
        return {"context": build_context()}
    return None


def diag() -> str:
    """One reply that answers 'is the injection pipeline healthy'."""
    parts = [status_line()]
    parts.append(f"skill file: {'ok' if CORE_SKILL.exists() else 'MISSING, fallback directive in use'}")
    ctx = build_context()
    parts.append(f"context: {len(ctx)} chars, header {ctx.splitlines()[0]!r}")
    parts.append(f"heavy model: {heavy_label()}")
    if PROBE:
        n = len(PROBE_LOG.read_text().splitlines()) if PROBE_LOG.exists() else 0
        parts.append(f"probe: on, {n} firings logged")
    else:
        parts.append("probe: off (HERMES_2B_PROBE=1 + gateway restart to log firings)")
    return "\n".join(parts)


# ── Command ───────────────────────────────────────────────────────────────────

_SKILL_BLURBS = dict(SKILL_COMMANDS)
_SKILL_BLURBS["scan"] = ("2b-scan",
    "Orchestrate: decompose the task, route each part to the cheapest capable "
    "model, delegate where a bridge fits, then execute the approved plan.")


def _skill_prompt(command: str, args: str) -> str:
    skill, blurb = _SKILL_BLURBS[command]
    tail = f"\n\nTarget: {args.strip()}" if args.strip() else ""
    return f"Load and follow the Hermes plugin skill `2b-mode:{skill}`. {blurb}{tail}"


def _queue_or_return(ctx, prompt: str, label: str) -> str:
    try:
        if ctx.inject_message(prompt):
            return f"[2B] {label} queued."
    except Exception:
        pass
    return prompt


def _confirm(ctx, arg: str) -> str:
    p = get_pending()
    if not p:
        return "[2B] Nothing to confirm (no armed mode, or the 60s window lapsed)."
    if arg.strip().lower() != p["phrase"]:
        return f"[2B] Confirm mismatch. Reply /2b confirm {p['mode']} to fire, or wait for it to lapse."
    clear_pending()
    mode = p["mode"]
    if mode == "scan":
        return "[2B] scan armed. " + _queue_or_return(
            ctx, _skill_prompt("scan", ""), "scan")
    msg = engage(heavy=mode)  # max / ultra: gateway resolver applies the model
    if mode == "ultra":
        return msg + "\n" + _queue_or_return(ctx, _skill_prompt("scan", ""), "ultra scan")
    return msg + f"\nheavy model active: {heavy_label()}. /2b disengage restores the normal model."


def _make_handler(ctx):
    def handler(raw_args: str) -> str:
        arg = (raw_args or "").strip()
        low = arg.lower()
        if low in ("", "status"):
            return status_line()
        if low == "engage":
            return engage()
        if low in ("disengage", "off"):
            clear_pending()
            return disengage()
        if low in ("disengage kill", "kill"):
            clear_pending()
            return disengage(kill=True)
        if low == "diag":
            return diag()
        head, _, rest = arg.partition(" ")
        head = head.lower()
        if head == "confirm":
            return _confirm(ctx, rest)
        if head in ("max", "ultra"):
            if not heavy_configured():
                return f"[2B] {head} needs a heavy model. Run the 2b-mode setup to configure one (see README)."
            set_pending(head, head)
            return approval_card(head)
        if head == "scan":
            set_pending("scan", "scan")
            return approval_card("scan")
        if head in SKILL_COMMANDS:
            return _queue_or_return(ctx, _skill_prompt(head, rest), head)
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
        description="2B execution mode: engage, disengage [kill], max, ultra, scan, review, audit, diag.",
        args_hint="[engage|disengage [kill]|max|ultra|scan|review|audit|diag|confirm <mode>]",
    )

    log = getattr(ctx, "logger", None)
    if log:
        try:
            log.info("[2b-mode] registered (command + pre_llm_call + %d skills)",
                     len(list(SKILLS_DIR.iterdir())) if SKILLS_DIR.exists() else 0)
        except Exception:
            pass


# ── Self-test ─────────────────────────────────────────────────────────────────

class _FakeCtx:
    def inject_message(self, _prompt):
        return False


def _self_test() -> int:
    import tempfile
    global STATE_DIR, STATE_FILE, KILL_FILE, HEAVY_FILE
    with tempfile.TemporaryDirectory() as td:
        STATE_DIR = Path(td)
        STATE_FILE = STATE_DIR / ".2b_state.json"
        KILL_FILE = STATE_DIR / ".2b_killswitch"
        HEAVY_FILE = STATE_DIR / "heavy.json"
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
        d = diag()
        ok("diag reports context size and header", "context:" in d and "'[2B]'" in d)
        ok("diag reports skill file ok", "skill file: ok" in d)
        global PROBE, PROBE_LOG
        PROBE_LOG = STATE_DIR / "probe.log"
        PROBE = False
        _probe_mark()
        ok("probe off writes nothing", not PROBE_LOG.exists())
        PROBE = True
        _probe_mark()
        ok("probe on logs a firing", PROBE_LOG.exists() and "fired" in PROBE_LOG.read_text())
        PROBE = False

        # ── heavy-mode + confirm flow ──
        _save_state({})  # reset to standby
        ctx = _FakeCtx()
        h = _make_handler(ctx)
        ok("max without heavy config refuses", "needs a heavy model" in h("max"))
        ok("no pending after refused max", get_pending(t0) is None)
        HEAVY_FILE.write_text(json.dumps({"provider": "openrouter", "model": "x/y", "label": "Test Heavy"}))
        card = h("max")
        ok("max arms a card", "2B // MAX" in card and "confirm max" in card)
        ok("max does not engage yet", not is_engaged())
        ok("confirm mismatch does not fire", "mismatch" in h("confirm ultra") and not is_engaged())
        ok("confirm max engages heavy", "Engaged (max)" in h("confirm max") and heavy_mode() == "max")
        ok("disengage clears heavy", (disengage(now=t0 + 500) or True) and heavy_mode() is None)
        # window lapse
        _save_state({})
        set_pending("max", "max", now=t0)
        ok("expired confirm does not fire", "Nothing to confirm" in _confirm(ctx, "max") if get_pending(t0 + 61) is None else False)
        # scan is gated and returns orchestration skill on confirm
        _save_state({})
        ok("scan arms a card", "2B // SCAN" in h("scan"))
        ok("scan confirm returns orchestration", "2b-scan" in h("confirm scan"))
        # review/audit ungated
        _save_state({})
        ok("review ungated", "2b-review" in h("review") and get_pending() is None)

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
