#!/usr/bin/env node
// 2b-mode, the one command parser every adapter shares so `/2b ...` means the
// same thing on Hermes, Claude Code, opencode, pi, and MCP. Explicit only: the
// text must START with the 2b command (after an optional / @ or $ host prefix).
// Nothing is matched mid-message; that is fix #1 (no implicit triggering).

'use strict';

const state = require('./2b-state');
const { buildDirective, skillFileExists } = require('./2b-directive');

// Parse the raw command text (already stripped of the /2b prefix by the caller,
// OR the full "/2b engage" form) into an action. Returns null if it is not a
// 2b command at all, so an adapter can ignore ordinary prompts cheaply.
function parseArgs(rawArgs) {
  const low = String(rawArgs || '').trim().toLowerCase();
  if (low === '' || low === 'status') return { action: 'status' };
  if (low === 'engage') return { action: 'engage' };
  if (low === 'disengage' || low === 'off') return { action: 'disengage' };
  if (low === 'disengage kill' || low === 'kill') return { action: 'kill' };
  if (low === 'diag') return { action: 'diag' };
  const head = low.split(/\s+/)[0];
  if (head === 'scan' || head === 'audit') return { action: head };
  return { action: 'status' };
}

// Detect and split a full prompt like "/2b engage" or "@2b status". Returns the
// argument string if this prompt is a 2b command, else null.
function extractCommand(prompt) {
  const t = String(prompt || '').trim();
  const m = t.match(/^[/@$]?2b(?:\b|:)\s*(.*)$/i);
  return m ? m[1].trim() : null;
}

function statusLine(dir) {
  if (state.isKilled(dir)) {
    return '[2B] Killed until session restart. /2b engage | disengage [kill] | scan | audit | diag';
  }
  const s = state.isEngaged(dir) ? 'engaged' : 'standby';
  return `[2B] ${s}. /2b engage | disengage [kill] | scan | audit | diag`;
}

function diagLine(dir) {
  const parts = [statusLine(dir)];
  parts.push(`skill file: ${skillFileExists() ? 'ok' : 'MISSING, fallback directive in use'}`);
  const ctx = buildDirective();
  parts.push(`context: ${ctx.length} chars, header ${JSON.stringify(ctx.split('\n')[0])}`);
  return parts.join('\n');
}

// Run a parsed action against the state dir. Returns a reply string. `now` is
// injectable for tests.
function runAction(dir, action, now) {
  switch (action) {
    case 'engage': return state.engage(dir, now);
    case 'disengage': return state.disengage(dir, false, now);
    case 'kill': return state.disengage(dir, true, now);
    case 'diag': return diagLine(dir);
    case 'scan': return skillPrompt('2b-scan', 'Review the current diff. Findings only, ranked.');
    case 'audit': return skillPrompt('2b-audit', 'Review the repository for recoverable waste. Evidence, then a ranked deletion list.');
    case 'status':
    default: return statusLine(dir);
  }
}

function skillPrompt(skill, blurb) {
  return `Load and follow the 2b-mode skill \`${skill}\`. ${blurb}`;
}

module.exports = { parseArgs, extractCommand, statusLine, diagLine, runAction, skillPrompt };
