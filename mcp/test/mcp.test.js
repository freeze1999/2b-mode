#!/usr/bin/env node
// MCP unit test (ESM: mcp/ is "type": "module"). The served directive comes
// from the shared builder, so it carries the [2B] header and never comes back
// empty. The full stdio handshake is exercised by hand (see README); this keeps
// CI free of the SDK dependency.

import test from 'node:test';
import assert from 'node:assert/strict';

test('mcp serves the shared [2B] directive', async () => {
  const { buildDirective } = await import('../instructions.js');
  const d = buildDirective();
  assert.match(d, /^\[2B\]\n/);
  assert.ok(d.length > 50);
});
