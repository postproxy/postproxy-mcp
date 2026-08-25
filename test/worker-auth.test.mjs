// Auth-boundary tests for the Streamable HTTP worker.
// The MCP handshake (initialize / notifications/initialized / ping) must be
// reachable without credentials; tools/list and tools/call must not be.
// Run: npm test  (spins a local wrangler dev server via unstable_dev)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unstable_dev } from 'wrangler';

let worker;

before(async () => {
  worker = await unstable_dev('worker/index.ts', {
    experimental: { disableExperimentalWarning: true },
  });
});

after(async () => {
  await worker.stop();
});

const rpc = (method, params = {}, headers = {}) =>
  worker.fetch('https://mcp.postproxy.dev/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

test('initialize succeeds without auth and declares tools-only capabilities', async () => {
  const res = await rpc('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0' },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body.result.capabilities), ['tools']);
  assert.equal(body.result.serverInfo.name, 'postproxy-mcp');
});

test('ping succeeds without auth', async () => {
  const res = await rpc('ping');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.result, {});
});

test('notifications/initialized returns 204 without auth', async () => {
  const res = await rpc('notifications/initialized');
  assert.equal(res.status, 204);
});

test('tools/list requires auth', async () => {
  const res = await rpc('tools/list');
  assert.equal(res.status, 401);
  assert.match(res.headers.get('www-authenticate') ?? '', /resource_metadata/);
});

test('tools/call requires auth', async () => {
  const res = await rpc('tools/call', { name: 'profiles_list', arguments: {} });
  assert.equal(res.status, 401);
});

test('tools/list works with a bearer key present', async () => {
  const res = await rpc('tools/list', {}, { Authorization: 'Bearer test-key' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.result.tools) && body.result.tools.length > 0);
});

test('malformed JSON still returns parse error, not 401', async () => {
  const res = await worker.fetch('https://mcp.postproxy.dev/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{nope',
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, -32700);
});

test('GET /mcp without auth still 401s', async () => {
  const res = await worker.fetch('https://mcp.postproxy.dev/mcp', { method: 'GET' });
  assert.equal(res.status, 401);
});
