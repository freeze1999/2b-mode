#!/usr/bin/env node
// 2b-mode, UserPromptSubmit hook for Claude Code / Codex / Copilot.
//
// Reads the submitted prompt from stdin (JSON). If and only if it is an
// explicit /2b command, runs the action and emits the reply as context. There
// is no content sniffing: a prompt that merely mentions 2b is ignored (fix #1).
//
// Never hangs the session: on stdin error or after a short fallback it exits.

'use strict';

const { hookStateDir, writeHookOutput } = require('../shared/2b-runtime');
const { extractCommand, parseArgs, runAction } = require('../shared/2b-command');

let input = '';
let done = false;

function finish() {
  if (done) return;
  done = true;
  try {
    const data = JSON.parse(input.replace(/^﻿/, ''));
    const prompt = (data.prompt || '').trim();
    const args = extractCommand(prompt);
    if (args === null) {
      writeHookOutput('UserPromptSubmit', '');
      return;
    }
    const dir = hookStateDir();
    const reply = runAction(dir, parseArgs(args).action);
    // engage/disengage flip state for the NEXT SessionStart to inject; the
    // reply here confirms the toggle (and for scan/audit carries the skill
    // instruction) so the user sees an immediate effect.
    writeHookOutput('UserPromptSubmit', reply);
  } catch (e) {
    try { writeHookOutput('UserPromptSubmit', ''); } catch (_) {}
  }
}

process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', finish);
process.stdin.on('error', () => { finish(); process.exit(0); });
// Windows PowerShell hook wrappers can swallow the piped JSON so 'end' never
// fires; the unref'd timer guarantees an exit without adding latency to the
// normal path where 'end' comes first.
setTimeout(() => { finish(); process.exit(0); }, 1000).unref();
