#!/usr/bin/env node
// 2b-mode, the state machine. A faithful JS port of the Python plugin's engage
// / disengage / kill / cooldown logic so every Node adapter behaves identically
// to the Hermes plugin. The clock is injectable (pass `now` seconds) so this
// tests without waiting.
//
// The six fixes live here where they are portable:
//   - engage-only 30s cooldown (a rate-limited brake is a broken brake, so
//     disengage and kill are never gated)
//   - hard kill sentinel: engage refused until the sentinel is cleared, which
//     an adapter does on session start (the CLI equivalent of a gateway restart)
//
// State is two files under stateDir: .2b_state.json and .2b_killswitch.

'use strict';

const fs = require('fs');
const path = require('path');

const ENGAGE_COOLDOWN_S = 30;

function statePath(dir) { return path.join(dir, '.2b_state.json'); }
function killPath(dir) { return path.join(dir, '.2b_killswitch'); }

function loadState(dir) {
  try {
    return JSON.parse(fs.readFileSync(statePath(dir), 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    return {};
  }
}

function saveState(dir, state) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath(dir), JSON.stringify(state));
}

function isEngaged(dir) {
  return Boolean(loadState(dir).engaged);
}

function isKilled(dir) {
  return fs.existsSync(killPath(dir));
}

function nowSeconds(now) {
  return typeof now === 'number' ? now : Date.now() / 1000;
}

// Seconds until engage is allowed again. Applies to ENGAGE only.
function cooldownRemaining(dir, now) {
  const last = loadState(dir).last_engage_toggle || 0;
  return Math.max(0, ENGAGE_COOLDOWN_S - (nowSeconds(now) - last));
}

// `heavy` is the mode name ("max" or "ultra") when a heavy-model engagement is
// active, or falsy for a plain engage. The gateway resolver reads it to apply
// the heavy model; clearing it on disengage restores the normal model with no
// capture-and-restore step.
function engage(dir, now, heavy) {
  const t = nowSeconds(now);
  if (isKilled(dir)) return '[2B] Kill switch armed. Engage disabled until session restart.';
  if (isEngaged(dir)) return '[2B] Already engaged.';
  const wait = cooldownRemaining(dir, t);
  if (wait > 0) return `[2B] Cooldown. ${Math.floor(wait) + 1}s.`;
  const s = { engaged: true, last_engage_toggle: t };
  if (heavy) s.heavy = heavy;
  saveState(dir, s);
  return heavy ? `[2B] Engaged (${heavy}).` : '[2B] Engaged.';
}

function heavyMode(dir) {
  return isEngaged(dir) && !isKilled(dir) ? (loadState(dir).heavy || null) : null;
}

// Never rate-limited, never blocked. The brake always brakes. Clearing the
// state also clears any heavy flag, so the model reverts automatically.
function disengage(dir, kill, now) {
  const t = nowSeconds(now);
  const was = isEngaged(dir);
  saveState(dir, { engaged: false, last_engage_toggle: t });
  if (kill) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(killPath(dir), '');
    return '[2B] Disengaged. Kill switch armed until session restart.';
  }
  return was ? '[2B] Disengaged.' : '[2B] Not engaged.';
}

// ── Confirm flow (type-to-confirm gate for the expensive modes) ──────────────
// max, ultra, and scan post an approval card and only fire when the user types
// the exact confirm phrase within the window. This is what stops an accidental
// /2b max from switching to a paid model and burning credits.

const CONFIRM_WINDOW_S = 60;

function setPending(dir, mode, phrase, now) {
  const s = loadState(dir);
  s.pending = { mode, phrase, expires: nowSeconds(now) + CONFIRM_WINDOW_S };
  saveState(dir, s);
}

function getPending(dir, now) {
  const p = loadState(dir).pending;
  if (!p) return null;
  if (nowSeconds(now) > p.expires) { clearPending(dir); return null; }
  return p;
}

function clearPending(dir) {
  const s = loadState(dir);
  delete s.pending;
  saveState(dir, s);
}

// Called by an adapter on session start: clears the kill sentinel, which is the
// CLI equivalent of the gateway restart that re-arms engage.
function clearKill(dir) {
  try { fs.unlinkSync(killPath(dir)); } catch (e) {}
}

module.exports = {
  ENGAGE_COOLDOWN_S, CONFIRM_WINDOW_S,
  loadState, saveState,
  isEngaged, isKilled, heavyMode,
  cooldownRemaining, engage, disengage, clearKill,
  setPending, getPending, clearPending,
  statePath, killPath,
};
