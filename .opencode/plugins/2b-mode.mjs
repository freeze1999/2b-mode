// 2b-mode, opencode plugin.
//
// While engaged, appends the [2B] directive to the system prompt every turn.
// `/2b engage|disengage|...` toggles the state the transform reads. Reuses the
// shared JS core so opencode behaves exactly like the Claude and Hermes
// adapters. opencode loads this as a server plugin, see opencode.json.

import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const state = require('../../shared/2b-state');
const { buildDirective } = require('../../shared/2b-directive');
const { parseArgs, runAction, extractCommand } = require('../../shared/2b-command');
const { envStateDir } = require('../../shared/2b-config');

// opencode has no flag-file convention of its own; keep 2b state beside its config.
function stateDir() {
  return envStateDir() || path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
    'opencode',
  );
}

export default async ({ client } = {}) => {
  const log = (level, message) => {
    try { client?.app?.log({ body: { service: '2b-mode', level, message } }); } catch (e) {}
  };

  // A new opencode server run is this platform's "restart": clear the kill
  // sentinel so engage is armable again, matching the gateway/session semantics.
  try { state.clearKill(stateDir()); } catch (e) {}

  return {
    // Append the [2B] directive to the system prompt every turn, only while engaged.
    'experimental.chat.system.transform': async (_input, output) => {
      const dir = stateDir();
      if (state.isEngaged(dir) && !state.isKilled(dir)) {
        output.system.push(buildDirective());
      }
    },

    // Toggle 2b from the slash command. State applies from the next message, the
    // transform reads what this writes.
    'command.execute.before': async (input) => {
      if (!input || input.command !== '2b') return;
      const args = (input.arguments || '').trim();
      const reply = runAction(stateDir(), parseArgs(args).action);
      log('info', reply.split('\n')[0]);
    },
  };
};

// Exported for tests: prove the command routing without booting opencode.
export { extractCommand, parseArgs };
