#!/usr/bin/env node
// 2b-mode setup wizard. Writes ~/.config/2b-mode/heavy.json, the model that
// /2b max and /2b ultra switch to. Interactive on a TTY; also scriptable with
// flags for a gateway or CI install.
//
//   node setup.js                        interactive
//   node setup.js --provider openrouter --model anthropic/claude-opus-4 --key-env OPENROUTER_API_KEY
//   node setup.js --show                 print the current config
//
// Providers it knows how to fill in: anthropic (direct), openrouter, and any
// OpenAI-compatible router (openai, together, fireworks, deepinfra, groq, ...).
// For anything else it records what you give and prints how the host reads it.

'use strict';

const readline = require('node:readline');
const { saveHeavy, loadHeavy, heavyPath } = require('./shared/2b-heavy');

// Known providers: the defaults that make a config valid without research.
// base_url blank means the host's provider default. api_key_env names the env
// var the running gateway/CLI already has the key in.
const PROVIDERS = {
  anthropic:  { key_env: 'ANTHROPIC_API_KEY', base_url: '', hint: 'Anthropic direct. Models: claude-opus-4-*, claude-sonnet-4-*.' },
  openrouter: { key_env: 'OPENROUTER_API_KEY', base_url: 'https://openrouter.ai/api/v1', hint: 'OpenRouter. Models are namespaced: anthropic/claude-opus-4, openai/gpt-*, etc.' },
  openai:     { key_env: 'OPENAI_API_KEY', base_url: 'https://api.openai.com/v1', hint: 'OpenAI direct.' },
  together:   { key_env: 'TOGETHER_API_KEY', base_url: 'https://api.together.xyz/v1', hint: 'Together AI (OpenAI-compatible).' },
  fireworks:  { key_env: 'FIREWORKS_API_KEY', base_url: 'https://api.fireworks.ai/inference/v1', hint: 'Fireworks (OpenAI-compatible).' },
  deepinfra:  { key_env: 'DEEPINFRA_API_KEY', base_url: 'https://api.deepinfra.com/v1/openai', hint: 'DeepInfra (OpenAI-compatible).' },
  groq:       { key_env: 'GROQ_API_KEY', base_url: 'https://api.groq.com/openai/v1', hint: 'Groq (OpenAI-compatible).' },
};

function parseFlags(argv) {
  const f = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--show') f.show = true;
    else if (a.startsWith('--')) f[a.slice(2)] = argv[++i];
  }
  return f;
}

function build(provider, model, keyEnv, baseUrl, label, reasoning) {
  const known = PROVIDERS[provider];
  return {
    provider,
    model,
    base_url: baseUrl !== undefined ? baseUrl : (known ? known.base_url : ''),
    api_key_env: keyEnv || (known ? known.key_env : ''),
    reasoning: reasoning || '',
    label: label || `${model} (${provider})`,
  };
}

function writeAndReport(cfg) {
  const p = saveHeavy(cfg);
  console.log('\nwrote ' + p);
  console.log(JSON.stringify(cfg, null, 2));
  if (!cfg.api_key_env) {
    console.log('\nNote: no api_key_env set. The host must already resolve a key for this provider,');
    console.log('or re-run with --key-env NAME so the gateway knows which env var holds the key.');
  } else {
    console.log(`\nEnsure ${cfg.api_key_env} is set in the gateway/CLI environment.`);
  }
}

async function interactive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  console.log('2b-mode heavy-model setup. This is the model /2b max and /2b ultra switch to.\n');
  console.log('Providers:');
  for (const [name, p] of Object.entries(PROVIDERS)) console.log(`  ${name.padEnd(11)} ${p.hint}`);
  console.log('  other       any provider your host supports; you supply the fields.\n');

  const provider = (await ask('provider [openrouter]: ')).trim() || 'openrouter';
  const known = PROVIDERS[provider];
  const model = (await ask('model id (e.g. anthropic/claude-opus-4): ')).trim();
  if (!model) { console.log('model is required. Nothing written.'); rl.close(); return; }
  const keyEnv = (await ask(`api key env var [${known ? known.key_env : ''}]: `)).trim() || (known ? known.key_env : '');
  const baseUrl = (await ask(`base url [${known ? known.base_url || '(provider default)' : '(provider default)'}]: `)).trim();
  const reasoning = (await ask('reasoning budget hint (low/medium/high, blank to skip): ')).trim();
  const label = (await ask('label for the approval card (blank = model name): ')).trim();
  rl.close();

  writeAndReport(build(provider, model,
    keyEnv, baseUrl === '' && known ? undefined : baseUrl, label, reasoning));
}

async function main() {
  const f = parseFlags(process.argv.slice(2));
  if (f.show) {
    const cfg = loadHeavy();
    console.log(cfg ? JSON.stringify(cfg, null, 2) : `no heavy model configured (${heavyPath()})`);
    return;
  }
  if (f.provider && f.model) {
    writeAndReport(build(f.provider, f.model, f['key-env'], f['base-url'], f.label, f.reasoning));
    return;
  }
  if (!process.stdin.isTTY) {
    console.log('Non-interactive and no --provider/--model given. See: node setup.js --help');
    console.log('Example: node setup.js --provider openrouter --model anthropic/claude-opus-4 --key-env OPENROUTER_API_KEY');
    return;
  }
  await interactive();
}

main();
