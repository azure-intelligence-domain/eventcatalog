// End-to-end: released contracts become the right catalog.
// Uses the templates of a contracts release as if they were three services' contracts:
// an event producer, an event consumer (both supply domain) and a REST API (sales domain).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { prepareSource } from '../scripts/discover-sources.mjs';

const CONTRACTS = 'https://raw.githubusercontent.com/azure-intelligence-domain/contracts/v1.1.0/templates';
const SERVICES = [
  { service: 'system-api-wms', kind: 'asyncapi', file: 'event-producer.asyncapi.yaml' },
  { service: 'process-api-fulfilment', kind: 'asyncapi', file: 'event-consumer.asyncapi.yaml' },
  { service: 'system-api-salesforce', kind: 'openapi', file: 'rest-api.openapi.yaml' },
];

const frontmatter = (path) => parse(readFileSync(path, 'utf8').split('---')[1]);

async function sources() {
  return Promise.all(
    SERVICES.map(async ({ service, kind, file }) => {
      const url = `${CONTRACTS}/${file}`;
      const contract = parse(await (await fetch(url)).text());
      const source = await prepareSource({ service, kind, release: 'v1.1.0', url, contract });
      return { ...source, path: source.path.startsWith('http') ? source.path : join(process.cwd(), source.path) };
    }),
  );
}

test('the domain is read from the contract', async () => {
  const domains = Object.fromEntries((await sources()).map((s) => [s.service, s.domain.id]));
  assert.deepEqual(domains, {
    'system-api-wms': 'supply',
    'process-api-fulfilment': 'supply',
    'system-api-salesforce': 'sales',
  });
});

test('producers send, consumers receive, APIs land in their domain', async () => {
  const catalog = mkdtempSync(join(tmpdir(), 'catalog-'));
  for (const item of ['eventcatalog.config.js', 'package.json', 'domains', 'teams', 'public']) {
    cpSync(item, join(catalog, item), { recursive: true });
  }
  symlinkSync(join(process.cwd(), 'node_modules'), join(catalog, 'node_modules'));
  writeFileSync(join(catalog, 'sources.json'), JSON.stringify(await sources()));

  execFileSync('npx', ['eventcatalog', 'generate'], { cwd: catalog, stdio: 'pipe' });

  const supply = join(catalog, 'domains', 'supply', 'services');
  const producer = frontmatter(join(supply, 'system-api-wms', 'index.mdx'));
  const consumer = frontmatter(join(supply, 'process-api-fulfilment', 'index.mdx'));
  assert.deepEqual(producer.sends.map((m) => m.id), ['stockReserved']);
  assert.deepEqual(producer.receives ?? [], []);
  assert.deepEqual(consumer.receives.map((m) => m.id), ['stockReserved']);
  assert.deepEqual(consumer.sends ?? [], []);
  assert.deepEqual(producer.owners, ['supply-team']);

  const message = join(supply, 'system-api-wms', 'events', 'stockReserved');
  assert.ok(existsSync(join(message, 'schema.json')), 'the producer owns the message schema');
  assert.ok(!existsSync(join(supply, 'process-api-fulfilment', 'events')), 'the consumer only refers to it');

  const api = join(catalog, 'domains', 'sales', 'services', 'system-api-salesforce');
  assert.ok(existsSync(join(api, 'index.mdx')), 'the REST API lands in the sales domain');
  const operations = readdirSync(join(api, 'queries'));
  assert.deepEqual(operations, ['retrieveOrder'], 'only real operations, no x-summary artefacts');
});
