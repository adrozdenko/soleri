import { describe, it, expect, beforeEach } from 'vitest';
import pack, {
  parseImports,
  detectDriftBetween,
  extractPropsFromCode,
  _clearRegistry,
} from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  _clearRegistry();
});

// ---------------------------------------------------------------------------
// DomainPack Manifest
// ---------------------------------------------------------------------------

describe('DomainPack Manifest', () => {
  it('should export a valid DomainPack with correct metadata', () => {
    expect(pack.name).toBe('component');
    expect(pack.version).toBe('1.0.0');
    expect(pack.domains).toContain('component');
  });

  it('should have 7 ops', () => {
    expect(pack.ops.length).toBe(7);
  });

  it('should have all expected op names', () => {
    const names = pack.ops.map((o) => o.name);
    expect(names).toContain('search');
    expect(names).toContain('get');
    expect(names).toContain('list');
    expect(names).toContain('create');
    expect(names).toContain('detect_drift');
    expect(names).toContain('analyze_dependencies');
    expect(names).toContain('sync_status');
  });

  it('should have CLAUDE.md rules', () => {
    expect(pack.rules).toBeDefined();
    expect(pack.rules).toContain('Component Lifecycle');
    expect(pack.rules).toContain('detect_drift');
  });
});

// ---------------------------------------------------------------------------
// parseImports
// ---------------------------------------------------------------------------

describe('parseImports', () => {
  it('should parse default imports', () => {
    const code = `import React from 'react';`;
    expect(parseImports(code)).toEqual(['react']);
  });

  it('should parse named imports', () => {
    const code = `import { useState, useEffect } from 'react';`;
    expect(parseImports(code)).toEqual(['react']);
  });

  it('should parse namespace imports', () => {
    const code = `import * as Icons from '@/components/icons';`;
    expect(parseImports(code)).toEqual(['@/components/icons']);
  });

  it('should parse multiple imports', () => {
    const code = `
import React from 'react';
import { Button } from './Button';
import { cn } from '@/lib/utils';
import 'tailwindcss/base';
    `;
    const deps = parseImports(code);
    expect(deps).toContain('react');
    expect(deps).toContain('./Button');
    expect(deps).toContain('@/lib/utils');
    expect(deps).toContain('tailwindcss/base');
  });

  it('should return empty array for code with no imports', () => {
    expect(parseImports('const x = 1;')).toEqual([]);
  });

  it('should handle side-effect imports', () => {
    const code = `import 'normalize.css';`;
    expect(parseImports(code)).toContain('normalize.css');
  });
});

// ---------------------------------------------------------------------------
// detectDriftBetween
// ---------------------------------------------------------------------------

describe('detectDriftBetween', () => {
  it('should detect no drift when props match', () => {
    const code = `
interface Props {
  label: string;
  onClick: () => void;
}
    `;
    const result = detectDriftBetween(code, {
      description: 'A button',
      props: ['label', 'onClick'],
    });
    expect(result.drifted).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it('should detect added props', () => {
    const code = `
interface Props {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}
    `;
    const result = detectDriftBetween(code, {
      description: 'A button',
      props: ['label', 'onClick'],
    });
    expect(result.drifted).toBe(true);
    expect(result.changes.some((c) => c.type === 'added' && c.detail.includes('disabled'))).toBe(
      true,
    );
  });

  it('should detect removed props', () => {
    const code = `
interface Props {
  label: string;
}
    `;
    const result = detectDriftBetween(code, {
      description: 'A button',
      props: ['label', 'onClick'],
    });
    expect(result.drifted).toBe(true);
    expect(result.changes.some((c) => c.type === 'removed' && c.detail.includes('onClick'))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// extractPropsFromCode
// ---------------------------------------------------------------------------

describe('extractPropsFromCode', () => {
  it('should extract prop names from interface', () => {
    const code = `
interface ButtonProps {
  label: string;
  variant?: 'primary' | 'secondary';
  disabled: boolean;
}
    `;
    const props = extractPropsFromCode(code);
    expect(props).toContain('label');
    expect(props).toContain('variant');
    expect(props).toContain('disabled');
  });

  it('should exclude TypeScript keywords', () => {
    const code = `
import { FC } from 'react';
export const Button: FC = () => null;
interface Props {
  title: string;
}
    `;
    const props = extractPropsFromCode(code);
    expect(props).not.toContain('import');
    expect(props).not.toContain('export');
    expect(props).toContain('title');
  });
});

// ---------------------------------------------------------------------------
// Op handlers (integration)
// ---------------------------------------------------------------------------

describe('Op handlers', () => {
  const findOp = (name: string) => pack.ops.find((o) => o.name === name)!;

  it('create should register a component', async () => {
    const op = findOp('create');
    const result = (await op.handler({
      name: 'Button',
      description: 'Primary button component',
      props: ['label', 'onClick', 'variant'],
      tags: ['ui', 'form'],
      filePath: 'src/components/Button.tsx',
    })) as { created: boolean; id: string };
    expect(result.created).toBe(true);
    expect(result.id).toBe('button');
  });

  it('create should reject duplicates', async () => {
    const op = findOp('create');
    await op.handler({ name: 'Button', description: 'v1' });
    const result = (await op.handler({ name: 'Button', description: 'v2' })) as {
      created: boolean;
      reason: string;
    };
    expect(result.created).toBe(false);
    expect(result.reason).toContain('already exists');
  });

  it('get should find a registered component', async () => {
    await findOp('create').handler({ name: 'Card', description: 'A card' });
    const result = (await findOp('get').handler({ id: 'card' })) as { found: boolean };
    expect(result.found).toBe(true);
  });

  it('get should return not found for unknown ID', async () => {
    const result = (await findOp('get').handler({ id: 'nonexistent' })) as { found: boolean };
    expect(result.found).toBe(false);
  });

  it('search should find components by query', async () => {
    await findOp('create').handler({ name: 'Button', description: 'Primary button', tags: ['ui'] });
    await findOp('create').handler({ name: 'Input', description: 'Text input', tags: ['form'] });
    const result = (await findOp('search').handler({ query: 'button' })) as { count: number };
    expect(result.count).toBe(1);
  });

  it('list should return all components', async () => {
    await findOp('create').handler({ name: 'A', description: 'a' });
    await findOp('create').handler({ name: 'B', description: 'b' });
    const result = (await findOp('list').handler({})) as { count: number; total: number };
    expect(result.count).toBe(2);
    expect(result.total).toBe(2);
  });

  it('detect_drift should detect added props in code', async () => {
    await findOp('create').handler({
      name: 'Button',
      description: 'A button',
      props: ['label', 'onClick'],
    });

    const code = `
interface Props {
  label: string;
  onClick: () => void;
  size?: 'sm' | 'md' | 'lg';
}
    `;
    const result = (await findOp('detect_drift').handler({ id: 'button', code })) as {
      found: boolean;
      drifted: boolean;
      changes: Array<{ type: string; detail: string }>;
    };
    expect(result.found).toBe(true);
    expect(result.drifted).toBe(true);
    expect(result.changes.some((c) => c.type === 'added' && c.detail.includes('size'))).toBe(true);
  });

  it('detect_drift should return not found for unknown component', async () => {
    const result = (await findOp('detect_drift').handler({ id: 'unknown', code: '' })) as {
      found: boolean;
    };
    expect(result.found).toBe(false);
  });

  it('analyze_dependencies should separate internal and external deps', async () => {
    const code = `
import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { Card } from '../Card';
    `;
    const result = (await findOp('analyze_dependencies').handler({
      code,
      componentName: 'MyComponent',
    })) as {
      componentName: string;
      totalDependencies: number;
      internal: string[];
      external: string[];
    };
    expect(result.componentName).toBe('MyComponent');
    expect(result.totalDependencies).toBe(4);
    expect(result.external).toContain('react');
    expect(result.internal).toContain('@/lib/utils');
    expect(result.internal).toContain('./Button');
    expect(result.internal).toContain('../Card');
  });

  it('sync_status should report synced, missing-file, missing-metadata, and unregistered', async () => {
    await findOp('create').handler({
      name: 'Button',
      description: 'btn',
      filePath: 'src/Button.tsx',
    });
    await findOp('create').handler({
      name: 'Card',
      description: 'card',
      filePath: 'src/Card.tsx',
    });
    await findOp('create').handler({
      name: 'Modal',
      description: 'modal',
      // No filePath — should be classified as missing-metadata, NOT drift
    });

    const result = (await findOp('sync_status').handler({
      filePaths: ['src/Button.tsx', 'src/Dialog.tsx'],
    })) as {
      synced: number;
      drifted: number;
      missingFile: number;
      missingMetadata: number;
      unregistered: number;
      components: Array<{ id: string; name: string; status: string }>;
      unregisteredFiles: string[];
    };

    expect(result.synced).toBe(1); // Button matches
    expect(result.missingFile).toBe(1); // Card file not in list
    expect(result.drifted).toBe(0); // No drift — missing filePath is now missing-metadata
    expect(result.missingMetadata).toBe(1); // Modal has no filePath
    expect(result.unregistered).toBe(1); // Dialog.tsx not registered
  });

  it('sync_status should classify component without filePath as missing-metadata, not drift', async () => {
    await findOp('create').handler({
      name: 'Tooltip',
      description: 'tooltip with no file path',
      // filePath intentionally omitted
    });

    const result = (await findOp('sync_status').handler({
      filePaths: [],
    })) as {
      drifted: number;
      missingMetadata: number;
      components: Array<{ id: string; name: string; status: string }>;
    };

    const tooltipEntry = result.components.find((c) => c.name === 'Tooltip');
    expect(tooltipEntry).toBeDefined();
    expect(tooltipEntry!.status).toBe('missing-metadata');
    expect(result.drifted).toBe(0);
    expect(result.missingMetadata).toBe(1);
  });

  it('sync_status should classify component with matching filePath as synced', async () => {
    await findOp('create').handler({
      name: 'Badge',
      description: 'badge',
      filePath: 'src/Badge.tsx',
    });

    const result = (await findOp('sync_status').handler({
      filePaths: ['src/Badge.tsx'],
    })) as {
      synced: number;
      components: Array<{ id: string; name: string; status: string }>;
    };

    const badgeEntry = result.components.find((c) => c.name === 'Badge');
    expect(badgeEntry).toBeDefined();
    expect(badgeEntry!.status).toBe('synced');
    expect(result.synced).toBe(1);
  });

  it('sync_status should classify component with filePath not in input list as missing-file', async () => {
    await findOp('create').handler({
      name: 'Avatar',
      description: 'avatar',
      filePath: 'src/Avatar.tsx',
    });

    const result = (await findOp('sync_status').handler({
      filePaths: ['src/OtherComponent.tsx'],
    })) as {
      missingFile: number;
      components: Array<{ id: string; name: string; status: string }>;
    };

    const avatarEntry = result.components.find((c) => c.name === 'Avatar');
    expect(avatarEntry).toBeDefined();
    expect(avatarEntry!.status).toBe('missing-file');
    expect(result.missingFile).toBe(1);
  });

  it('sync_status should list file paths not in registry as unregisteredFiles', async () => {
    await findOp('create').handler({
      name: 'Icon',
      description: 'icon',
      filePath: 'src/Icon.tsx',
    });

    const result = (await findOp('sync_status').handler({
      filePaths: ['src/Icon.tsx', 'src/Unregistered.tsx', 'src/AlsoUnknown.tsx'],
    })) as {
      unregistered: number;
      unregisteredFiles: string[];
    };

    expect(result.unregistered).toBe(2);
    expect(result.unregisteredFiles).toContain('src/Unregistered.tsx');
    expect(result.unregisteredFiles).toContain('src/AlsoUnknown.tsx');
    expect(result.unregisteredFiles).not.toContain('src/Icon.tsx');
  });
});
