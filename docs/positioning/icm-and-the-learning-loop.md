# ICM and the Learning Loop

Status: **Draft** | Audience: engine maintainers, contributors evaluating the refactor direction

## Summary

_Interpretable Context Methodology: Folder Structure as Agent Architecture_ (the "ICM paper", 2603.16021v2) argues that for sequential, human-reviewed, repeatable workflows, a folder hierarchy of plain-text files is a sufficient — and better — substitute for a coordination framework. Soleri agrees with most of that argument and is adopting its file-first discipline directly. This document sets out where the two overlap, where ICM draws its own boundaries, and the one capability the paper names as future work but does not implement: a loop that turns recurring human edits into source-level corrections (§6.3).

The position is not that Soleri competes with ICM. It is that Soleri's current refactor is building the persistence and learning substrate ICM leaves open. An ICM workspace could use a Soleri vault as its Layer 3 reference store and route its stage-output edits into Soleri's edit-source loop, and in doing so acquire the §6.2/§6.3 future work the paper defers — without ICM itself having to grow into a framework.

## 1. What ICM gets right, and what Soleri is adopting

ICM's five design principles (§3.1) are the ones Soleri's current refactor is being measured against:

| ICM principle (§3.1) | What Soleri is changing to honour it |
|----------------------|--------------------------------------|
| Plain text as the interface | Plans become one human-editable `plans/<planId>.md` per plan, frontmatter as the source of truth; the JSON store drops to a cache the engine rebuilds. Vault entries become canonical `knowledge/vault/<domain>/<slug>.md` files; SQLite drops from _store_ to _index_. |
| Layered context loading (prevention, not compression) | `session_start` is cut to Layer 0 identity plus a Layer 1 routing index, under a hard 1,500-token ceiling — the full op catalogue, domain list, and skill list move to on-demand retrieval. |
| Every output is an edit surface | Plans and vault entries are files a human opens, edits, and saves before the next stage reads them (§3.1); the file always wins over the index. |
| Configure the factory, not the product | The Layer 3 (reference) versus Layer 4 (working) distinction from Table 2 is made explicit in flow-step `inputs`, and the human-review regime becomes an editable `engine.ceremony: full \| light \| off` setting rather than a hardcoded default. |
| One stage, one job | Flow steps gain a declarative `inputs:` block — the ICM stage-contract Inputs table (§3.3), with the Layer 2 control-point framing from §3.2, in YAML — and the executor delivers only the declared context to each step, nothing else. |

The honest part is the arithmetic, and it does not currently flatter Soleri. ICM reports a per-stage context budget of 2,000–8,000 tokens (Fig 3), with a monolithic load reaching ~42,000, "most of it irrelevant". Measured against the same chars/4 accounting the engine uses internally, at an operating point of 1,142 vault entries, 80 domains, 51 skills, and 77 pre-flight tool rows (72 at HEAD, padded to 77 in the measurement report to match the observed task; the ~140-token delta is immaterial):

| Aggregate | Tokens | vs ICM 8K ceiling |
|-----------|--------|-------------------|
| `session_start` payload alone | 4,842 | 0.61× |
| Always-on every turn (CLAUDE.md rules 3,771 + MCP schemas ~3,260) | ~7,031 | 0.88× |
| Core upfront (rules 3,771 + `session_start` 4,842) | 8,613 | **1.08×** |
| Full upfront incl. always-on MCP schemas | ~11,873 | **1.48×** |

The engine currently spends a full ICM stage-budget, or more, on fixed scaffolding before a single token of reasoning — and roughly 7,000 of that is re-paid on every turn, not once. The pre-flight tool array alone (2,933 tokens) is larger than an entire low-end ICM stage, and the facade→op inventory is serialized in three places (MCP schemas, the generated CLAUDE.md table, and the `session_start` manifest). The five reduction levers in the measurement report bring full upfront from ~11,900 down to roughly 5,000 tokens — back inside ICM's band. That number is the target the file-first refactor exists to hit; it is not where the engine is today.

Two caveats on the measurement itself: the figures are chars/4 estimates rather than real tokenizer output, and the `session_start` payload was reconstructed from the real code paths rather than executed against a live 1,142-entry vault. The MCP schema figure (~3,260) is an estimate whose exact value depends on the client's JSON-Schema serialization. The direction is not in doubt; the second decimal place is.

## 2. The boundary of ICM's claims

ICM is careful about its own scope, and any positioning that ignores those limits would be dishonest.

**Where it does not work (§5.2).** The paper excludes three workflow classes outright: real-time multi-agent collaboration, where agents respond to each other in tight loops and need message-passing infrastructure that file-based handoffs are too slow for; high-concurrency systems, where many users hit one pipeline and need queueing, state isolation, and deployment infrastructure that ICM is local-first by design to avoid; and complex mid-pipeline branching driven by model decisions, which the paper notes "would require scripting that moves ICM toward being a framework itself". ICM's claim is explicitly not that it replaces existing tools across the board (§5.2) — only that for sequential, reviewable, repeatable work, the frameworks impose more complexity than the problem requires.

**How well-evidenced the claims are (§4.6).** The paper is candid that its support is practitioner report, not measurement:

- Data collection is informal — observations come from conversations, not instrumented logging or diary studies.
- The practitioner community is invite-only and self-selected, which the authors name as both selection bias and potential enthusiasm bias.
- The U-shaped editing pattern (Fig 5) is self-reported by 30 of 33 practitioners "through conversation", not verified by instrumented measurement.
- All testing was on a single model family (§4.1); cross-model behavior is left as future work.
- No controlled comparison against a monolithic prompt was run, so the "improves quality" claim rests on the "lost in the middle" literature and practitioner judgement, "rather than measured effect sizes".

The consequence for Soleri is a design rule, not a footnote: **implement the structure, do not hardcode the effect.** The 2,000–8,000 token band, the U-shape, and the quality claim are all inputs to be treated as hypotheses. Budget guardrails belong in tests as bounds to hold, not as tuned constants derived from an unmeasured curve. Where Soleri's own design choices below (the N=3 threshold, the edit classification) mirror the paper's, they inherit the same status: reasonable, grounded in the text, and not validated until measured.

## 3. What a persistent assistant needs that folders alone do not give

ICM's workspace is per-project and human-scale. Its observability story (§5.3) is "open the folder and read the files" — which works precisely because a workspace holds a handful of stages and a bounded set of reference files a person can browse. A persistent assistant does not have that shape. Soleri's operating point is 1,142 vault entries across 80 domains, accumulated over time and across projects. At that scale, four needs appear that a flat folder does not serve, and these are the engine's remit:

1. **Search over 1,000+ entries.** Grep over a thousand markdown files finds strings, not relevant knowledge. The engine keeps a full-text and semantic index so a stage can pull the three entries that bear on its task, scoped by domain — which is the same layered-loading discipline ICM applies to files (§3.1), extended to a corpus too large to load or browse whole.
2. **Decay and de-duplication.** Folders do not prune themselves. Entries go stale and duplicate as they accumulate; the engine tracks a content hash per entry for staleness detection and de-duplication. A folder is canonical, but it is not self-maintaining.
3. **Cross-project memory.** ICM Layer 3 is configured once per workspace and stays put (Table 2). A persistent assistant needs patterns learned in one project to be reachable from a related one — retrieval across project boundaries, and promotion of genuinely universal patterns to a shared pool.
4. **Pattern strength.** Which reference material actually matters is not derivable from a directory listing. The engine records strength signals so the briefing can surface the patterns worth pulling, rather than presenting a flat folder in which every file looks equally load-bearing.

The remit is bounded, and the boundary is the point. **The index is a derived convenience over files, never a replacement for them.** The vault refactor (Layer 3 files-first) makes the markdown the source of truth and SQLite an index rebuilt from it; the file always wins on conflict, exactly because the paper's §6.3 argument — you cannot improve a source you cannot open — applies to reference material as much as to stage output. Soleri must add retrieval, decay, cross-project reach, and strength ranking. It must not, in doing so, add back the coordination-framework weight ICM deliberately sheds. The token measurements in §1 are the standing reminder that the engine has, so far, leaned the wrong way on that line: every op schema and briefing row is context cost, which is the monolithic-load risk ICM warns against (Fig 3), reappearing as engine overhead. The retrieval layer earns its place only if it stays cheaper than the folder it indexes.

## 4. The edit-source learning loop: ICM names it, Soleri's refactor implements it

The bridge between the two systems is §6.3, and it is worth quoting the paper's own framing, because it is stated as future work throughout:

> A future version of ICM could support this by tracking output edits across runs. If a practitioner edits the same kind of thing in the same stage's output three runs in a row, the system could surface that pattern and suggest a source-level change: a contract amendment, a reference file update, a new constraint. This would close the loop between output editing and source improvement, turning one-off fixes into durable system improvements.

The paper's own diagnosis is that editing output is "patching the binary" — it works for that run but does not improve the compiler — and it closes §6.3 with the prerequisite: "you cannot improve the source if you cannot trace the problem back to it". The traceability that would carry that — identifiers such as GUIDs, section tags, and comment annotations acting as debug symbols or source maps — is the subject of §6.2 ("Toward Semantic Debugging"), which states plainly that these ideas are "not yet implemented".

Soleri's current refactor implements it. This is design and in-progress build work, not a shipped feature — as with the token reductions in §1, it describes where the refactor is going, not where the engine is today; of the four provenance scales below, only the vault `content_hash` exists at HEAD. Provenance is the connective tissue threaded through the refactor's design at four scales — plan step ids, vault `content_hash`, flow-step `inputs`, and the loop's own `source_ref` — which is §6.2's output-provenance idea applied consistently, so a downstream edit can name the exact upstream source that produced it. On that substrate the curator gains an edit-source loop with the following design, taken verbatim where the paper is specific:

- **Trigger.** A human edit to a tracked output — detected as a content-hash change on a vault `.md` file, or an edit to a plan `.md`. Because the file-first refactor makes outputs files, the edit is a plain file diff (§3.4: every edit is a diff and is reversible).
- **Record.** Each detected edit writes a row to a new `curator_edit_diffs` table: the tracked `output_id`, the `source_ref` that produced it, the distinct `run_id`, before/after text, and a `diff_kind`.
- **Classification.** The edit is normalized into a `diff_kind` — `tightened_opening`, `tone_shift`, `length_trim`, `terminology`, `structure_reorder`, `constraint_added` — using existing text-similarity utilities, so "the same kind of thing" (§6.3) is caught by clustering rather than by literal-string identity.
- **Recurrence threshold: N = 3.** Grounded verbatim in §6.3's "three runs in a row". A recurring correction is three or more `curator_edit_diffs` rows sharing the same `source_ref` and `diff_kind` across three or more _distinct_ `run_id`s. All three conditions are required: same source, same kind, three separate runs — the distinct-run condition is what separates a durable signal from one session's fussiness.
- **Proposal.** Crossing the threshold emits an `EditSourceProposal` whose `proposedChange.type` maps to §6.3's three named remedies exactly: `contract_amendment`, `reference_update`, or `new_constraint`. It carries the evidence (the run ids and diff ids) and lands in `status: pending`.

**The hard rule is that proposals are never auto-applied.** There is no confidence level, no threshold, and no configuration flag that applies a source change automatically. Every proposal requires an explicit human action to ratify. This is doctrinal, not incidental: §6.3 notes that creative content is fuzzier than compiled code, and "sometimes the output needs a human touch that cannot be reduced to a source-level rule". Only a human can decide that a recurring pattern is a genuine source defect rather than a run of one-off touch-ups; auto-applying would let the system rewrite its own constraints from noise. The loop's job is to surface and suggest; the human decides and applies — the human-in-command posture the paper leans on (§2.3). Tracking is opt-in behind a default-off flag; _applying_ is never automatic regardless of the flag.

Two honesty notes carry over from §2. The N=3 threshold and the `diff_kind` taxonomy are design choices grounded in the paper's prose, not validated constants; per §4.6 they should be measured rather than assumed correct. And the paper's own caveat — that the diagnostic-versus-one-off distinction is real and sometimes irreducible — is the reason the human gate is mandatory rather than a convenience.

## 5. Positioning: complementary, not competing

ICM structures how a single workspace delivers context to a model across its stages (Layers 0–4, §3.2). Soleri is not a competing orchestrator; its own plans and vault are being refactored to adopt ICM's file-first discipline, not to replace it. The two systems meet cleanly at one layer.

**Layer 3 is the seam.** ICM Layer 3 — reference material, "what rules apply?" — is static files configured once at workspace setup and stable across runs (Table 2). Soleri's vault is a Layer 3 store with four properties a static folder does not have: it persists across workspaces and projects, it is searchable at 1,000+ entries, it decays and de-duplicates, and it carries pattern strength. An ICM workspace could point its `references/` at a Soleri vault, or seed them from it, and route its stage-output edits into the edit-source loop — thereby acquiring the §6.2 traceability and §6.3 learning loop the paper explicitly defers, without ICM's own folder having to grow the machinery that would turn it into a framework (§5.2).

The division of labour stays clean. Layers 0–2 and the stage sequencing remain the folder's job (§3.2); Soleri does not orchestrate ICM's stages. Soleri supplies the persistent, searchable, self-improving reference substrate under Layer 3, and the provenance and edit-source machinery under §6.2/§6.3. Everything in sections 1 and 3 above is Soleri _adopting_ from ICM. The single thing Soleri _adds_ that ICM names but does not have is the learning loop of section 4 — which the paper itself describes as the future work that would let workspaces "become systems that get better with use".

That is the whole claim, stated without embellishment: ICM is the interpretable, file-first context architecture; Soleri is a candidate Layer 3 memory and learning substrate for it, and the refactor now building the one loop ICM describes but has not yet built.

## References

- _Interpretable Context Methodology: Folder Structure as Agent Architecture_, 2603.16021v2. Sections cited: §3.1 (design principles), §3.2–3.3 (architecture, stage contracts), §3.4 (portability), §4.1 (model and environment), §4.6 (threats to validity), §5.1–5.2 (where it works / does not), §5.3–5.4 (observability, implications), §6.1 (incremental compilation), §6.2 (semantic debugging; output-provenance is one direction within it), §6.3 (source integrity and the edit-source principle). Figures: Fig 1 (layer hierarchy), Fig 3 (per-stage token composition), Fig 4 (pipeline flow with review gates), Fig 5 (edit U-shape). Tables: Table 1 (control-surface comparison), Table 2 (Layer 3 vs Layer 4).
- ICM binding design rulings — the six-work-item refactor (session diet, plans as markdown, ceremony opt-in, vault files-first, scoped flow context, edit-source loop).
- Engine context-window overhead measurement — the token figures in section 1.
