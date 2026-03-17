import { it, expect } from 'vitest';
import { createAgentRuntime, createSemanticFacades, createDomainFacades } from '@soleri/core';
import designPack from '../packages/domain-design/src/index.js';
import componentPack from '../packages/domain-component/src/index.js';
import figmaPack from '../packages/domain-figma/src/index.js';
import codeReviewPack from '../packages/domain-code-review/src/index.js';

it('debug facade names', () => {
  const runtime = createAgentRuntime({ agentId: 'test', vaultPath: ':memory:' });
  const packs = [designPack, componentPack, figmaPack, codeReviewPack];
  console.log('\n=== PACK INFO ===');
  for (const p of packs) {
    console.log(`  ${p.name}: domains=${JSON.stringify(p.domains)}, ops=${p.ops.length}, facades=${p.facades?.length ?? 0}`);
  }
  const semantic = createSemanticFacades(runtime, 'test');
  const domain = createDomainFacades(runtime, 'test', ['design'], packs);
  const all = [...semantic, ...domain];
  console.log('\n=== ALL FACADES ===');
  for (const f of all) {
    console.log(`  ${f.name} (${f.ops.length} ops): ${f.ops.map(o => o.name).join(', ')}`);
  }
  console.log(`\nTotal: ${all.length} facades, ${all.reduce((s, f) => s + f.ops.length, 0)} ops`);
  runtime.close();
  expect(all.length).toBeGreaterThan(0);
});
