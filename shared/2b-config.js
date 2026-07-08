#!/usr/bin/env node
// 2b-mode, shared configuration resolver.
//
// State dir resolution (all platforms), with per-adapter overrides layered on
// top by the runtime module:
//   1. HERMES_2B_STATE_DIR env var
//   2. platform default (see 2b-runtime.js)
//
// The state dir holds .2b_state.json (engage state + cooldown timestamp) and
// .2b_killswitch (the kill sentinel). Keep this file dependency-free: every
// adapter requires it, and adding a dep here adds it everywhere.

'use strict';

const os = require('os');
const path = require('path');

// Explicit slash commands 2b understands. No content sniffing anywhere: a
// message only acts if it STARTS with one of these (after the / @ or $ prefix
// some hosts use). "disengage kill" is matched as a two-word form.
const COMMAND = '2b';

function envStateDir() {
  const v = (process.env.HERMES_2B_STATE_DIR || '').trim();
  return v || null;
}

// A default that works with no config: the user's home under .2b-mode. Adapters
// that have a natural home (Claude ~/.claude, opencode config dir) override this
// via the runtime module so state sits next to the host's own files.
function defaultStateDir() {
  return envStateDir() || path.join(os.homedir(), '.2b-mode');
}

// Probe logging is opt-in and off by default. HERMES_2B_PROBE=1 turns it on.
function probeEnabled() {
  const v = (process.env.HERMES_2B_PROBE || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

module.exports = { COMMAND, envStateDir, defaultStateDir, probeEnabled };
