#!/usr/bin/env python3
"""[2B-2] Make plugin-registered slash commands bypass the active-session guard.

Before this, resolve_command() only knew built-ins, so should_bypass_active_session
returned False for a plugin command like /2b. Per the guard in
gateway/platforms/base.py, a non-bypassing command is QUEUED while the agent is
busy and "leaks into the conversation as user text" — the agent then improvises
it. Observed 2026-07-14: /2b engage leaked to Elysia as chat and she hand-edited
the state file, bypassing the plugin's type-to-confirm spend gate.

A slash command must always reach its handler, never the model.

Usage: python3 patch_bypass.py apply|rollback|status
"""
import shutil
import sys
from pathlib import Path

TARGET = Path.home() / ".hermes" / "hermes-agent" / "hermes_cli" / "commands.py"
BAK = Path(str(TARGET) + ".bak-2bbypass")

OLD = '    return resolve_command(command_name) is not None if command_name else False'

NEW = '''    # [2B-2] Plugin-registered slash commands must bypass too. They do not
    # resolve via resolve_command(), so before this they were QUEUED while the
    # agent was busy and leaked into the conversation as user text (see the
    # guard in gateway/platforms/base.py). The agent then improvised the
    # command by hand, bypassing the plugin's own gates.
    if not command_name:
        return False
    if resolve_command(command_name) is not None:
        return True
    try:
        from hermes_cli.plugins import get_plugin_command_handler
        return get_plugin_command_handler(command_name.replace("_", "-")) is not None
    except Exception:
        return False'''

MARK = "[2B-2] Plugin-registered slash commands must bypass"


def status():
    print("applied" if MARK in TARGET.read_text() else "not applied")
    return 0


def apply():
    t = TARGET.read_text()
    if MARK in t:
        print("already applied (idempotent)")
        return 0
    if t.count(OLD) != 1:
        print(f"anchor found {t.count(OLD)} times, expected 1. Aborting, no change.")
        return 1
    shutil.copy2(TARGET, BAK)
    TARGET.write_text(t.replace(OLD, NEW, 1))
    import ast
    ast.parse(TARGET.read_text())  # fail loudly rather than ship a broken core file
    print(f"applied. backup: {BAK}")
    return 0


def rollback():
    if not BAK.exists():
        print("no backup; nothing to roll back")
        return 1
    shutil.copy2(BAK, TARGET)
    print("rolled back")
    return 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    fn = {"apply": apply, "rollback": rollback, "status": status}.get(cmd)
    if not fn:
        print(__doc__)
        sys.exit(2)
    sys.exit(fn())
