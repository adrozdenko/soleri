/**
 * Terse Mode Token Benchmark v3
 *
 * Compares original vs enhanced terse system prompts against a normal baseline.
 * Runs identical prompts through `claude -p`, compares output_tokens, then
 * runs an LLM-as-judge quality evaluation to measure information loss.
 *
 * Usage:
 *   npx tsx scripts/benchmark-terse.ts                       # all variants, full level
 *   npx tsx scripts/benchmark-terse.ts --level ultra         # ultra level
 *   npx tsx scripts/benchmark-terse.ts --variant v2          # only v2 vs normal
 *   npx tsx scripts/benchmark-terse.ts --skip-quality        # token counts only, no judge
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Config ──────────────────────────────────────────────────────────────────

const TERSE_LEVEL = process.argv.includes("--level")
	? process.argv[process.argv.indexOf("--level") + 1]!
	: "full";

const VARIANT_FILTER = process.argv.includes("--variant")
	? process.argv[process.argv.indexOf("--variant") + 1]!
	: "all";

const SKIP_QUALITY = process.argv.includes("--skip-quality");

// ── V1: Original terse prompts (cosmetic compression) ───────────────────────

const V1_SYSTEM: Record<string, string> = {
	lite: `TERSE MODE ACTIVE — level: lite

Respond terse. All technical substance stays. Only fluff dies.

Rules: No filler/hedging. Keep articles + full sentences. Professional but tight.
Drop: filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging.
Keep: articles (a/an/the), complete sentence structure.
Technical terms exact. Code blocks unchanged. Errors quoted exact.`,

	full: `TERSE MODE ACTIVE — level: full

Respond terse. All technical substance stays. Only fluff dies.

Rules: Drop articles (a/an/the), fragments OK, short synonyms.
Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), hedging.
Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for").
Technical terms exact. Code blocks unchanged. Errors quoted exact.

Pattern: [thing] [action] [reason]. [next step].

Not: "Sure! I'd be happy to help you with that. The issue you're experiencing is likely caused by..."
Yes: "Bug in auth middleware. Token expiry check use < not <=. Fix:"`,

	ultra: `TERSE MODE ACTIVE — level: ultra

Respond terse. All technical substance stays. Only fluff dies.

Rules: Abbreviate (DB/auth/config/req/res/fn/impl), strip conjunctions, arrows for causality (X -> Y), one word when one word enough.
Drop: articles, filler, pleasantries, hedging, conjunctions where possible.
Fragments mandatory. Abbreviate freely. Arrows for causality.
Technical terms exact. Code blocks unchanged. Errors quoted exact.`,
};

// ── V2: Enhanced terse prompts (structural compression) ─────────────────────

const V2_SYSTEM: Record<string, string> = {
	lite: `You are in TERSE mode (lite). Strict output rules:

BUDGET: Max 100 words per response. If a code block is needed, the 100-word limit applies to prose only.
STRUCTURE: No markdown headers. No bullet lists unless the question asks for a list. Plain prose paragraphs.
COMPLETENESS: Answer the direct question. Do not cover edge cases, alternatives, or caveats unless explicitly asked.
NEVER: Restate the question. Summarize what you said. Add "hope this helps" or any closing line. Use filler words (just, really, basically, actually, simply, certainly).
CODE: If showing code, show only the relevant lines. No boilerplate, no imports unless critical.

Example — user asks "Why does useState cause re-renders?"
Bad (verbose): "Great question! In React, when you call the setter function returned by useState, it triggers a re-render of the component. This happens because React needs to reconcile the virtual DOM with the new state. There are several common causes..."
Good (terse): "Calling the setter schedules a re-render. React re-renders the entire component, not just the changed part. If props haven't changed but parent re-renders, child re-renders too. Fix with React.memo or useMemo for expensive computations."`,

	full: `You are in TERSE mode (full). Strict output rules:

BUDGET: Max 60 words per response. Code blocks are exempt from the word count.
STRUCTURE: No markdown headers (#/##/###). No bullet lists. No numbered lists. Dense prose or single code block.
COMPLETENESS: Core answer only. One cause, one fix. No alternatives, no edge cases, no "also consider".
NEVER: Restate the question. Add introductions or conclusions. Use filler, hedging, or pleasantries. Explain what you're about to do. Explain what you just did.
FRAGMENTS OK: Drop articles (a/an/the). Sentence fragments fine. Shorter is better.
CODE: Minimal diff only. No surrounding context. No comments unless non-obvious.

Example — user asks "Fix my CORS error localhost:3000 to localhost:4000"
Bad: "The CORS error occurs because your browser enforces the same-origin policy. When your React frontend at localhost:3000 tries to make requests to your Express API at localhost:4000, the browser blocks it because they're different origins. Here's how to fix it..."
Good: "Install cors package. Add \`app.use(cors({ origin: 'http://localhost:3000' }))\` before routes."`,

	ultra: `TERSE MODE: ULTRA. Absolute minimum tokens.

BUDGET: Max 30 words. Code blocks exempt.
FORMAT: No markdown. No lists. No headers. One to three raw sentences max.
SCOPE: Single direct answer. Zero context, zero explanation, zero alternatives.
NEVER: Restate question. Intro/outro. Filler. Hedging. Articles. Conjunctions where droppable.
ABBREVIATE: DB, auth, config, req, res, fn, impl, dep, pkg, env, var, arg, param, ret, err, msg, obj, arr, str, num, bool, cb, async, sync.
CAUSALITY: Use arrows. X -> Y -> Z.

Example — "Why React re-render?"
"New ref each render -> reconciliation. Wrap obj props in useMemo."

Example — "Fix CORS localhost:3000 to :4000"
"\`app.use(cors({ origin: 'http://localhost:3000' }))\`"`,
};

// ── V3: Priority-aware terse prompts (gotcha-preserving compression) ───────

const V3_SYSTEM: Record<string, string> = {
	lite: `You are in TERSE mode (lite). Strict output rules:

BUDGET: Max 100 words prose. Code blocks exempt from count.
STRUCTURE: No markdown headers. No bullet lists unless question asks for one. Plain prose.
NEVER: Restate the question. Summarize what you said. Closing lines. Filler words (just, really, basically, actually, simply, certainly).
CODE: Only relevant lines. No boilerplate, no imports unless critical. Must be correct if copy-pasted.

PRIORITY ORDER (spend budget here first):
1. Direct answer
2. Working code if fix requested
3. The #1 gotcha that would bite someone following your answer naively
4. Nothing else`,

	full: `You are in TERSE mode (full). Strict output rules:

BUDGET: 60-80 words prose. Code blocks exempt from count.
STRUCTURE: No markdown headers. No bullet lists. Dense prose. One code block max unless comparing before/after.
FRAGMENTS OK: Drop articles (a/an/the). Sentence fragments fine. Shorter is better.
NEVER: Restate the question. Introductions or conclusions. Filler, hedging, pleasantries. Explain what you're about to do or just did. "Also consider", "it's worth noting", "keep in mind".

PRIORITY ORDER (spend your word budget here first):
1. Direct answer to the question
2. Working code if asked for a fix (must be correct — never show code that silently fails)
3. The #1 gotcha that would bite someone who follows your answer naively
4. Nothing else

CODE SAFETY: Every code snippet must actually work if copy-pasted. If a method doesn't support a pattern (e.g. glob in del()), don't write it. Correctness over brevity.

Example — "Fix my CORS error localhost:3000 to localhost:4000"
Bad: "The CORS error occurs because your browser enforces the same-origin policy. When your React frontend..."
Good: "Install cors. \`app.use(cors({ origin: 'http://localhost:3000' }))\` before routes. Gotcha: if using cookies, add \`credentials: true\` and set \`withCredentials\` on client fetch/axios."`,

	ultra: `TERSE MODE: ULTRA. Absolute minimum tokens.

BUDGET: 30-40 words prose. Code blocks exempt.
FORMAT: No markdown. No lists. No headers. One to three raw sentences max.
NEVER: Restate question. Intro/outro. Filler. Hedging. Articles. Conjunctions where droppable.
ABBREVIATE: DB, auth, config, req, res, fn, impl, dep, pkg, env, var, arg, param, ret, err, msg, obj, arr, str, num, bool, cb, async, sync.
CAUSALITY: Use arrows. X -> Y -> Z.
PRIORITY: Answer first. Then #1 gotcha if room. Code must be correct.

Example — "Fix CORS localhost:3000 to :4000"
"\`app.use(cors({ origin: 'http://localhost:3000' }))\` before routes. Gotcha: credentials:true needs client withCredentials."`,
};

const NORMAL_SYSTEM =
	"You are a helpful coding assistant. Answer clearly and thoroughly.";

// ── Quality judge system prompt ─────────────────────────────────────────────

const JUDGE_SYSTEM = `You are a strict technical quality evaluator. You will receive:
1. A technical QUESTION
2. A REFERENCE answer (thorough, complete)
3. A CANDIDATE answer (compressed/terse)

Your job: evaluate whether the CANDIDATE preserves the critical information from the REFERENCE.

Score the CANDIDATE on three dimensions (each 1-10):

CORRECTNESS: Is every claim in the candidate factually correct? Deduct for wrong statements, misleading simplifications, or incorrect code. A short but correct answer scores high.

COMPLETENESS: Does the candidate cover the key actionable information needed to solve the problem? Compare against reference. Score based on what matters for execution:
- 10: All critical info preserved
- 7-9: Minor details missing that wouldn't block someone
- 4-6: Missing info that could cause confusion or extra round-trips
- 1-3: Critical information lost — would lead to wrong action

ACTIONABILITY: Could someone act on the candidate answer alone without needing to ask follow-up questions? Does it contain enough to actually do the thing?

Then list CRITICAL LOSSES — specific pieces of information present in the reference but missing from the candidate that could matter for execution. Categorize each as:
- CRITICAL: Would cause bugs, security issues, or wrong approach
- USEFUL: Good to know, saves time, but not blocking
- COSMETIC: Nice to have, educational, but zero impact on execution

Respond in this exact JSON format, nothing else:
{
  "correctness": <1-10>,
  "completeness": <1-10>,
  "actionability": <1-10>,
  "overall": <1-10>,
  "losses": [
    { "severity": "critical|useful|cosmetic", "detail": "what was lost" }
  ],
  "verdict": "safe|caution|unsafe"
}

verdict rules:
- "safe": overall >= 7 AND no critical losses
- "caution": overall >= 5 OR has 1 critical loss
- "unsafe": overall < 5 OR has 2+ critical losses`;

// ── Test prompts ────────────────────────────────────────────────────────────

interface TestPrompt {
	label: string;
	category: "explain" | "debug" | "review" | "plan" | "howto";
	message: string;
}

const TEST_PROMPTS: TestPrompt[] = [
	{
		label: "Explain: React re-renders",
		category: "explain",
		message:
			"Why does this React component re-render on every state update even though the props haven't changed? Explain the common causes and fixes.",
	},
	{
		label: "Explain: DB connection pooling",
		category: "explain",
		message:
			"Explain database connection pooling. When should I use it, what are the tradeoffs, and how do I configure it in PostgreSQL?",
	},
	{
		label: "Debug: Node memory leak",
		category: "debug",
		message:
			"My Node.js Express server's memory usage keeps growing over time until it crashes with OOM. What are the most common causes and how do I diagnose which one it is?",
	},
	{
		label: "Debug: CORS error",
		category: "debug",
		message:
			"I'm getting 'Access-Control-Allow-Origin' errors when my React frontend at localhost:3000 calls my Express API at localhost:4000. How do I fix this?",
	},
	{
		label: "Review: auth middleware",
		category: "review",
		message: `Review this Express middleware for security issues:

\`\`\`typescript
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
\`\`\``,
	},
	{
		label: "Plan: add caching layer",
		category: "plan",
		message:
			"I need to add a Redis caching layer to my Express API. The API serves product data from PostgreSQL. Walk me through the implementation approach.",
	},
	{
		label: "Howto: Git rebase vs merge",
		category: "howto",
		message:
			"When should I use git rebase vs git merge? What are the risks of each?",
	},
	{
		label: "Howto: TypeScript generics",
		category: "howto",
		message:
			"How do TypeScript generics work? Show me practical examples beyond the basic identity function.",
	},
];

// ── Runner ──────────────────────────────────────────────────────────────────

interface PromptRun {
	label: string;
	category: string;
	tokens: number;
	response: string;
}

interface ClaudeResponse {
	result: string;
	is_error: boolean;
	usage: {
		output_tokens: number;
		input_tokens: number;
	};
	total_cost_usd: number;
}

function runClaude(systemPrompt: string, userMessage: string): ClaudeResponse {
	const args = [
		"-p",
		"--output-format",
		"json",
		"--max-turns",
		"1",
		"--system-prompt",
		systemPrompt,
	];

	let raw: string;
	try {
		raw = execFileSync("claude", args, {
			input: userMessage,
			encoding: "utf-8",
			timeout: 120_000,
			maxBuffer: 10 * 1024 * 1024,
		});
	} catch (err: any) {
		if (err.stdout) {
			raw = err.stdout;
		} else {
			throw err;
		}
	}

	const parsed = JSON.parse(raw);
	if (parsed.is_error) {
		throw new Error(`claude -p error: ${parsed.result}`);
	}
	return parsed;
}

interface VariantData {
	name: string;
	runs: PromptRun[];
	totalCost: number;
}

function runVariant(name: string, systemPrompt: string): VariantData {
	const runs: PromptRun[] = [];
	let totalCost = 0;

	for (let i = 0; i < TEST_PROMPTS.length; i++) {
		const prompt = TEST_PROMPTS[i];
		process.stdout.write(
			`  ${name.padEnd(8)} [${i + 1}/${TEST_PROMPTS.length}] ${prompt.label}...`,
		);

		const resp = runClaude(systemPrompt, prompt.message);
		totalCost += resp.total_cost_usd;

		runs.push({
			label: prompt.label,
			category: prompt.category,
			tokens: resp.usage.output_tokens,
			response: resp.result,
		});

		console.log(` ${resp.usage.output_tokens} tok`);
	}

	return { name, runs, totalCost };
}

// ── Quality judge ───────────────────────────────────────────────────────────

interface QualityScore {
	correctness: number;
	completeness: number;
	actionability: number;
	overall: number;
	losses: Array<{ severity: "critical" | "useful" | "cosmetic"; detail: string }>;
	verdict: "safe" | "caution" | "unsafe";
}

interface QualityResult {
	label: string;
	score: QualityScore;
	judgeCost: number;
}

function judgeQuality(
	question: string,
	reference: string,
	candidate: string,
): { score: QualityScore; cost: number } {
	const judgeMessage = `QUESTION:
${question}

REFERENCE ANSWER:
${reference}

CANDIDATE ANSWER:
${candidate}`;

	const resp = runClaude(JUDGE_SYSTEM, judgeMessage);

	// Extract JSON from response — model might wrap it in markdown
	let jsonStr = resp.result.trim();
	const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
	if (jsonMatch) {
		jsonStr = jsonMatch[0];
	}

	try {
		const score = JSON.parse(jsonStr) as QualityScore;
		return { score, cost: resp.total_cost_usd };
	} catch {
		// Fallback if judge output isn't clean JSON
		return {
			score: {
				correctness: 0,
				completeness: 0,
				actionability: 0,
				overall: 0,
				losses: [{ severity: "critical", detail: `Judge parse error: ${jsonStr.slice(0, 100)}` }],
				verdict: "unsafe",
			},
			cost: resp.total_cost_usd,
		};
	}
}

function runQualityEval(
	normalData: VariantData,
	terseData: VariantData,
): QualityResult[] {
	const results: QualityResult[] = [];

	for (let i = 0; i < TEST_PROMPTS.length; i++) {
		const prompt = TEST_PROMPTS[i];
		process.stdout.write(
			`  judge  [${i + 1}/${TEST_PROMPTS.length}] ${prompt.label}...`,
		);

		const { score, cost } = judgeQuality(
			prompt.message,
			normalData.runs[i].response,
			terseData.runs[i].response,
		);

		results.push({ label: prompt.label, score, judgeCost: cost });
		console.log(
			` ${score.verdict} (C:${score.correctness} Q:${score.completeness} A:${score.actionability} = ${score.overall})`,
		);
	}

	return results;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
	const v1System = V1_SYSTEM[TERSE_LEVEL];
	const v2System = V2_SYSTEM[TERSE_LEVEL];
	const v3System = V3_SYSTEM[TERSE_LEVEL];

	if (!v1System || !v2System || !v3System) {
		console.error(
			`Error: unknown level "${TERSE_LEVEL}". Use: lite, full, ultra`,
		);
		process.exit(1);
	}

	const variantMap: Record<string, string[]> = {
		v1: ["normal", "v1"],
		v2: ["normal", "v2"],
		v3: ["normal", "v3"],
		"v2,v3": ["normal", "v2", "v3"],
		all: ["normal", "v1", "v2", "v3"],
	};
	const variants = variantMap[VARIANT_FILTER] ?? ["normal", "v1", "v2", "v3"];

	const genCalls = TEST_PROMPTS.length * variants.length;
	const judgeCalls = SKIP_QUALITY
		? 0
		: TEST_PROMPTS.length * (variants.length - 1); // judge each terse variant
	const totalCalls = genCalls + judgeCalls;

	console.log(`\n╔══════════════════════════════════════════════════════════╗`);
	console.log(`║             Terse Mode Benchmark v3                      ║`);
	console.log(`║             Token Reduction + Quality                    ║`);
	console.log(`╠══════════════════════════════════════════════════════════╣`);
	console.log(`║  Level:      ${TERSE_LEVEL.padEnd(43)}║`);
	console.log(`║  Variants:   ${variants.join(", ").padEnd(43)}║`);
	console.log(`║  Prompts:    ${String(TEST_PROMPTS.length).padEnd(43)}║`);
	console.log(`║  Gen calls:  ${String(genCalls).padEnd(43)}║`);
	console.log(
		`║  Judge calls: ${String(judgeCalls).padEnd(42)}║`,
	);
	console.log(`║  Total calls: ${String(totalCalls).padEnd(42)}║`);
	console.log(`╚══════════════════════════════════════════════════════════╝\n`);

	// ── Phase 1: Generate responses ─────────────────────────────────────────

	console.log("━━ PHASE 1: GENERATE RESPONSES ━━\n");

	const allVariants: VariantData[] = [];

	if (variants.includes("normal")) {
		console.log("── normal (baseline) ──");
		allVariants.push(runVariant("normal", NORMAL_SYSTEM));
		console.log();
	}
	if (variants.includes("v1")) {
		console.log("── v1 (original terse) ──");
		allVariants.push(runVariant("v1", v1System));
		console.log();
	}
	if (variants.includes("v2")) {
		console.log("── v2 (enhanced terse) ──");
		allVariants.push(runVariant("v2", v2System));
		console.log();
	}
	if (variants.includes("v3")) {
		console.log("── v3 (priority-aware terse) ──");
		allVariants.push(runVariant("v3", v3System));
		console.log();
	}

	const normal = allVariants.find((v) => v.name === "normal")!;
	const v1 = allVariants.find((v) => v.name === "v1");
	const v2 = allVariants.find((v) => v.name === "v2");
	const v3 = allVariants.find((v) => v.name === "v3");

	// ── Phase 1 results: Token comparison ───────────────────────────────────

	console.log(`${"═".repeat(92)}`);
	console.log("TOKEN COMPARISON\n");

	const labelWidth = Math.max(
		...TEST_PROMPTS.map((p) => p.label.length),
		12,
	);

	let header = `  ${"Prompt".padEnd(labelWidth)}  ${"Normal".padStart(8)}`;
	if (v1) header += `  ${"V1".padStart(8)}  ${"V1 %".padStart(8)}`;
	if (v2) header += `  ${"V2".padStart(8)}  ${"V2 %".padStart(8)}`;
	if (v3) header += `  ${"V3".padStart(8)}  ${"V3 %".padStart(8)}`;
	console.log(header);

	let sep = `  ${"─".repeat(labelWidth)}  ${"─".repeat(8)}`;
	if (v1) sep += `  ${"─".repeat(8)}  ${"─".repeat(8)}`;
	if (v2) sep += `  ${"─".repeat(8)}  ${"─".repeat(8)}`;
	if (v3) sep += `  ${"─".repeat(8)}  ${"─".repeat(8)}`;
	console.log(sep);

	for (let i = 0; i < TEST_PROMPTS.length; i++) {
		const nTok = normal.runs[i].tokens;
		let row = `  ${TEST_PROMPTS[i].label.padEnd(labelWidth)}  ${String(nTok).padStart(8)}`;

		if (v1) {
			const t = v1.runs[i].tokens;
			const pct = nTok > 0 ? (((nTok - t) / nTok) * 100).toFixed(1) + "%" : "—";
			row += `  ${String(t).padStart(8)}  ${pct.padStart(8)}`;
		}
		if (v2) {
			const t = v2.runs[i].tokens;
			const pct = nTok > 0 ? (((nTok - t) / nTok) * 100).toFixed(1) + "%" : "—";
			row += `  ${String(t).padStart(8)}  ${pct.padStart(8)}`;
		}
		if (v3) {
			const t = v3.runs[i].tokens;
			const pct = nTok > 0 ? (((nTok - t) / nTok) * 100).toFixed(1) + "%" : "—";
			row += `  ${String(t).padStart(8)}  ${pct.padStart(8)}`;
		}
		console.log(row);
	}

	console.log(sep);

	const nTotal = normal.runs.reduce((s, r) => s + r.tokens, 0);
	const v1Total = v1 ? v1.runs.reduce((s, r) => s + r.tokens, 0) : 0;
	const v2Total = v2 ? v2.runs.reduce((s, r) => s + r.tokens, 0) : 0;
	const v3Total = v3 ? v3.runs.reduce((s, r) => s + r.tokens, 0) : 0;

	let totRow = `  ${"TOTAL".padEnd(labelWidth)}  ${String(nTotal).padStart(8)}`;
	if (v1) {
		const pct = (((nTotal - v1Total) / nTotal) * 100).toFixed(1) + "%";
		totRow += `  ${String(v1Total).padStart(8)}  ${pct.padStart(8)}`;
	}
	if (v2) {
		const pct = (((nTotal - v2Total) / nTotal) * 100).toFixed(1) + "%";
		totRow += `  ${String(v2Total).padStart(8)}  ${pct.padStart(8)}`;
	}
	if (v3) {
		const pct = (((nTotal - v3Total) / nTotal) * 100).toFixed(1) + "%";
		totRow += `  ${String(v3Total).padStart(8)}  ${pct.padStart(8)}`;
	}
	console.log(totRow);

	// ── Phase 2: Quality evaluation ─────────────────────────────────────────

	const qualityResults: Record<string, QualityResult[]> = {};
	let totalJudgeCost = 0;

	if (!SKIP_QUALITY) {
		console.log(`\n\n━━ PHASE 2: QUALITY EVALUATION (LLM-as-judge) ━━\n`);

		if (v1) {
			console.log("── Judging v1 vs normal ──");
			const v1Quality = runQualityEval(normal, v1);
			qualityResults.v1 = v1Quality;
			totalJudgeCost += v1Quality.reduce((s, r) => s + r.judgeCost, 0);
			console.log();
		}

		if (v2) {
			console.log("── Judging v2 vs normal ──");
			const v2Quality = runQualityEval(normal, v2);
			qualityResults.v2 = v2Quality;
			totalJudgeCost += v2Quality.reduce((s, r) => s + r.judgeCost, 0);
			console.log();
		}

		if (v3) {
			console.log("── Judging v3 vs normal ──");
			const v3Quality = runQualityEval(normal, v3);
			qualityResults.v3 = v3Quality;
			totalJudgeCost += v3Quality.reduce((s, r) => s + r.judgeCost, 0);
			console.log();
		}

		// ── Quality comparison table ────────────────────────────────────────

		console.log(`${"═".repeat(92)}`);
		console.log("QUALITY COMPARISON\n");

		let qHeader = `  ${"Prompt".padEnd(labelWidth)}`;
		if (v1) qHeader += `  ${"V1 Ovr".padStart(8)}  ${"V1 Vrd".padStart(8)}`;
		if (v2) qHeader += `  ${"V2 Ovr".padStart(8)}  ${"V2 Vrd".padStart(8)}`;
		if (v3) qHeader += `  ${"V3 Ovr".padStart(8)}  ${"V3 Vrd".padStart(8)}`;
		console.log(qHeader);

		let qSep = `  ${"─".repeat(labelWidth)}`;
		if (v1) qSep += `  ${"─".repeat(8)}  ${"─".repeat(8)}`;
		if (v2) qSep += `  ${"─".repeat(8)}  ${"─".repeat(8)}`;
		if (v3) qSep += `  ${"─".repeat(8)}  ${"─".repeat(8)}`;
		console.log(qSep);

		for (let i = 0; i < TEST_PROMPTS.length; i++) {
			let row = `  ${TEST_PROMPTS[i].label.padEnd(labelWidth)}`;
			if (qualityResults.v1) {
				const q = qualityResults.v1[i].score;
				row += `  ${String(q.overall + "/10").padStart(8)}  ${q.verdict.padStart(8)}`;
			}
			if (qualityResults.v2) {
				const q = qualityResults.v2[i].score;
				row += `  ${String(q.overall + "/10").padStart(8)}  ${q.verdict.padStart(8)}`;
			}
			if (qualityResults.v3) {
				const q = qualityResults.v3[i].score;
				row += `  ${String(q.overall + "/10").padStart(8)}  ${q.verdict.padStart(8)}`;
			}
			console.log(row);
		}

		console.log(qSep);

		// Averages
		let avgRow = `  ${"AVERAGE".padEnd(labelWidth)}`;
		if (qualityResults.v1) {
			const avg = (
				qualityResults.v1.reduce((s, r) => s + r.score.overall, 0) /
				qualityResults.v1.length
			).toFixed(1);
			avgRow += `  ${(avg + "/10").padStart(8)}  ${"".padStart(8)}`;
		}
		if (qualityResults.v2) {
			const avg = (
				qualityResults.v2.reduce((s, r) => s + r.score.overall, 0) /
				qualityResults.v2.length
			).toFixed(1);
			avgRow += `  ${(avg + "/10").padStart(8)}  ${"".padStart(8)}`;
		}
		if (qualityResults.v3) {
			const avg = (
				qualityResults.v3.reduce((s, r) => s + r.score.overall, 0) /
				qualityResults.v3.length
			).toFixed(1);
			avgRow += `  ${(avg + "/10").padStart(8)}  ${"".padStart(8)}`;
		}
		console.log(avgRow);

		// Detailed quality breakdown
		console.log(`\nDetailed scores (Correctness / Completeness / Actionability):`);

		for (let i = 0; i < TEST_PROMPTS.length; i++) {
			console.log(`\n  ${TEST_PROMPTS[i].label}:`);

			if (qualityResults.v1) {
				const q = qualityResults.v1[i].score;
				console.log(
					`    V1: C:${q.correctness}/10  Q:${q.completeness}/10  A:${q.actionability}/10  → ${q.verdict}`,
				);
				if (q.losses.length > 0) {
					for (const loss of q.losses) {
						const icon =
							loss.severity === "critical"
								? "!!"
								: loss.severity === "useful"
									? " >"
									: " ~";
						console.log(
							`        ${icon} [${loss.severity}] ${loss.detail}`,
						);
					}
				}
			}

			if (qualityResults.v2) {
				const q = qualityResults.v2[i].score;
				console.log(
					`    V2: C:${q.correctness}/10  Q:${q.completeness}/10  A:${q.actionability}/10  → ${q.verdict}`,
				);
				if (q.losses.length > 0) {
					for (const loss of q.losses) {
						const icon =
							loss.severity === "critical"
								? "!!"
								: loss.severity === "useful"
									? " >"
									: " ~";
						console.log(
							`        ${icon} [${loss.severity}] ${loss.detail}`,
						);
					}
				}
			}

			if (qualityResults.v3) {
				const q = qualityResults.v3[i].score;
				console.log(
					`    V3: C:${q.correctness}/10  Q:${q.completeness}/10  A:${q.actionability}/10  → ${q.verdict}`,
				);
				if (q.losses.length > 0) {
					for (const loss of q.losses) {
						const icon =
							loss.severity === "critical"
								? "!!"
								: loss.severity === "useful"
									? " >"
									: " ~";
						console.log(
							`        ${icon} [${loss.severity}] ${loss.detail}`,
						);
					}
				}
			}
		}

		// Loss summary
		console.log(`\nLoss severity summary:`);
		for (const [variant, results] of Object.entries(qualityResults)) {
			const allLosses = results.flatMap((r) => r.score.losses);
			const critical = allLosses.filter((l) => l.severity === "critical").length;
			const useful = allLosses.filter((l) => l.severity === "useful").length;
			const cosmetic = allLosses.filter((l) => l.severity === "cosmetic").length;
			const verdicts = results.map((r) => r.score.verdict);
			const safe = verdicts.filter((v) => v === "safe").length;
			const caution = verdicts.filter((v) => v === "caution").length;
			const unsafe = verdicts.filter((v) => v === "unsafe").length;

			console.log(
				`  ${variant.toUpperCase()}: ${critical} critical, ${useful} useful, ${cosmetic} cosmetic losses | ${safe} safe, ${caution} caution, ${unsafe} unsafe`,
			);
		}
	}

	// ── Final verdict ───────────────────────────────────────────────────────

	console.log(`\n${"═".repeat(92)}`);
	console.log("FINAL VERDICT\n");

	const totalCost =
		allVariants.reduce((s, v) => s + v.totalCost, 0) + totalJudgeCost;

	// Print token reduction for all available variants
	const terseVariants = [
		v1 && { name: "V1 (original)", pct: ((nTotal - v1Total) / nTotal) * 100 },
		v2 && { name: "V2 (enhanced)", pct: ((nTotal - v2Total) / nTotal) * 100 },
		v3 && { name: "V3 (priority)", pct: ((nTotal - v3Total) / nTotal) * 100 },
	].filter(Boolean) as Array<{ name: string; pct: number }>;

	if (terseVariants.length > 0) {
		console.log(`  Token reduction:`);
		for (const tv of terseVariants) {
			console.log(`    ${tv.name}: ${tv.pct.toFixed(1)}%`);
		}
		if (terseVariants.length >= 2) {
			const best = terseVariants.reduce((a, b) => a.pct > b.pct ? a : b);
			const worst = terseVariants.reduce((a, b) => a.pct < b.pct ? a : b);
			console.log(
				`    Best vs worst: +${(best.pct - worst.pct).toFixed(1)} pp (${best.name})`,
			);
		}

		if (!SKIP_QUALITY) {
			console.log(`\n  Quality:`);
			for (const [variant, results] of Object.entries(qualityResults)) {
				const avg =
					results.reduce((s, r) => s + r.score.overall, 0) / results.length;
				const critical = results
					.flatMap((r) => r.score.losses)
					.filter((l) => l.severity === "critical").length;
				const unsafeCount = results.filter(
					(r) => r.score.verdict === "unsafe",
				).length;
				console.log(
					`    ${variant.toUpperCase()} avg quality: ${avg.toFixed(1)}/10 | ${critical} critical | ${unsafeCount} unsafe`,
				);
			}

			// Per-variant verdict
			for (const [variant, results] of Object.entries(qualityResults)) {
				const tv = terseVariants.find((t) => t.name.toLowerCase().includes(variant));
				if (!tv) continue;
				const avg =
					results.reduce((s, r) => s + r.score.overall, 0) / results.length;
				const unsafeCount = results.filter(
					(r) => r.score.verdict === "unsafe",
				).length;

				let verdict: string;
				if (tv.pct >= 50 && avg >= 7 && unsafeCount === 0) {
					verdict = `RECOMMENDED — ${tv.pct.toFixed(0)}% reduction with ${avg.toFixed(1)}/10 quality`;
				} else if (tv.pct >= 40 && avg >= 6) {
					verdict = `ACCEPTABLE — ${tv.pct.toFixed(0)}% reduction, quality ${avg.toFixed(1)}/10 (some info loss)`;
				} else if (avg < 6 || unsafeCount > 0) {
					verdict = `NOT RECOMMENDED — quality too low (${avg.toFixed(1)}/10, ${unsafeCount} unsafe)`;
				} else {
					verdict = `MARGINAL — ${tv.pct.toFixed(0)}% reduction, ${avg.toFixed(1)}/10 quality`;
				}
				console.log(`\n  ${variant.toUpperCase()} verdict: ${verdict}`);
			}
		}
	}

	console.log(`\n  Total API cost: $${totalCost.toFixed(4)}`);
	console.log(`${"═".repeat(92)}\n`);

	// ── JSON output ─────────────────────────────────────────────────────────

	const jsonOut = {
		version: 3,
		runner: "claude -p",
		terseLevel: TERSE_LEVEL,
		variantsRun: variants,
		qualityEnabled: !SKIP_QUALITY,
		timestamp: new Date().toISOString(),
		prompts: TEST_PROMPTS.map((p) => ({
			label: p.label,
			category: p.category,
			message: p.message,
		})),
		variants: Object.fromEntries(
			allVariants.map((v) => [
				v.name,
				{
					totalTokens: v.runs.reduce((s, r) => s + r.tokens, 0),
					perPrompt: v.runs.map((r) => ({
						label: r.label,
						tokens: r.tokens,
						response: r.response,
					})),
					cost: v.totalCost,
				},
			]),
		),
		quality: Object.fromEntries(
			Object.entries(qualityResults).map(([variant, results]) => [
				variant,
				results.map((r) => ({
					label: r.label,
					...r.score,
					judgeCost: r.judgeCost,
				})),
			]),
		),
		summary: {
			normalTotal: nTotal,
			...(v1 && {
				v1Total,
				v1ReductionPct: parseFloat(
					(((nTotal - v1Total) / nTotal) * 100).toFixed(1),
				),
			}),
			...(v2 && {
				v2Total,
				v2ReductionPct: parseFloat(
					(((nTotal - v2Total) / nTotal) * 100).toFixed(1),
				),
			}),
			...(v3 && {
				v3Total,
				v3ReductionPct: parseFloat(
					(((nTotal - v3Total) / nTotal) * 100).toFixed(1),
				),
			}),
			...(qualityResults.v1 && {
				v1AvgQuality: parseFloat(
					(
						qualityResults.v1.reduce((s, r) => s + r.score.overall, 0) /
						qualityResults.v1.length
					).toFixed(1),
				),
			}),
			...(qualityResults.v2 && {
				v2AvgQuality: parseFloat(
					(
						qualityResults.v2.reduce((s, r) => s + r.score.overall, 0) /
						qualityResults.v2.length
					).toFixed(1),
				),
			}),
			...(qualityResults.v3 && {
				v3AvgQuality: parseFloat(
					(
						qualityResults.v3.reduce((s, r) => s + r.score.overall, 0) /
						qualityResults.v3.length
					).toFixed(1),
				),
			}),
			totalCostUsd: parseFloat(totalCost.toFixed(4)),
		},
	};

	const outDir = resolve(import.meta.dirname ?? ".", "..");
	const variantSuffix = VARIANT_FILTER !== "all" ? `-${VARIANT_FILTER}` : "";
	const outPath = resolve(
		outDir,
		`scripts/benchmark-terse-results-${TERSE_LEVEL}${variantSuffix}-v3.json`,
	);
	writeFileSync(outPath, JSON.stringify(jsonOut, null, 2) + "\n");
	console.log(`Results written to ${outPath}`);
}

main();
