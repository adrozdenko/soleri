/**
 * Review utility functions for code review intelligence.
 */

const DESIGN_EXTENSIONS = new Set(['.tsx', '.css', '.scss', '.vue', '.svelte']);

/**
 * Check if a filename is a design-relevant file.
 */
export function isDesignFile(filename: string): boolean {
  const ext = filename.slice(filename.lastIndexOf('.'));
  return DESIGN_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Find hex color literals in code (e.g., #fff, #FF0000).
 */
export function findHexColors(code: string): string[] {
  const matches = code.match(/#(?:[0-9a-fA-F]{3,4}){1,2}\b/g);
  return matches ?? [];
}

/**
 * Find Tailwind arbitrary values in code (e.g., p-[13px], text-[#ff0000]).
 */
export function findArbitraryValues(code: string): string[] {
  const matches = code.match(/(?:[\w-]+)-\[[^\]]+\]/g);
  return matches ?? [];
}

/**
 * Architecture boundary definitions.
 * Features should not import from other features.
 * UI layer should not import from data layer directly.
 */
interface ArchitectureViolation {
  fromPath: string;
  importPath: string;
  rule: string;
  severity: 'error' | 'warning';
}

/**
 * Check if an import violates architecture boundaries.
 *
 * Rules:
 * - features/X cannot import from features/Y (cross-feature)
 * - components/ cannot import from services/ or data/ (UI -> data layer)
 * - pages/ cannot import from pages/ (cross-page)
 */
export function checkArchitectureBoundary(
  fromPath: string,
  importPath: string,
): ArchitectureViolation | null {
  const normalizedFrom = fromPath.replace(/\\/g, '/');
  const normalizedImport = importPath.replace(/\\/g, '/');

  // Cross-feature import check
  const featureMatch = normalizedFrom.match(/features\/([^/]+)/);
  if (featureMatch) {
    const currentFeature = featureMatch[1];
    const importFeatureMatch = normalizedImport.match(/features\/([^/]+)/);
    if (importFeatureMatch && importFeatureMatch[1] !== currentFeature) {
      return {
        fromPath,
        importPath,
        rule: `Cross-feature import: "${currentFeature}" imports from "${importFeatureMatch[1]}"`,
        severity: 'error',
      };
    }
  }

  // UI -> data layer check
  const isUIFile = /\/(components|ui|views)\//.test(normalizedFrom);
  const importsDataLayer = /\/(services|data|api|store|repositories)\//.test(normalizedImport);
  if (isUIFile && importsDataLayer) {
    return {
      fromPath,
      importPath,
      rule: 'UI layer importing directly from data layer',
      severity: 'warning',
    };
  }

  // Cross-page import check
  const pageMatch = normalizedFrom.match(/pages\/([^/]+)/);
  if (pageMatch) {
    const currentPage = pageMatch[1];
    const importPageMatch = normalizedImport.match(/pages\/([^/]+)/);
    if (importPageMatch && importPageMatch[1] !== currentPage) {
      return {
        fromPath,
        importPath,
        rule: `Cross-page import: "${currentPage}" imports from "${importPageMatch[1]}"`,
        severity: 'warning',
      };
    }
  }

  // Services should not import from UI
  const isServiceFile = /\/(services|api|data|repositories)\//.test(normalizedFrom);
  const importsUI = /\/(components|ui|views|pages)\//.test(normalizedImport);
  if (isServiceFile && importsUI) {
    return {
      fromPath,
      importPath,
      rule: 'Service layer importing from UI layer',
      severity: 'error',
    };
  }

  // Utils should not import from features
  const isUtilFile = /\/(utils|lib|helpers)\//.test(normalizedFrom);
  const importsFeature = /\/features\//.test(normalizedImport);
  if (isUtilFile && importsFeature) {
    return {
      fromPath,
      importPath,
      rule: 'Utility module importing from feature module',
      severity: 'error',
    };
  }

  // Types should not import from implementation
  const isTypeFile = /\/(types|interfaces|contracts)\//.test(normalizedFrom);
  const importsImpl = /\/(services|data|api|repositories|features|components)\//.test(
    normalizedImport,
  );
  if (isTypeFile && importsImpl) {
    return {
      fromPath,
      importPath,
      rule: 'Type definition importing from implementation module',
      severity: 'warning',
    };
  }

  return null;
}
