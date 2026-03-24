# Salvador (Legacy)

> **This directory contains the legacy TypeScript-based Salvador agent.**
> It has been superseded by the file-tree agent at [`agents/salvador-filetree/`](../salvador-filetree/).

The legacy format required `npm install`, `npm run build`, and a TypeScript compilation step. The new file-tree format is a plain folder — no build step, no `node_modules`.

## Migration

All features listed in the old roadmap (Curator, Document Intake, Learning Loop, Embeddings, Cross-Project Memory, Context Engine, Proactive Agency) are now built into the **Soleri Knowledge Engine** (`@soleri/core`) and available to all file-tree agents out of the box.

To use the current Salvador:

```bash
cd agents/salvador-filetree
npx @soleri/cli install
npx @soleri/cli dev
```

See the [Soleri documentation](https://soleri.ai) for details.
