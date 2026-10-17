// After `eventcatalog generate`: how each service runs, on its page. The generators know the
// contracts only; scripts/discover-sources.mjs read the hosting from each release's Bicep
// (sources.json). Every generated version of a service gets:
//
//   badges      the Azure service, its plan, the language and the region
//   styles      the official Azure icon (public/icons/azure, fetched by the build, not committed)
//   repository  the GitHub repository and its language
//   writesTo    the data stores it writes to (data-stores.json, read from the Bicep)
//
// Every released service must belong to a system (domains/*/systems/*): the build fails otherwise.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';

export const ICONS = {
  functions: '10029-icon-service-Function-Apps.svg',
  'logic-app': '02631-icon-service-Logic-Apps.svg',
  'api-management': '10042-icon-service-API-Management-Services.svg',
};

export function badgesOf(hosting) {
  return [
    { content: hosting.name, backgroundColor: 'blue', textColor: 'blue', icon: 'CpuChipIcon' },
    { content: hosting.plan, backgroundColor: 'gray', textColor: 'gray', icon: 'BanknotesIcon' },
    hosting.language && { content: hosting.language, backgroundColor: 'gray', textColor: 'gray', icon: 'CodeBracketIcon' },
    hosting.region && { content: hosting.region, backgroundColor: 'gray', textColor: 'gray', icon: 'MapPinIcon' },
  ].filter(Boolean);
}

// One generated index.mdx, with the hosting in its frontmatter; the body is left as it is.
export function annotate(text, { hosting, repository }, writesTo = []) {
  const [, front, ...body] = text.split(/^---$/m);
  const data = parse(front);
  data.badges = badgesOf(hosting);
  data.styles = { ...data.styles, icon: `/icons/azure/${ICONS[hosting.type]}` };
  data.repository = Object.fromEntries(Object.entries(repository).filter(([, v]) => v));
  if (writesTo.length) data.writesTo = writesTo.map((id) => ({ id }));
  return `---\n${stringify(data)}---${body.join('---')}`;
}

function serviceFiles(id) {
  const files = [];
  for (const domain of existsSync('domains') ? readdirSync('domains') : []) {
    const folder = join('domains', domain, 'services', id);
    if (!existsSync(folder)) continue;
    // The service page and its older versions; not the messages filed under the service.
    files.push(join(folder, 'index.mdx'));
    const versioned = join(folder, 'versioned');
    for (const version of existsSync(versioned) ? readdirSync(versioned) : []) {
      files.push(join(versioned, version, 'index.mdx'));
    }
  }
  return files;
}

// The service ids of every system (domains/<domain>/systems/<id>/index.mdx).
export function systemServices() {
  const members = new Map();
  for (const domain of existsSync('domains') ? readdirSync('domains') : []) {
    const systems = join('domains', domain, 'systems');
    for (const id of existsSync(systems) ? readdirSync(systems) : []) {
      const [, front] = readFileSync(join(systems, id, 'index.mdx'), 'utf8').split(/^---$/m);
      for (const service of parse(front).services ?? []) members.set(service.id, [...(members.get(service.id) ?? []), id]);
    }
  }
  return members;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sources = JSON.parse(readFileSync('sources.json', 'utf8'));
  const { writesTo } = existsSync('data-stores.json') ? JSON.parse(readFileSync('data-stores.json', 'utf8')) : { writesTo: {} };
  const services = new Map(sources.filter((s) => s.hosting).map((s) => [s.service, s]));
  const members = systemServices();
  const homeless = [...services.keys()].filter((id) => (members.get(id) ?? []).length !== 1);
  if (homeless.length) {
    throw new Error(`Every service belongs to exactly one system (domains/*/systems): ${homeless.join(', ')}`);
  }
  for (const [id, source] of services) {
    const files = serviceFiles(id);
    for (const file of files) writeFileSync(file, annotate(readFileSync(file, 'utf8'), source, writesTo[id] ?? []));
    console.log(`${id}: ${source.hosting.name}, ${files.length} page(s)`);
  }
}
