// The data stores are read from the Bicep that deploys them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { platformStores, sourceSystemStores, storeMdx } from '../scripts/discover-data-stores.mjs';

const BACKEND_MAIN = `
param location string = 'belgiumcentral'
resource salesforceApi 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: 'id-intplat-system-api-salesforce-runtime'
}
var systems = [
  { name: 'sap', api: 'system-api-sap', containers: ['VBAK', 'VBRK'] }
  { name: '3pl', api: 'system-api-3pl', containers: ['Consignment'] }
]`;

const SALESFORCE = `
resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  name: 'salesforce'
}
resource orders 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  name: 'Order'
}
resource referenceData 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = [
  for name in ['Account', 'Product2']: {
    name: name
  }
]`;

test('one database per source system, written by its System API', () => {
  const stores = sourceSystemStores(BACKEND_MAIN, SALESFORCE);
  assert.deepEqual(stores.map((s) => [s.id, s.writers[0], s.owners[0]]), [
    ['cosmos-intplat-salesforce', 'system-api-salesforce', 'sales-team'],
    ['cosmos-intplat-sap', 'system-api-sap', 'finance-team'],
    ['cosmos-intplat-3pl', 'system-api-3pl', 'logistics-team'],
  ]);
  assert.ok(stores[0].body[0].includes('`Order`, `Account`, `Product2`'));
  assert.equal(stores[1].residency, 'Belgium Central');
});

test('the platform keeps its logs and its dead letters', () => {
  const monitoring = "param dailyCapGb string = '0.15'\nresource law 'x' = {\n  name: 'log-intplat-demo'\n  properties: {\n    retentionInDays: 30\n  }\n}";
  const tap = "resource tap 'x' = {\n  name: 'sttapintplatdemo'\n}\nresource dl 'x' = {\n  name: 'deadletters'\n}";
  const [logs, deadLetters] = platformStores(monitoring, tap, "param location string = 'belgiumcentral'");
  assert.equal(logs.id, 'log-intplat-demo');
  assert.equal(logs.retention, '30 days');
  assert.ok(logs.summary.includes('0.15 GB'));
  assert.equal(deadLetters.id, 'sttapintplatdemo-deadletters');
  assert.equal(deadLetters.container_type, 'objectStore');
});

test('a Bicep change that hides a store fails loudly', () => {
  assert.throws(() => platformStores('', '', ''), /not found/);
});

test('a data store page is valid frontmatter with the Azure icon', () => {
  const [store] = sourceSystemStores(BACKEND_MAIN, SALESFORCE);
  const data = parse(storeMdx(store).split(/^---$/m)[1]);
  assert.equal(data.id, 'cosmos-intplat-salesforce');
  assert.equal(data.container_type, 'database');
  assert.equal(data.styles.icon, '/icons/azure/10121-icon-service-Azure-Cosmos-DB.svg');
  assert.equal(data.writers, undefined, 'who writes is on the service, not the store');
});
