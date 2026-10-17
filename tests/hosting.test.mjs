// How a service runs is read from its Bicep, and lands on its generated page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { hostingOf } from '../scripts/discover-sources.mjs';
import { annotate } from '../scripts/annotate-services.mjs';

const FUNCTION_APP = `
param location string = 'francecentral'
resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
}
resource app 'Microsoft.Web/sites@2024-04-01' = {
  properties: {
    functionAppConfig: {
      runtime: {
        name: 'python'
        version: '3.12'
      }
    }
  }
}`;

const LOGIC_APP = `
param location string = 'belgiumcentral'
resource flow 'Microsoft.Logic/workflows@2019-05-01' = {}`;

test('a Function App is Azure Functions, with its plan, language and region', () => {
  assert.deepEqual(hostingOf(FUNCTION_APP), {
    type: 'functions',
    name: 'Azure Functions',
    plan: 'Flex Consumption',
    language: 'Python 3.12',
    region: 'France Central',
  });
});

test('a workflow is a Logic App', () => {
  const hosting = hostingOf(LOGIC_APP);
  assert.equal(hosting.name, 'Logic App');
  assert.equal(hosting.plan, 'Consumption');
  assert.equal(hosting.region, 'Belgium Central');
});

test('no compute: the gateway serves the contract', () => {
  assert.equal(hostingOf('').type, 'api-management');
});

test('the page gets badges, the Azure icon and the repository; the body stays', () => {
  const page = '---\nid: experience-api-webshop\nname: Webshop\nversion: 1.0.0\n---\n\n## Overview\n\nText --- with dashes.\n';
  const out = annotate(page, {
    hosting: hostingOf(FUNCTION_APP),
    repository: { url: 'https://github.com/azure-intelligence-domain/experience-api-webshop', language: 'Python 3.12' },
  });
  const [, front, body] = out.split(/^---$/m);
  const data = parse(front);
  assert.equal(data.id, 'experience-api-webshop');
  assert.deepEqual(data.badges.map((b) => b.content), ['Azure Functions', 'Flex Consumption', 'Python 3.12', 'France Central']);
  assert.equal(data.styles.icon, '/icons/azure/10029-icon-service-Function-Apps.svg');
  assert.equal(data.repository.url, 'https://github.com/azure-intelligence-domain/experience-api-webshop');
  assert.ok(out.endsWith('## Overview\n\nText --- with dashes.\n'));
  assert.ok(body.includes('## Overview'));
});
