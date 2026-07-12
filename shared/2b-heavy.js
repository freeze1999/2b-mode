#!/usr/bin/env node
// 2b-mode, heavy-model config. `/2b max` and `/2b ultra` switch to a stronger
// model for the duration of the engagement. Which model is deployment-specific
// and lives in ~/.config/2b-mode/heavy.json (written by the setup wizard), so
// no model id is hardcoded and the same plugin runs against Anthropic direct,
// OpenRouter, or any router.
//
// Schema:
//   {
//     "provider": "openrouter",              // provider key the host understands
//     "model": "anthropic/claude-opus-4",    // model id for that provider
//     "base_url": "",                         // optional, blank = provider default
//     "api_key_env": "OPENROUTER_API_KEY",    // env var holding the key
//     "reasoning": "high",                    // optional reasoning-budget hint
//     "label": "Opus via OpenRouter"          // shown on the approval card
//   }

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function configDir() {
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, '2b-mode');
  return path.join(os.homedir(), '.config', '2b-mode');
}

function heavyPath() {
  return process.env.HERMES_2B_HEAVY_FILE || path.join(configDir(), 'heavy.json');
}

// Returns the parsed config, or null if not set up. Never throws.
function loadHeavy() {
  try {
    const cfg = JSON.parse(fs.readFileSync(heavyPath(), 'utf8').replace(/^﻿/, ''));
    if (cfg && typeof cfg === 'object' && cfg.model) return cfg;
  } catch (e) { /* not configured */ }
  return null;
}

function isConfigured() {
  return loadHeavy() !== null;
}

// Human label for the approval card. Falls back to provider/model.
function heavyLabel() {
  const c = loadHeavy();
  if (!c) return 'unconfigured';
  return c.label || `${c.model}${c.provider ? ` (${c.provider})` : ''}`;
}

function saveHeavy(cfg) {
  const p = heavyPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
  return p;
}

module.exports = { configDir, heavyPath, loadHeavy, isConfigured, heavyLabel, saveHeavy };
