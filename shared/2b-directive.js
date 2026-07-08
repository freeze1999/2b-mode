#!/usr/bin/env node
// 2b-mode, the injected directive. Reads skills/2b/SKILL.md and prepends the
// "[2B]" header, which is the whole banner: short, and free of any word a
// content matcher could key on (no MODE, no ACTIVE). If the skill file is
// missing the fallback directive still ships, so a bad path never means an
// empty overlay.

'use strict';

const fs = require('fs');
const path = require('path');

const SKILL_PATH = path.join(__dirname, '..', 'skills', '2b', 'SKILL.md');

const FALLBACK =
  'You are 2B. Silent. Precise. Minimal strike: reuse before writing, stdlib ' +
  'before custom, one line before fifty, the minimum code that works. No ' +
  'filler, no flirting, conclusions only. Never simplify away trust-boundary ' +
  'validation, data-loss handling, security, or requested behavior.';

function stripFrontmatter(text) {
  return String(text || '').replace(/^---[\s\S]*?---\s*/, '');
}

function buildDirective() {
  let body;
  try {
    body = stripFrontmatter(fs.readFileSync(SKILL_PATH, 'utf8')).trim();
  } catch (e) {
    body = FALLBACK;
  }
  return `[2B]\n${body}`;
}

function skillFileExists() {
  try { return fs.existsSync(SKILL_PATH); } catch (e) { return false; }
}

module.exports = { buildDirective, skillFileExists, SKILL_PATH, FALLBACK };
