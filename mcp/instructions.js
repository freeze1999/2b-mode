// 2b-mode MCP, the served directive. Reuses the shared directive builder so the
// MCP server, the CLI hooks, and the Hermes plugin all read one source of truth
// (skills/2b/SKILL.md), with the same [2B] header and the same fallback.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildDirective } = require('../shared/2b-directive.js');

export { buildDirective };
