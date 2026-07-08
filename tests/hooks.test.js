#!/usr/bin/env node
// Integration tests for the Claude/Codex/Copilot hook scripts: spawn them the
// way a host does (JSON on stdin, read stdout) and assert the wire shapes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ACT = path.join(__dirname, '..', 'hooks', '2b-activate.js');
const CMD = path.join(__dirname, '..', 'hooks', '2b-command.js');

function run(script, env, stdin) {
  return execFileSync('node', [script], {
    input: stdin || '', encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function freshDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), '2b-hook-'));
  return { HERMES_2B_STATE_DIR: d, _dir: d };
}

test('SessionStart is empty when disengaged, directive when engaged', () => {
  const env = freshDir();
  assert.equal(run(ACT, env), '');
  run(CMD, env, '{"prompt":"/2b engage"}');
  assert.match(run(ACT, env), /^\[2B\]\n/);
});

test('ordinary prompt mentioning 2b is not a command', () => {
  const env = freshDir();
  assert.equal(run(CMD, env, '{"prompt":"engage the 2b booster please"}'), '');
});

test('kill blocks engage; SessionStart clears it', () => {
  const env = freshDir();
  run(CMD, env, '{"prompt":"/2b disengage kill"}');
  assert.match(run(CMD, env, '{"prompt":"/2b engage"}'), /Kill switch/);
  run(ACT, env); // clears kill (session-restart equivalent)
  assert.doesNotMatch(run(CMD, env, '{"prompt":"/2b engage"}'), /Kill switch/);
});

test('Codex wraps context in hookSpecificOutput', () => {
  const env = freshDir();
  env.PLUGIN_DATA = env.HERMES_2B_STATE_DIR;
  run(CMD, env, '{"prompt":"/2b engage"}');
  const out = JSON.parse(run(ACT, env));
  assert.ok(out.hookSpecificOutput.additionalContext.startsWith('[2B]'));
});

test('Copilot wraps context in additionalContext', () => {
  const env = freshDir();
  env.COPILOT_PLUGIN_DATA = env.HERMES_2B_STATE_DIR;
  run(CMD, env, '{"prompt":"/2b engage"}');
  const out = JSON.parse(run(ACT, env));
  assert.ok(out.additionalContext.startsWith('[2B]'));
});
