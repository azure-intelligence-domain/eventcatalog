// Discover the data stores, from the Bicep that deploys them (no list to keep up to date):
//
// 1. backend-systems (main): every simulated source system's Cosmos DB account, with its
//    containers in the system's own naming, written only by its System API (ADR 0007).
// 2. integration-platform (latest release): the Log Analytics workspace, and the blob container
//    where Event Grid keeps the events it could not deliver (dead letters).
//
// Writes containers/<id>/index.mdx (EventCatalog data stores) and data-stores.json: per service,
// the data stores it writes to (read by scripts/annotate-services.mjs).

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';

const ORG = process.env.CATALOG_ORG ?? 'azure-intelligence-domain';
const RAW = 'https://raw.githubusercontent.com';
const API = 'https://api.github.com';
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'eventcatalog-discovery' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const REGIONS = { belgiumcentral: 'Belgium Central', francecentral: 'France Central' };

// The domain and the readable name of each simulated source system (backend-systems/README.md).
export const SOURCE_SYSTEMS = {
  salesforce: { name: 'Salesforce', domain: 'sales', role: 'system of record for orders, customers and products' },
  sap: { name: 'SAP', domain: 'finance', role: 'sales orders, invoices, credit notes and payments' },
  wms: { name: 'Warehouse (WMS)', domain: 'supply', role: 'stock and reservations' },
  '3pl': { name: '3PL partner', domain: 'logistics', role: 'shipment bookings (consignments)' },
};

const must = (value, what) => {
  if (value === undefined || value === null || value.length === 0) throw new Error(`Bicep: ${what} not found`);
  return value;
};

// backend-systems/infra/main.bicep and modules/salesforce.bicep → one data store per source system.
export function sourceSystemStores(main, salesforce) {
  const region = REGIONS[/param location string = '([a-z]+)'/.exec(main)?.[1]];
  const stores = [];
  const salesforceApi = must(/name: 'id-intplat-(system-api-salesforce)-runtime'/.exec(main)?.[1], 'the Salesforce System API');
  const salesforceContainers = [
    ...[...salesforce.matchAll(/^  name: '([A-Za-z0-9]+)'$/gm)].map((m) => m[1]).filter((n) => n !== 'salesforce'),
    ...(/for name in \[([^\]]+)\]/.exec(salesforce)?.[1].match(/'([^']+)'/g) ?? []).map((n) => n.slice(1, -1)),
  ];
  stores.push({ system: 'salesforce', api: salesforceApi, containers: must(salesforceContainers, 'Salesforce containers'), region });
  for (const m of main.matchAll(/\{ name: '([a-z0-9]+)', api: '([a-z0-9-]+)', containers: \[([^\]]*)\] \}/g)) {
    stores.push({ system: m[1], api: m[2], containers: m[3].match(/'([^']+)'/g).map((n) => n.slice(1, -1)), region });
  }
  must(stores.length > 1 ? stores : [], 'the source systems');
  return stores.map(({ system, api, containers, region }) => {
    const known = must(SOURCE_SYSTEMS[system], `the source system ${system} in SOURCE_SYSTEMS`);
    return {
      id: `cosmos-intplat-${system}`,
      name: `${known.name} database`,
      summary: `${known.name} (simulated): ${known.role}. Cosmos DB serverless, in ${known.name}'s own naming; only its System API reads and writes it (ADR 0007).`,
      container_type: 'database',
      technology: 'Azure Cosmos DB (NoSQL, serverless)',
      authoritative: true,
      access_mode: 'readWrite',
      classification: 'internal',
      residency: region,
      owners: [`${known.domain}-team`],
      icon: 'cosmos',
      writers: [api],
      body: [
        `The simulated ${known.name} keeps its data in Cosmos DB account \`cosmos-intplat-${system}\`, database \`${system}\`, containers ${containers.map((c) => `\`${c}\``).join(', ')}.`,
        '',
        `Its data model, in ${known.name}'s own naming: [backend-systems/${system}](https://github.com/${ORG}/backend-systems/tree/main/${system}).`,
        'Key authentication is disabled: only the System API\'s runtime identity has a data role.',
      ],
    };
  });
}

// integration-platform/infra/modules/monitoring.bicep and tap.bicep → the platform's own stores.
export function platformStores(monitoring, tap, main) {
  const region = REGIONS[/param location string = '([a-z]+)'/.exec(main)?.[1]];
  const workspace = must(/name: '(log-[a-z0-9-]+)'/.exec(monitoring)?.[1], 'the Log Analytics workspace');
  const retention = must(/retentionInDays: (\d+)/.exec(monitoring)?.[1], 'the log retention');
  const cap = must(/param dailyCapGb string = '([\d.]+)'/.exec(monitoring)?.[1], 'the daily cap');
  const account = must(/name: '(st[a-z0-9]+)'/.exec(tap)?.[1], 'the tap storage account');
  const deadLetters = must(/name: '(deadletters)'/.exec(tap)?.[1], 'the dead-letter container');
  return [
    {
      id: workspace,
      name: 'Log Analytics',
      summary: `Every gateway call, trace and log of the platform (Application Insights is workspace-based). Daily cap ${cap} GB, kept ${retention} days.`,
      container_type: 'other',
      technology: 'Azure Monitor Log Analytics',
      access_mode: 'appendOnly',
      classification: 'internal',
      residency: region,
      retention: `${retention} days`,
      owners: ['platform-team'],
      icon: 'loganalytics',
      writers: ['integration-platform'],
      body: [
        `Workspace \`${workspace}\`. The daily cap of ${cap} GB is a cost guardrail: never removed or raised without an ADR.`,
        'Application Insights writes here, so one query follows a journey across every hop (one trace per journey).',
      ],
    },
    {
      id: `${account}-${deadLetters}`,
      name: 'Dead letters',
      summary: 'Events a consumer could not handle after Event Grid\'s retries (ADR 0016), per topic and consumer: kept as blobs, so nothing is lost and they can be replayed.',
      container_type: 'objectStore',
      technology: 'Azure Blob Storage',
      access_mode: 'appendOnly',
      classification: 'internal',
      residency: region,
      owners: ['platform-team'],
      icon: 'storage',
      writers: ['integration-platform'],
      body: [
        `Blob container \`${deadLetters}\` in storage account \`${account}\`.`,
        'Every intake and tap subscription of the platform dead-letters here.',
      ],
    },
  ];
}

export const STORE_ICONS = {
  cosmos: '10121-icon-service-Azure-Cosmos-DB.svg',
  loganalytics: '00009-icon-service-Log-Analytics-Workspaces.svg',
  storage: '10086-icon-service-Storage-Accounts.svg',
};

export function storeMdx(store) {
  const { body, writers, icon, ...fields } = store;
  const data = Object.fromEntries(Object.entries({ ...fields, version: '1.0.0' }).filter(([, v]) => v !== undefined));
  data.styles = { icon: `/icons/azure/${STORE_ICONS[icon]}` };
  const front = { id: data.id, name: data.name, version: data.version, ...data };
  return `---\n${stringify(front)}---\n\n## Overview\n\n${body.join('\n')}\n\n## Who reads and writes it\n\n<NodeGraph />\n`;
}

async function raw(repo, ref, file) {
  const response = await fetch(`${RAW}/${ORG}/${repo}/${ref}/${file}`);
  if (!response.ok) throw new Error(`${repo}@${ref}/${file}: ${response.status}`);
  return response.text();
}

async function latestRelease(repo) {
  const response = await fetch(`${API}/repos/${ORG}/${repo}/releases/latest`, { headers });
  if (!response.ok) throw new Error(`${repo}: no release (${response.status})`);
  return (await response.json()).tag_name;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const platform = await latestRelease('integration-platform');
  const stores = [
    ...sourceSystemStores(
      await raw('backend-systems', 'main', 'infra/main.bicep'),
      await raw('backend-systems', 'main', 'infra/modules/salesforce.bicep'),
    ),
    ...platformStores(
      await raw('integration-platform', platform, 'infra/modules/monitoring.bicep'),
      await raw('integration-platform', platform, 'infra/modules/tap.bicep'),
      await raw('integration-platform', platform, 'infra/main.bicep'),
    ),
  ];
  const writesTo = {};
  for (const store of stores) {
    await mkdir(join('containers', store.id), { recursive: true });
    await writeFile(join('containers', store.id, 'index.mdx'), storeMdx(store));
    for (const service of store.writers) (writesTo[service] ??= []).push(store.id);
    console.log(`+ data store ${store.id} (${store.technology}), written by ${store.writers.join(', ')}`);
  }
  await writeFile('data-stores.json', `${JSON.stringify({ writesTo }, null, 2)}\n`);
}
