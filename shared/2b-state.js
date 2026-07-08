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

function engage(dir, now) {
  const t = nowSeconds(now);
  if (isKilled(dir)) return '[2B] Kill switch armed. Engage disabled until session restart.';
  if (isEngaged(dir)) return '[2B] Already engaged.';
  const wait = cooldownRemaining(dir, t);
  if (wait > 0) return `[2B] Cooldown. ${Math.floor(wait) + 1}s.`;
  saveState(dir, { engaged: true, last_engage_toggle: t });
  return '[2B] Engaged.';
}

// Never rate-limited, never blocked. The brake always brakes.
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

// Called by an adapter on session start: clears the kill sentinel, which is the
// CLI equivalent of the gateway restart that re-arms engage.
function clearKill(dir) {
  try { fs.unlinkSync(killPath(dir)); } catch (e) {}
}

module.exports = {
  ENGAGE_COOLDOWN_S,
  loadState, saveState,
  isEngaged, isKilled,
  cooldownRemaining, engage, disengage, clearKill,
  statePath, killPath,
};
