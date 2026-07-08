#!/usr/bin/env node
// 2b-mode, host detection and hook output. Claude Code, Codex, and Copilot all
// route the same activate/command scripts but read hook output in different
// shapes; this module hides that difference and resolves the right state dir
// per host so state sits next to each host's own files.

'use strict';

const os = require('os');
const path = require('path');
const { envStateDir } = require('./2b-config');

// Host detection mirrors the env vars each host sets for its plugin scripts.
const isCopilot = Boolean(process.env.COPILOT_PLUGIN_DATA);
const isCodex = !isCopilot && Boolean(process.env.PLUGIN_DATA);

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

// State dir for the hook adapters: explicit env wins, else the host's own data
// dir, else ~/.claude. Keeps the engage flag beside the host that owns it.
function hookStateDir() {
  const forced = envStateDir();
  if (forced) return forced;
  if (isCopilot) return process.env.COPILOT_PLUGIN_DATA;
  if (isCodex) return process.env.PLUGIN_DATA;
  return claudeDir();
}

// Emit hook output in the shape the active host reads. `context` is the [2B]
// directive (or empty). `event` is the hook name.
function writeHookOutput(event, context) {
  if (isCopilot) {
    // Copilot reads additionalContext on SessionStart, ignores output elsewhere.
    // `event` is the internal name the scripts pass ('SessionStart'), not the
    // lowercase name Copilot uses in its own hooks JSON.
    process.stdout.write(JSON.stringify(
      event === 'SessionStart' && context ? { additionalContext: context } : {}));
    return;
  }
  if (isCodex) {
    const out = {};
    if (context) {
      out.hookSpecificOutput = { hookEventName: event, additionalContext: context };
    }
    process.stdout.write(JSON.stringify(out));
    return;
  }
  // Native Claude Code: SessionStart accepts raw stdout; SubagentStart needs the
  // hookSpecificOutput JSON form or the context is dropped.
  if (event === 'SubagentStart') {
    process.stdout.write(JSON.stringify(
      { hookSpecificOutput: { hookEventName: event, additionalContext: context } }));
    return;
  }
  process.stdout.write(context || '');
}

module.exports = { isCopilot, isCodex, claudeDir, hookStateDir, writeHookOutput };
