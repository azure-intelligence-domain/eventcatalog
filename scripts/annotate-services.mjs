// After `eventcatalog generate`: how each service runs, on its page. The generators know the
// contracts only; scripts/discover-sources.mjs read the hosting from each release's Bicep
// (sources.json). Every generated version of a service gets:
//
//   badges      the Azure service, its plan, the language and the region
//   styles      the official Azure icon (public/icons/azure, fetched by the build, not committed)
//   repository  the GitHub repository and its language

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
export function annotate(text, { hosting, repository }) {
  const [, front, ...body] = text.split(/^---$/m);
  const data = parse(front);
  data.badges = badgesOf(hosting);
  data.styles = { ...data.styles, icon: `/icons/azure/${ICONS[hosting.type]}` };
  data.repository = Object.fromEntries(Object.entries(repository).filter(([, v]) => v));
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const sources = JSON.parse(readFileSync('sources.json', 'utf8'));
  const services = new Map(sources.filter((s) => s.hosting).map((s) => [s.service, s]));
  for (const [id, source] of services) {
    const files = serviceFiles(id);
    for (const file of files) writeFileSync(file, annotate(readFileSync(file, 'utf8'), source));
    console.log(`${id}: ${source.hosting.name}, ${files.length} page(s)`);
  }
}
