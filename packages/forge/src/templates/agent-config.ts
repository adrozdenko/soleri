/**
 * Generates a default agent-config.yaml for scaffolded agents.
 *
 * Declares capabilities, probes, and workflow → intent mappings consumed
 * by the Soleri engine at runtime.
 */
export function generateAgentConfig(agentId: string): { path: string; content: string } {
  return {
    path: 'agent-config.yaml',
    content: `id: ${agentId}
capabilities:
  - vault.search
  - vault.playbook
  - memory.search
  - brain.recommend
  - brain.strengths
  - plan.create
probes:
  - vault
  - brain
  - sessionStore
  - test
workflows:
  feature-dev: BUILD
  bug-fix: FIX
  code-review: REVIEW
  deliver: DELIVER
  plan: PLAN
  design: DESIGN
  explore: EXPLORE
`,
  };
}
