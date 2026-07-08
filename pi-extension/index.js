// 2b-mode, pi extension.
//
// `/2b engage` arms the silent minimal-strike stance; while engaged, the [2B]
// directive is prepended to the system prompt every turn (before_agent_start).
// Reuses the shared JS core, so pi behaves exactly like the other adapters.

import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const state = require('../shared/2b-state.js');
const { buildDirective } = require('../shared/2b-directive.js');
const { parseArgs, runAction, statusLine } = require('../shared/2b-command.js');
const { envStateDir } = require('../shared/2b-config.js');

function stateDir() {
  return envStateDir() || path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
    'pi',
  );
}

export default function twoBExtension(pi) {
  const dir = stateDir();

  function syncStatus(ctx) {
    if (!ctx?.ui?.setStatus || !ctx.ui.theme?.fg) return;
    const theme = ctx.ui.theme;
    const engaged = state.isEngaged(dir) && !state.isKilled(dir);
    const dot = engaged ? theme.fg('accent', '●') : theme.fg('dim', '○');
    const label = state.isKilled(dir) ? 'killed' : (engaged ? 'engaged' : 'standby');
    ctx.ui.setStatus('2b', dot + ' ' + theme.fg('muted', '2B: ') + theme.fg('text', label));
  }

  pi.registerCommand('2b', {
    description: '2B battle overlay: engage, disengage [kill], scan, audit, diag, status',
    handler: async (args, ctx) => {
      const { action } = parseArgs(args);
      if (action === 'scan' || action === 'audit') {
        const msg = runAction(dir, action);
        if (ctx?.isIdle?.() === false) {
          pi.sendUserMessage(msg, { deliverAs: 'followUp' });
        } else {
          pi.sendUserMessage(msg);
        }
        return;
      }
      const reply = runAction(dir, action);
      syncStatus(ctx);
      ctx?.ui?.notify?.(reply, 'info');
    },
  });

  // A new pi session is this platform's restart: clear the kill sentinel.
  pi.on('session_start', async (_event, ctx) => {
    state.clearKill(dir);
    syncStatus(ctx);
  });

  pi.on('before_agent_start', async (event) => {
    if (!(state.isEngaged(dir) && !state.isKilled(dir))) return;
    const base = event?.systemPrompt ? `${event.systemPrompt}\n\n` : '';
    return { systemPrompt: `${base}${buildDirective()}` };
  });
}

// Exported for tests.
export { parseArgs, statusLine };
