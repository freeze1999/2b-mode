#!/usr/bin/env node
// 2b-mode, the one command parser every adapter shares so `/2b ...` means the
// same thing on Hermes, Claude Code, opencode, pi, and MCP. Explicit only: the
// text must START with the 2b command (after an optional / @ or $ host prefix).
// Nothing is matched mid-message; that is fix #1 (no implicit triggering).

'use strict';

const state = require('./2b-state');
const heavy = require('./2b-heavy');
const { buildDirective, skillFileExists } = require('./2b-directive');

// The three expensive modes gated behind type-to-confirm. max and ultra switch
// to a paid heavy model; scan fans work out to models and bridges. All three
// can spend real money, so none fires on the first command.
const GATED = new Set(['max', 'ultra', 'scan']);

function parseArgs(rawArgs) {
  const low = String(rawArgs || '').trim().toLowerCase();
  if (low === '' || low === 'status') return { action: 'status' };
  if (low === 'engage') return { action: 'engage' };
  if (low === 'disengage' || low === 'off') return { action: 'disengage' };
  if (low === 'disengage kill' || low === 'kill') return { action: 'kill' };
  if (low === 'diag') return { action: 'diag' };
  const parts = low.split(/\s+/);
  const head = parts[0];
  if (head === 'confirm') return { action: 'confirm', arg: parts[1] || '' };
  if (head === 'max' || head === 'ultra' || head === 'scan') return { action: head };
  if (head === 'review' || head === 'audit') return { action: head };
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
    return '[2B] Killed until session restart. /2b engage | disengage [kill] | max | ultra | scan | review | audit | diag';
  }
  const hv = state.heavyMode(dir);
  const s = hv ? `engaged (${hv}: ${heavy.heavyLabel()})` : (state.isEngaged(dir) ? 'engaged' : 'standby');
  return `[2B] ${s}. /2b engage | disengage [kill] | max | ultra | scan | review | audit | diag`;
}

function diagLine(dir) {
  const parts = [statusLine(dir)];
  parts.push(`skill file: ${skillFileExists() ? 'ok' : 'MISSING, fallback directive in use'}`);
  const ctx = buildDirective();
  parts.push(`context: ${ctx.length} chars, header ${JSON.stringify(ctx.split('\n')[0])}`);
  parts.push(`heavy model: ${heavy.isConfigured() ? heavy.heavyLabel() : 'NOT configured (run the 2b-mode setup)'}`);
  return parts.join('\n');
}

// The badass approval card. ASCII only, no em-dash (house rule). Names the exact
// cost and the exact phrase to type back, so an accidental /2b max cannot spend.
function approvalCard(mode) {
  const label = heavy.isConfigured() ? heavy.heavyLabel() : 'NOT configured';
  const lines = {
    max:   ['2B // MAX', `heavy model: ${label}`, 'the whole task runs on a paid model'],
    ultra: ['2B // ULTRA', `heavy model: ${label}`, 'orchestration scan THEN the paid model on every subtask'],
    scan:  ['2B // SCAN', 'orchestration mode', 'decomposes the task and may delegate to paid models and bridges'],
  }[mode];
  return [
    '▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜',
    `  ${lines[0]}`,
    `  ${lines[1]}`,
    `  cost: ${lines[2]}`,
    '',
    `  armed. reply  /2b confirm ${mode}  within 60s`,
    '▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟',
  ].join('\n');
}

// Run a parsed action against the state dir. Returns a reply string. `now` is
// injectable for tests. `opts.fire` is called with the confirmed mode name when
// a gated mode passes confirmation, so an adapter can perform host-specific work
// (model switch, auto-run scan) beyond the shared reply.
function runAction(dir, parsed, now, opts) {
  const action = typeof parsed === 'string' ? parsed : parsed.action;
  const arg = typeof parsed === 'string' ? '' : (parsed.arg || '');
  opts = opts || {};
  switch (action) {
    case 'engage': return state.engage(dir, now);
    case 'disengage': { state.clearPending(dir); return state.disengage(dir, false, now); }
    case 'kill': { state.clearPending(dir); return state.disengage(dir, true, now); }
    case 'diag': return diagLine(dir);
    case 'review': return skillPrompt('2b-review', 'Review the current diff for over-engineering. Findings only, ranked.');
    case 'audit': return skillPrompt('2b-audit', 'Review the repository for recoverable waste. Evidence, then a ranked deletion list.');
    case 'max':
    case 'ultra':
      if (!heavy.isConfigured()) {
        return `[2B] ${action} needs a heavy model. Run the 2b-mode setup to configure one (see README).`;
      }
      state.setPending(dir, action, action, now);
      return approvalCard(action);
    case 'scan':
      state.setPending(dir, 'scan', 'scan', now);
      return approvalCard('scan');
    case 'confirm': return confirm(dir, arg, now, opts);
    case 'status':
    default: return statusLine(dir);
  }
}

function confirm(dir, arg, now, opts) {
  const p = state.getPending(dir, now);
  if (!p) return '[2B] Nothing to confirm (no armed mode, or the 60s window lapsed).';
  if (arg !== p.phrase) return `[2B] Confirm mismatch. Reply /2b confirm ${p.mode} to fire, or wait for it to lapse.`;
  state.clearPending(dir);
  if (p.mode === 'scan') {
    if (opts.fire) opts.fire('scan');
    return '[2B] scan armed. ' + skillPrompt('2b-scan', 'Orchestrate: decompose the task, route each part to the cheapest capable model, delegate where a bridge fits, then execute the approved plan.');
  }
  // max / ultra: engage 2B with the heavy flag; the gateway applies the model.
  const msg = state.engage(dir, now, p.mode);
  if (opts.fire) opts.fire(p.mode);
  if (p.mode === 'ultra') {
    return msg + '\n' + skillPrompt('2b-scan', 'Orchestrate first: decompose the task and route each part, then execute on the heavy model.');
  }
  return msg + `\nheavy model active: ${heavy.heavyLabel()}. /2b disengage restores the normal model.`;
}

function skillPrompt(skill, blurb) {
  return `Load and follow the 2b-mode skill \`${skill}\`. ${blurb}`;
}

module.exports = {
  parseArgs, extractCommand, statusLine, diagLine, runAction, skillPrompt,
  approvalCard, GATED,
};
