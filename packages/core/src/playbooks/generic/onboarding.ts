/**
 * Generic Playbook: New User Onboarding
 *
 * Guides first-time users through the agent's capabilities.
 * Activates when vault is empty or user asks "what can you do?"
 */

import type { PlaybookDefinition } from '../playbook-types.js';

export const onboardingPlaybook: PlaybookDefinition = {
  id: 'generic-onboarding',
  tier: 'generic',
  title: 'New User Onboarding',
  trigger:
    'Use when the user is new (vault is empty, no session history) or when they ask "what can you do?", "how do I use you?", "help", "getting started", "what is this?", "features", "capabilities".',
  description:
    "Walks a new user through the agent's capabilities in a friendly, progressive way. Shows what's available, demonstrates the 5-step rhythm with a quick example, and suggests next actions based on the user's goals.",
  steps: `1. INTRODUCE — Explain who you are
   - Your name, role, and current domains (from activation context)
   - What makes you different: you learn, remember, and improve
   - Your installed packs and what they enable

2. SHOW CAPABILITIES — Walk through what you can do
   - Vault: "I search my knowledge base before every decision"
   - Planning: "I create structured plans with approval gates"
   - Brain: "I learn from past sessions and recommend patterns"
   - Memory: "I remember across conversations and projects"
   - Domains: list each domain and what it covers
   - If packs are missing: "You can add more capabilities with soleri pack install"

3. DEMONSTRATE — Quick live example
   - Run a vault search on something relevant to the user's project
   - Show the result: "This is what I already know about your domain"
   - If vault is empty: "Let's capture our first pattern together"

4. ORIENT — Help the user find their starting point
   - Ask: "What are you working on?" or "What problem are you trying to solve?"
   - Based on their answer, suggest the right workflow:
     - Building something new → "Let me create a plan"
     - Fixing a bug → "Let me search for known patterns"
     - Learning the codebase → "Let me explore and capture what I find"
     - Setting up → "Let me run a health check: op:admin_health"

5. HANDOFF — Set expectations
   - "From now on, just describe what you need — I'll figure out the workflow"
   - "If you want me to remember something, say 'capture this' or 'remember'"
   - "Say 'what do you know about X?' to search my vault anytime"`,
  expectedOutcome:
    'User understands what the agent can do, has seen a live demonstration, and has a clear first task to work on. The agent transitions from onboarding to productive work.',
  category: 'methodology',
  tags: ['onboarding', 'getting-started', 'help', 'capabilities', 'generic'],
  matchIntents: ['PLAN'],
  matchKeywords: [
    'what can you do',
    'help',
    'getting started',
    'how do I use',
    'features',
    'capabilities',
    'onboarding',
    'introduce',
    'what is this',
    'new here',
    'first time',
  ],
  gates: [],
  taskTemplates: [],
  toolInjections: [
    'op:activate — show current capabilities and system status',
    'op:admin_health — demonstrate health check',
    'op:search_intelligent — live demo of vault search',
    'op:brain_recommend — show brain recommendations',
  ],
  verificationCriteria: [
    'User received a clear overview of agent capabilities',
    'User saw a live demonstration of at least one capability',
    'User expressed a first task or area of interest',
  ],
};
