import type { AgentConfig } from '../types.js';
import { getEngineRulesContent } from './shared-rules.js';

/**
 * Generate AGENTS.md content for OpenCode (primary host).
 *
 * This is the full instruction file — equivalent to what CLAUDE.md gets
 * via claude-md-template.ts + shared-rules.ts. OpenCode reads AGENTS.md
 * as its primary instruction file, so it must contain:
 *   1. Persistent identity (always-on, no activation needed)
 *   2. Full facade table (all 13+ semantic facades + domains)
 *   3. Engine rules (vault-first, planning, output formatting, etc.)
 *   4. Session start protocol
 *   5. Skills reference
 */
export function generateAgentsMd(config: AgentConfig): string {
  const bt = '`';
  const tp = config.id; // tool prefix
  const principles = config.principles.map((p) => `- ${p}`).join('\n');
  const domains = config.domains.map((d) => `- ${d}`).join('\n');

  // ─── Domain facade rows ───────────────────────────────────
  const domainRows = config.domains
    .map((d) => {
      const toolName = `${tp}_${d.replace(/-/g, '_')}`;
      return `| ${bt}${toolName}${bt} | ${bt}get_patterns${bt}, ${bt}search${bt}, ${bt}capture${bt} |`;
    })
    .join('\n');

  // ─── Engine rules (strip markers — AGENTS.md embeds them inline) ───
  const engineRules = getEngineRulesContent()
    .replace(/<!-- soleri:engine-rules -->\n?/, '')
    .replace(/<!-- \/soleri:engine-rules -->\n?/, '')
    .trim();

  return `# ${config.name}

## Identity

You ARE **${config.name}**. ${config.role}.

${config.description}

This identity is permanent — not activated by greeting, not deactivated by farewell.
Adopt this persona for every message. Your MCP tool prefix is ${bt}${tp}${bt}.

**Tone:** ${config.tone ?? 'pragmatic'}

**Domains:**
${domains}

**Principles:**
${principles}

## Adaptive Identity

${config.name} is not a fixed-role agent. The role above is a starting point — the agent evolves as knowledge is added.

When the user asks about your capabilities or you need to check what you've learned, use ${bt}${tp}_core op:activate${bt} to discover evolved capabilities.

## Session Start

Do NOT call any tools automatically on session start. Just greet the user in character.
Only call ${bt}${tp}_orchestrate op:session_start${bt} or ${bt}${tp}_core op:activate${bt} when you actually need project context or capability discovery — not on every message.

## Essential Tools

| Facade | Key Ops |
|--------|---------|
| ${bt}${tp}_core${bt} | ${bt}health${bt}, ${bt}search${bt}, ${bt}identity${bt}, ${bt}session_start${bt}, ${bt}activate${bt} |
${domainRows}
| ${bt}${tp}_vault${bt} | ${bt}search_intelligent${bt}, ${bt}capture_knowledge${bt}, ${bt}capture_quick${bt}, ${bt}search_feedback${bt} |
| ${bt}${tp}_vault${bt} (keeper) | ${bt}knowledge_audit${bt}, ${bt}knowledge_health${bt}, ${bt}knowledge_merge${bt}, ${bt}knowledge_reorganize${bt} |
| ${bt}${tp}_vault${bt} (mgmt) | ${bt}vault_get${bt}, ${bt}vault_update${bt}, ${bt}vault_remove${bt}, ${bt}vault_tags${bt}, ${bt}vault_domains${bt}, ${bt}vault_recent${bt} |
| ${bt}${tp}_curator${bt} | ${bt}curator_status${bt}, ${bt}curator_detect_duplicates${bt}, ${bt}curator_contradictions${bt}, ${bt}curator_groom_all${bt}, ${bt}curator_consolidate${bt}, ${bt}curator_health_audit${bt} |
| ${bt}${tp}_curator${bt} (advanced) | ${bt}curator_enrich${bt}, ${bt}curator_hybrid_contradictions${bt}, ${bt}curator_entry_history${bt}, ${bt}curator_queue_stats${bt} |
| ${bt}${tp}_plan${bt} | ${bt}create_plan${bt}, ${bt}approve_plan${bt}, ${bt}plan_split${bt}, ${bt}plan_reconcile${bt}, ${bt}plan_complete_lifecycle${bt} |
| ${bt}${tp}_orchestrate${bt} | ${bt}orchestrate_plan${bt}, ${bt}orchestrate_execute${bt}, ${bt}orchestrate_complete${bt} |
| ${bt}${tp}_brain${bt} | ${bt}brain_stats${bt}, ${bt}brain_feedback${bt}, ${bt}rebuild_vocabulary${bt}, ${bt}brain_strengths${bt}, ${bt}brain_recommend${bt} |
| ${bt}${tp}_memory${bt} | ${bt}memory_search${bt}, ${bt}memory_capture${bt}, ${bt}session_capture${bt} |
| ${bt}${tp}_control${bt} | ${bt}route_intent${bt}, ${bt}morph${bt}, ${bt}get_behavior_rules${bt}, ${bt}governance_dashboard${bt}, ${bt}governance_policy${bt} |
| ${bt}${tp}_loop${bt} | ${bt}loop_start${bt}, ${bt}loop_iterate${bt}, ${bt}loop_status${bt}, ${bt}loop_cancel${bt} |
| ${bt}${tp}_context${bt} | ${bt}context_extract_entities${bt}, ${bt}context_retrieve_knowledge${bt}, ${bt}context_analyze${bt} |
| ${bt}${tp}_agency${bt} | ${bt}agency_enable${bt}, ${bt}agency_status${bt}, ${bt}agency_surface_patterns${bt}, ${bt}agency_warnings${bt}, ${bt}agency_clarify${bt} |
| ${bt}${tp}_admin${bt} | ${bt}admin_health${bt}, ${bt}admin_tool_list${bt}, ${bt}admin_diagnostic${bt} |

> Full list: ${bt}${tp}_admin op:admin_tool_list${bt}

## Skills

- Local skills live in ${bt}skills/<skill>/SKILL.md${bt}.
- If a user explicitly names a skill, open that ${bt}SKILL.md${bt} and follow it for that turn.

${engineRules}
`;
}
