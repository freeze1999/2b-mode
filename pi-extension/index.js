// 2b-mode, pi extension.
//
// `/2b engage` arms the execution mode; while engaged, the [2B]
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
    description: '2B execution mode: engage, disengage [kill], scan, audit, diag, status',
    handler: async (args, ctx) => {
      const parsed = parseArgs(args);
      // scan/review/audit produce a skill instruction the agent should act on;
      // send it as a message. Everything else is a state toggle or a card.
      if (['scan', 'review', 'audit'].includes(parsed.action)) {
        const msg = runAction(dir, parsed);
        if (ctx?.isIdle?.() === false) {
          pi.sendUserMessage(msg, { deliverAs: 'followUp' });
        } else {
          pi.sendUserMessage(msg);
        }
        syncStatus(ctx);
        return;
      }
      const reply = runAction(dir, parsed);
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
