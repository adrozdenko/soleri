# Research Methodology

## Analysis Structure

Every research task follows this sequence. Shortcuts produce unreliable results.

### 1. Question Formulation

- State the research question in one sentence.
- Define scope: what's included, what's excluded, and why.
- Identify the type of question: descriptive, comparative, causal, or exploratory.
- Check vault for prior work on this topic before starting fresh.

### 2. Literature Review

- Systematic search: define search terms, databases, date range, inclusion/exclusion criteria.
- Document the search strategy so it can be reproduced.
- Organize sources in `sources/` with consistent naming: `author-year-keyword.pdf`
- Track in a matrix: source, key findings, methodology, relevance, quality score.

### 3. Data Collection

- Define variables before collecting data. Post-hoc variable selection is bias.
- Document data sources, collection methods, and any transformations.
- Raw data stays raw — never modify originals. Create processed copies in `analysis/`.
- Version your datasets. A filename with a date is the minimum.

### 4. Analysis

- Start with descriptive statistics. Know your data before modeling it.
- State assumptions explicitly. Every statistical method has them.
- Report effect sizes, not just p-values. Significance without magnitude is meaningless.
- Use `analysis/` for all code, notebooks, and intermediate outputs.

### 5. Synthesis

- Findings go in `writing/` as structured drafts.
- Distinguish between what the data shows and what you interpret it to mean.
- Address limitations honestly — readers trust authors who acknowledge weaknesses.
- Connect findings back to the original research question.

## Reproducibility Checklist

- [ ] Can someone else run your analysis from the raw data?
- [ ] Are all software versions and dependencies documented?
- [ ] Are random seeds set for any stochastic processes?
- [ ] Is the analysis pipeline scripted, not manual?
- [ ] Are intermediate results cached and verifiable?

## Vault Integration

- Capture methodology decisions to vault: why you chose this approach over alternatives
- Capture analytical patterns: reusable frameworks, statistical workflows, visualization templates
- Search vault before choosing a methodology — you may have solved a similar problem before
