export function generateTsconfig(): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      lib: ['ES2022'],
      outDir: 'dist',
      rootDir: 'src',
      strict: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      forceConsistentCasingInFileNames: true,
      skipLibCheck: true,
      noEmitOnError: true,
    },
    include: ['src/**/*.ts'],
    exclude: ['node_modules', 'dist', 'src/**/*.test.ts', 'src/__tests__/**'],
  };

  return JSON.stringify(config, null, 2);
}
