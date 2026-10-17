// Discover the contracts to catalog, and fetch the platform's shared contracts.
//
// 1. Every repository in the organisation with the topic "eventcatalog" and at least one release
//    is a source. From its latest release, asyncapi.yaml and/or openapi.yaml in the repository
//    root are cataloged. Only released contracts appear: work in progress never does.
// 2. The domain comes from the contract itself (adidas conventions, enforced by the contract
//    check): the AsyncAPI id urn:azure-intelligence-domain:<domain>:<name>, or the OpenAPI title
//    "[Domain] Name API". The owner is that domain's team: <domain>-team.
// 3. A 0.x release is a design (draft): it is cataloged, marked as draft.
// 4. BPMN flows in docs/bpmn/ of the release are copied to public/bpmn/<repository>/, for the
//    BpmnViewer component.
// 5. The envelope schema of the latest contracts release is fetched for the platform docs.
// 6. How each service runs (Azure Functions, a Logic App, or a contract the gateway serves) is read
//    from the Bicep in infra/ of the release, so there is no list to keep up to date.
//    scripts/annotate-services.mjs puts it on the service pages after generation.
//
// Writes sources.json (read by eventcatalog.config.js) and docs/platform/envelope.schema.json.
// Set GITHUB_TOKEN to avoid the GitHub API rate limit for anonymous requests.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';

const ORG = process.env.CATALOG_ORG ?? 'azure-intelligence-domain';
const TOPIC = 'eventcatalog';
const CONTRACT_FILES = { asyncapi: 'asyncapi.yaml', openapi: 'openapi.yaml' };
const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'eventcatalog-discovery' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function github(path) {
  const response = await fetch(`${API}${path}`, { headers });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub API ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function raw(repo, ref, file) {
  const response = await fetch(`${RAW}/${ORG}/${repo}/${ref}/${file}`);
  return response.ok ? response.text() : null;
}

export function domainOf(kind, contract) {
  if (kind === 'asyncapi') {
    const match = /^urn:azure-intelligence-domain:([a-z0-9-]+):/.exec(contract.id ?? '');
    return match?.[1];
  }
  const match = /^\[([A-Za-z ]+)\]/.exec(contract.info?.title ?? '');
  return match?.[1].trim().toLowerCase().replaceAll(' ', '-');
}

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

// The OpenAPI generator treats every key of a path item as an HTTP method, including the adidas
// x-summary and OpenAPI's own path-level parameters, summary and description. Hand it a copy with
// only operations per path; path-level parameters move onto each operation, so nothing is lost.
export function forGenerator(contract) {
  const copy = structuredClone(contract);
  for (const [path, item] of Object.entries(copy.paths ?? {})) {
    const shared = item.parameters ?? [];
    copy.paths[path] = Object.fromEntries(
      Object.entries(item)
        .filter(([key]) => HTTP_METHODS.has(key))
        .map(([method, operation]) => [
          method,
          {
            ...operation,
            parameters: [...shared, ...(operation.parameters ?? [])],
            // EventCatalog files every operation as a query unless told otherwise:
            // reads are queries, everything that changes state is a command.
            'x-eventcatalog-message-type': method === 'get' ? 'query' : 'command',
          },
        ]),
    );
  }
  return copy;
}

// A source for the generators: AsyncAPI contracts are read from their release URL (their $refs
// resolve against it); OpenAPI contracts are cleaned for the generator and written locally.
export async function prepareSource({ service, kind, release, url, contract }) {
  const draft = /^v?0\./.test(release);
  const domain = domainOf(kind, contract);
  if (!domain) throw new Error(`${service}: no domain in the contract's id or title`);
  let path = url;
  if (kind === 'openapi') {
    const folder = join('.sources', service);
    await mkdir(folder, { recursive: true });
    path = join(folder, 'openapi.yaml');
    await writeFile(path, stringify(forGenerator(contract)));
  }
  return { service, kind, release, url, path, draft, domain: { id: domain, name: titleCase(domain) }, owners: [`${domain}-team`] };
}

const REGIONS = { belgiumcentral: 'Belgium Central', francecentral: 'France Central' };

// How a service runs, from its Bicep: the first compute resource wins. No compute means the
// gateway serves the contract itself (the Partner API: no code of its own).
export function hostingOf(bicep) {
  const region = REGIONS[/param location string = '([a-z]+)'/.exec(bicep)?.[1]];
  if (/'Microsoft\.Web\/sites@/.test(bicep)) {
    const runtime = /runtime: \{\s*name: '([a-z-]+)'\s*version: '([\d.]+)'/.exec(bicep);
    return {
      type: 'functions',
      name: 'Azure Functions',
      plan: /tier: 'FlexConsumption'/.test(bicep) ? 'Flex Consumption' : 'App Service plan',
      language: runtime ? `${titleCase(runtime[1])} ${runtime[2]}` : undefined,
      region,
    };
  }
  if (/'Microsoft\.Logic\/workflows@/.test(bicep)) {
    return { type: 'logic-app', name: 'Logic App', plan: 'Consumption', language: 'Workflow definition', region };
  }
  return { type: 'api-management', name: 'API Management', plan: 'Contract only, served by the gateway' };
}

async function bicepOf(repo, ref) {
  const tree = await github(`/repos/${ORG}/${repo}/git/trees/${ref}?recursive=1`);
  const files = (tree?.tree ?? []).filter((e) => e.type === 'blob' && /^infra\/.*\.bicep$/.test(e.path));
  return (await Promise.all(files.map((f) => raw(repo, ref, f.path)))).join('\n');
}

const titleCase = (id) => id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

async function discover() {
  const repos = [];
  for (let page = 1; ; page++) {
    const batch = await github(`/orgs/${ORG}/repos?per_page=100&page=${page}`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }

  const sources = [];
  for (const repo of repos.filter((r) => r.topics?.includes(TOPIC) && !r.archived)) {
    const release = await github(`/repos/${ORG}/${repo.name}/releases/latest`);
    if (!release) {
      console.log(`- ${repo.name}: no release yet, skipped`);
      continue;
    }
    const hosting = hostingOf(await bicepOf(repo.name, release.tag_name));
    const repository = { url: repo.html_url, language: hosting.language ?? repo.language ?? undefined };
    for (const [kind, file] of Object.entries(CONTRACT_FILES)) {
      const text = await raw(repo.name, release.tag_name, file);
      if (!text) continue;
      const source = await prepareSource({
        service: repo.name,
        kind,
        release: release.tag_name,
        url: `${RAW}/${ORG}/${repo.name}/${release.tag_name}/${file}`,
        contract: parse(text),
      });
      sources.push({ ...source, hosting, repository });
      console.log(`+ ${repo.name} ${release.tag_name}: ${file} (domain ${source.domain.id}, ${hosting.name})${source.draft ? ' [draft]' : ''}`);
    }
    await copyFlows(repo.name, release.tag_name);
  }
  return sources.sort((a, b) => `${a.service}${a.kind}`.localeCompare(`${b.service}${b.kind}`));
}

async function copyFlows(repo, ref) {
  const listing = await github(`/repos/${ORG}/${repo}/contents/docs/bpmn?ref=${ref}`);
  for (const entry of (listing ?? []).filter((e) => e.name.endsWith('.bpmn'))) {
    const xml = await raw(repo, ref, `docs/bpmn/${entry.name}`);
    if (!xml) continue;
    await mkdir(join('public', 'bpmn', repo), { recursive: true });
    await writeFile(join('public', 'bpmn', repo, entry.name), xml);
    console.log(`  flow ${repo}/${entry.name}`);
  }
}

async function fetchEnvelope() {
  const release = await github(`/repos/${ORG}/contracts/releases/latest`);
  const asset = release?.assets.find((a) => a.name === 'envelope.schema.json');
  if (!asset) throw new Error('No envelope.schema.json in the latest contracts release');
  const response = await fetch(asset.browser_download_url);
  if (!response.ok) throw new Error(`Cannot download the envelope schema: ${response.status}`);
  await mkdir('docs/platform', { recursive: true });
  await writeFile('docs/platform/envelope.schema.json', await response.text());
  console.log(`Envelope schema from contracts ${release.tag_name}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sources = await discover();
  await writeFile('sources.json', `${JSON.stringify(sources, null, 2)}\n`);
  console.log(`${sources.length} contract(s) to catalog`);
  await fetchEnvelope();
}
