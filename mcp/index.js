#!/usr/bin/env node
// 2b-mode MCP server: serves the [2B] combat directive over stdio as a prompt
// (user-invoked from the host's prompt menu) and a tool (for hosts that pull
// context via tool calls). This is the universal adapter, one build reaching
// any MCP-capable host: Claude Code, Codex, Cursor, Cline, and others.
//
// Note the honest boundary: an MCP server has no per-turn injection hook, so it
// cannot ENFORCE the stance every turn the way the Hermes plugin or the CLI
// hooks do. It hands the host the directive when asked; the host is trusted to
// keep following it. For enforced engage/disengage, use the native adapter.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { buildDirective } from './instructions.js';

const server = new McpServer({ name: '2b-mode', version: '1.0.0' });

server.registerPrompt(
  '2b',
  {
    title: '2B combat overlay',
    description: 'Silent, precise, minimal-strike coding: YAGNI, reuse first, stdlib before custom, the smallest correct change.',
    argsSchema: {},
  },
  () => ({
    messages: [{ role: 'user', content: { type: 'text', text: buildDirective() } }],
  }),
);

server.registerTool(
  '2b_directive',
  {
    title: '2B directive',
    description: 'Return the 2B combat coding directive to follow for this and subsequent turns.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  () => {
    const text = buildDirective();
    return { content: [{ type: 'text', text }] };
  },
);

await server.connect(new StdioServerTransport());
