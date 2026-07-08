#!/usr/bin/env node
// 2b-mode, SessionStart hook for Claude Code / Codex / Copilot.
//
// Two jobs, both best-effort (a hook must never block or crash a session):
//   1. Clear the kill sentinel. A new session is this platform's equivalent of
//      the gateway restart that re-arms engage, so kill means "until the next
//      session", exactly as on Hermes it means "until the next gateway boot".
//   2. If 2b is engaged, emit the [2B] directive as session context. If it is
//      not engaged, emit nothing: off by default, explicit engage only.

'use strict';

const { hookStateDir, writeHookOutput } = require('../shared/2b-runtime');
const { clearKill, isEngaged, isKilled } = require('../shared/2b-state');
const { buildDirective } = require('../shared/2b-directive');

try {
  const dir = hookStateDir();
  clearKill(dir);
  const context = (isEngaged(dir) && !isKilled(dir)) ? buildDirective() : '';
  writeHookOutput('SessionStart', context);
} catch (e) {
  // Silent: stdout closed / EPIPE at hook exit must not surface as a failure.
  try { writeHookOutput('SessionStart', ''); } catch (_) {}
}
