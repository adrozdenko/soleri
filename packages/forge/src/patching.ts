/**
 * Source file patching utilities — shared between knowledge-installer and domain-manager.
 *
 * These functions modify an agent's src/index.ts and src/activation/claude-md-content.ts
 * to register new domain facades and their CLAUDE.md table rows.
 *
 * v5.0: Entry point uses createDomainFacades() from @soleri/core.
 * New domain patching inserts domain names into the domains array literal.
 */

/**
 * Patch the agent's src/index.ts to add new domains.
 *
 * v5.0 format: The entry point has a `createDomainFacades(runtime, 'agentId', [...domains])` call.
 * We insert new domain strings into that array.
 *
 * Falls back to v4.x format (import + facade creation) for older agents.
 */
export function patchIndexTs(
  source: string,
  newDomains: string[],
  _hasBrain?: boolean,
): string | null {
  // ── v5.0 format: createDomainFacades() with domains array literal ──
  const v5Pattern = /createDomainFacades\(runtime,\s*'[^']+',\s*\[([\s\S]*?)\]\)/;
  const v5Match = source.match(v5Pattern);

  if (v5Match) {
    const existingArrayContent = v5Match[1];
    const domainsToAdd = newDomains.filter(
      (d) => !existingArrayContent.includes(`'${d}'`) && !existingArrayContent.includes(`"${d}"`),
    );
    if (domainsToAdd.length === 0) return source;

    const newEntries = domainsToAdd.map((d) => `'${d}'`).join(', ');
    const currentContent = existingArrayContent.trim();
    const updatedContent = currentContent ? `${currentContent}, ${newEntries}` : newEntries;

    return source.replace(v5Pattern, (match) => {
      return match.replace(v5Match[1], updatedContent);
    });
  }

  // ── v4.x fallback: import + facade creation anchors ──
  return patchIndexTsV4(source, newDomains, _hasBrain ?? true);
}

/**
 * Legacy v4.x patching — import-based domain facade registration.
 */
function patchIndexTsV4(source: string, newDomains: string[], hasBrain: boolean): string | null {
  const domainsToImport = newDomains.filter((d) => {
    const fn = `create${pascalCase(d)}Facade`;
    return !source.includes(`import { ${fn} }`);
  });

  const domainsToRegister = newDomains.filter((d) => {
    const fn = `create${pascalCase(d)}Facade(`;
    return !source.includes(fn);
  });

  if (domainsToImport.length === 0 && domainsToRegister.length === 0) {
    return source;
  }

  let patched = source;

  if (domainsToImport.length > 0) {
    const importAnchor = /^(import \{ createCoreFacade \}.*$)/m;
    if (!importAnchor.test(patched)) return null;

    const newImports = domainsToImport
      .map((d) => {
        const fn = `create${pascalCase(d)}Facade`;
        return `import { ${fn} } from './facades/${d}.facade.js';`;
      })
      .join('\n');

    patched = patched.replace(importAnchor, `${newImports}\n$1`);
  }

  if (domainsToRegister.length > 0) {
    const facadeAnchor = /^(\s+createCoreFacade\()/m;
    if (!facadeAnchor.test(patched)) return null;

    const newCreations = domainsToRegister
      .map((d) => {
        const fn = `create${pascalCase(d)}Facade`;
        const args = hasBrain ? 'vault, brain' : 'vault';
        return `    ${fn}(${args}),`;
      })
      .join('\n');

    patched = patched.replace(facadeAnchor, `${newCreations}\n$1`);
  }

  return patched;
}

/**
 * Patch the agent's src/activation/claude-md-content.ts to add
 * facade table rows for new domains.
 *
 * Primary anchor: line containing `| Memory search |` (newer agents)
 * Fallback anchor: line containing `## Intent Detection` (older agents without memory/brain rows)
 */
export function patchClaudeMdContent(
  source: string,
  agentId: string,
  newDomains: string[],
): string | null {
  const facadeId = agentId.replace(/-/g, '_');
  const bt = '`';

  // Filter out domains whose rows already exist (idempotent)
  const domainsToAdd = newDomains.filter((d) => {
    const toolName = `${facadeId}_${d.replace(/-/g, '_')}`;
    return !source.includes(`${toolName}`);
  });

  if (domainsToAdd.length === 0) return source;

  // Try primary anchor first, then fallback for older agents
  let anchorIdx = source.indexOf("'| Memory search |");
  if (anchorIdx === -1) {
    // Older agents: insert before the empty line preceding ## Intent Detection
    anchorIdx = source.indexOf("'## Intent Detection'");
    if (anchorIdx === -1) return null;
    // Back up to include the preceding empty string line ('',)
    const emptyLineIdx = source.lastIndexOf("'',", anchorIdx);
    if (emptyLineIdx !== -1 && anchorIdx - emptyLineIdx < 20) {
      // Find the start of that line (the indentation)
      const lineStart = source.lastIndexOf('\n', emptyLineIdx);
      anchorIdx = lineStart === -1 ? emptyLineIdx : lineStart + 1;
    }
  }

  const newRows = domainsToAdd.flatMap((d) => {
    const toolName = `${facadeId}_${d.replace(/-/g, '_')}`;
    return [
      `    '| ${d} patterns | ${bt}${toolName}${bt} | ${bt}get_patterns${bt} |',`,
      `    '| Search ${d} | ${bt}${toolName}${bt} | ${bt}search${bt} |',`,
      `    '| Capture ${d} | ${bt}${toolName}${bt} | ${bt}capture${bt} |',`,
    ];
  });

  return source.slice(0, anchorIdx) + newRows.join('\n') + '\n' + source.slice(anchorIdx);
}

function pascalCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}
