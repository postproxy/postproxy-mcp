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

test('tools/list never asks for credentials or one-time codes', async () => {
  const res = await rpc('tools/list', {}, { Authorization: 'Bearer test-key' });
  const { tools } = (await res.json()).result;
  const names = tools.map((t) => t.name);
  for (const hidden of ['whatsapp_number_register', 'whatsapp_number_request_verification_code', 'whatsapp_number_verify']) {
    assert.ok(!names.includes(hidden), `${hidden} must not be listed remotely`);
  }
  const connect = tools.find((t) => t.name === 'profile_groups_initialize_connection');
  assert.deepEqual(Object.keys(connect.inputSchema.properties).sort(), ['onboarding', 'platform', 'profile_group_id']);
  assert.doesNotMatch(JSON.stringify(tools), /app_password|bot_token/);
});

test('hidden tools cannot be called remotely', async () => {
  const res = await rpc(
    'tools/call',
    { name: 'whatsapp_number_verify', arguments: { profile_id: 'p', phone_number_id: 'n', code: '123456' } },
    { Authorization: 'Bearer test-key' }
  );
  const body = await res.json();
  assert.match(JSON.stringify(body), /Unknown tool/);
});

test('bluesky and telegram connections point to the web app without calling the API', async () => {
  for (const platform of ['bluesky', 'telegram']) {
    const res = await rpc(
      'tools/call',
      { name: 'profile_groups_initialize_connection', arguments: { profile_group_id: 'g', platform, app_password: 'x', bot_token: 'y' } },
      { Authorization: 'Bearer test-key' }
    );
    const text = (await res.json()).result.content[0].text;
    const result = JSON.parse(text);
    assert.equal(result.success, false);
    assert.equal(result.url, 'https://app.postproxy.dev');
  }
});

test('initialize_connection rejects onboarding modes the platform does not take', async () => {
  for (const [platform, onboarding, expected] of [
    ['instagram', 'api', /onboarding for instagram must be 'instagram' or 'facebook'/],
    ['whatsapp', 'facebook', /onboarding for whatsapp must be 'api' or 'business_app'/],
    ['linkedin', 'facebook', /only supported for whatsapp and instagram/],
  ]) {
    const res = await rpc(
      'tools/call',
      { name: 'profile_groups_initialize_connection', arguments: { profile_group_id: 'g', platform, onboarding } },
      { Authorization: 'Bearer test-key' }
    );
    assert.match(JSON.stringify(await res.json()), expected);
  }
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

// OpenAI plugin-submission domain verification: the portal's token must be
// served verbatim from /.well-known/openai-apps-challenge on the MCP host.
test('challenge route 404s when no token is configured', async () => {
  const res = await worker.fetch('https://mcp.postproxy.dev/.well-known/openai-apps-challenge');
  assert.equal(res.status, 404);
});

test('challenge route serves the configured token as text/plain', async () => {
  const challengeWorker = await unstable_dev('worker/index.ts', {
    experimental: { disableExperimentalWarning: true },
    vars: { OPENAI_APPS_CHALLENGE: 'openai-verify-abc123' },
  });
  try {
    const res = await challengeWorker.fetch(
      'https://mcp.postproxy.dev/.well-known/openai-apps-challenge'
    );
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^text\/plain/);
    assert.equal(await res.text(), 'openai-verify-abc123');
  } finally {
    await challengeWorker.stop();
  }
});
