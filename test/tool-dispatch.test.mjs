// Every tool in TOOL_DEFINITIONS must be dispatchable in BOTH runtimes.
//
// The stdio server (src/server.ts) and the Cloudflare worker (worker/index.ts)
// each keep their own switch statement but share one tool list, so adding a tool
// to the list without wiring both leaves it advertised and uncallable.
//
// Run: npm test  (requires `npm run build` first for dist/server.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { TOOL_DEFINITIONS } = await import(join(root, 'dist/server.js'));

const caseLabels = (relPath) => {
  const source = readFileSync(join(root, relPath), 'utf8');
  return new Set([...source.matchAll(/case\s+"([a-z0-9_]+)"\s*:/g)].map((m) => m[1]));
};

const toolNames = TOOL_DEFINITIONS.map((t) => t.name);

test('tool definitions are unique', () => {
  assert.equal(new Set(toolNames).size, toolNames.length);
});

for (const [label, relPath] of [
  ['stdio server', 'src/server.ts'],
  ['cloudflare worker', 'worker/index.ts'],
]) {
  test(`${label} dispatches every defined tool`, () => {
    const dispatched = caseLabels(relPath);
    const missing = toolNames.filter((name) => !dispatched.has(name));
    assert.deepEqual(missing, [], `${label} has no case for: ${missing.join(', ')}`);
  });
}

test('every tool declares a description, annotations and an input schema', () => {
  for (const tool of TOOL_DEFINITIONS) {
    assert.ok(tool.description?.length > 20, `${tool.name} needs a real description`);
    assert.ok(tool.annotations?.title, `${tool.name} needs annotations.title`);
    assert.equal(tool.inputSchema?.type, 'object', `${tool.name} needs an object inputSchema`);
    for (const required of tool.inputSchema.required ?? []) {
      assert.ok(
        tool.inputSchema.properties?.[required],
        `${tool.name} requires "${required}" but never declares it`
      );
    }
  }
});

test('google business tools all take profile_id and location_id', () => {
  const gb = TOOL_DEFINITIONS.filter((t) => t.name.startsWith('google_business_'));
  assert.equal(gb.length, 18);
  for (const tool of gb) {
    assert.ok(tool.inputSchema.required.includes('profile_id'), `${tool.name} must require profile_id`);
    assert.ok(tool.inputSchema.required.includes('location_id'), `${tool.name} must require location_id`);
  }
});
