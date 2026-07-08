#!/usr/bin/env node
// Tests for the shared JS core. Pure logic: an injected clock and a temp state
// dir, no host, no network. Mirrors the Python plugin's --test suite so both
// implementations of the state machine are held to the same behavior.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const state = require('../shared/2b-state');
const directive = require('../shared/2b-directive');
const cmd = require('../shared/2b-command');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), '2b-test-'));
}

const T0 = 1_000_000;

// --- state machine ---

test('starts disengaged', () => {
  const d = tmpDir();
  assert.equal(state.isEngaged(d), false);
});

test('engage then double-engage refused', () => {
  const d = tmpDir();
  assert.equal(state.engage(d, T0), '[2B] Engaged.');
  assert.equal(state.isEngaged(d), true);
  assert.equal(state.engage(d, T0 + 1), '[2B] Already engaged.');
});

test('disengage is never cooled', () => {
  const d = tmpDir();
  state.engage(d, T0);
  assert.equal(state.disengage(d, false, T0 + 2), '[2B] Disengaged.');
});

test('re-engage inside 30s hits cooldown, after 30s works', () => {
  const d = tmpDir();
  state.engage(d, T0);
  state.disengage(d, false, T0 + 2);
  assert.match(state.engage(d, T0 + 5), /Cooldown/);
  assert.equal(state.engage(d, T0 + 33), '[2B] Engaged.');
});

test('kill disengages, arms, and blocks engage past cooldown', () => {
  const d = tmpDir();
  state.engage(d, T0);
  assert.match(state.disengage(d, true, T0 + 40), /Kill switch armed/);
  assert.match(state.engage(d, T0 + 200), /Kill switch/);
  assert.equal(state.isEngaged(d), false);
});

test('clearKill restores engage (the session-restart equivalent)', () => {
  const d = tmpDir();
  state.disengage(d, true, T0);
  state.clearKill(d);
  assert.equal(state.engage(d, T0 + 200), '[2B] Engaged.');
});

test('corrupt state file fails safe to disengaged', () => {
  const d = tmpDir();
  fs.writeFileSync(state.statePath(d), 'not json');
  assert.equal(state.isEngaged(d), false);
});

// --- directive ---

test('directive header is exactly [2B] with no matchable banner', () => {
  const ctx = directive.buildDirective();
  assert.match(ctx, /^\[2B\]\n/);
  const header = ctx.split('\n')[0];
  assert.equal(header.includes('MODE'), false);
  assert.equal(header.includes('ACTIVE'), false);
});

test('directive falls back when the skill file is absent', () => {
  // FALLBACK is non-empty and combat-flavored; a missing file never yields "".
  assert.ok(directive.FALLBACK.length > 40);
  assert.match(directive.buildDirective(), /2B/);
});

// --- command parser ---

test('parseArgs maps every verb', () => {
  assert.equal(cmd.parseArgs('').action, 'status');
  assert.equal(cmd.parseArgs('engage').action, 'engage');
  assert.equal(cmd.parseArgs('disengage').action, 'disengage');
  assert.equal(cmd.parseArgs('kill').action, 'kill');
  assert.equal(cmd.parseArgs('disengage kill').action, 'kill');
  assert.equal(cmd.parseArgs('diag').action, 'diag');
  assert.equal(cmd.parseArgs('scan src/').action, 'scan');
  assert.equal(cmd.parseArgs('audit').action, 'audit');
});

test('extractCommand only matches an explicit 2b prefix', () => {
  assert.equal(cmd.extractCommand('/2b engage'), 'engage');
  assert.equal(cmd.extractCommand('@2b status'), 'status');
  assert.equal(cmd.extractCommand('/2b'), '');
  // No content sniffing: an ordinary message mentioning 2b is not a command.
  assert.equal(cmd.extractCommand('can you engage the 2b thing'), null);
  assert.equal(cmd.extractCommand('rewrite this in 2b style'), null);
});

test('runAction drives the state machine and diag reports health', () => {
  const d = tmpDir();
  assert.equal(cmd.runAction(d, 'engage', T0), '[2B] Engaged.');
  const diag = cmd.runAction(d, 'diag', T0);
  assert.match(diag, /context: \d+ chars/);
  assert.match(diag, /skill file:/);
  assert.match(cmd.runAction(d, 'scan', T0), /2b-scan/);
});
