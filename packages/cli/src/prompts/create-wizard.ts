/**
 * Interactive create wizard using @clack/prompts.
 *
 * Guided flow with archetypes, multiselects, and playbook-assisted
 * custom fields. Happy path: 1 typed field (name), everything else
 * is Enter / arrow keys / space bar.
 */
import * as p from '@clack/prompts';
import type { AgentConfig } from '@soleri/forge/lib';
import { ARCHETYPES, type Archetype } from './archetypes.js';
import {
  DOMAIN_OPTIONS,
  CUSTOM_DOMAIN_GUIDANCE,
  PRINCIPLE_CATEGORIES,
  CUSTOM_PRINCIPLE_GUIDANCE,
  SKILL_CATEGORIES,
  CORE_SKILLS,
  ALL_OPTIONAL_SKILLS,
  TONE_OPTIONS,
  CUSTOM_ROLE_GUIDANCE,
  CUSTOM_DESCRIPTION_GUIDANCE,
  CUSTOM_GREETING_GUIDANCE,
} from './playbook.js';

/** Slugify a display name into a kebab-case ID. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Run the interactive create wizard and return an AgentConfig.
 * Returns null if the user cancels at any point.
 */
export async function runCreateWizard(initialName?: string): Promise<AgentConfig | null> {
  p.intro('Create a new Soleri agent');

  // ─── Step 1: Archetype ────────────────────────────────────
  const archetypeChoices = [
    ...ARCHETYPES.map((a) => ({
      value: a.value,
      label: a.label,
      hint: a.hint,
    })),
    {
      value: '_custom',
      label: '\u2726 Create Custom',
      hint: "I'll guide you through defining your own agent type",
    },
  ];

  const archetypeValues = await p.multiselect({
    message: 'What kind of agent are you building? (select one or more)',
    options: archetypeChoices,
    required: false,
  });

  if (p.isCancel(archetypeValues)) return null;

  const selectedValues = archetypeValues as string[];
  const isCustom = selectedValues.includes('_custom') || selectedValues.length === 0;
  const selectedArchetypes = ARCHETYPES.filter((a) => selectedValues.includes(a.value));

  // Merge defaults from all selected archetypes
  function mergeDefaults(archetypes: Archetype[]) {
    if (archetypes.length === 0) return null;
    const domains = [...new Set(archetypes.flatMap((a) => a.defaults.domains))];
    const principles = [...new Set(archetypes.flatMap((a) => a.defaults.principles))];
    const skills = [...new Set(archetypes.flatMap((a) => a.defaults.skills))];
    const tones = [...new Set(archetypes.map((a) => a.defaults.tone))];
    return { domains, principles, skills, tones };
  }

  const merged = mergeDefaults(selectedArchetypes);

  // ─── Step 2: Display name ─────────────────────────────────
  const nameDefault =
    selectedArchetypes.length === 1
      ? selectedArchetypes[0].label
      : selectedArchetypes.length > 1
        ? selectedArchetypes.map((a) => a.label).join(' + ')
        : undefined;

  const name = (await p.text({
    message: 'Display name',
    placeholder: nameDefault ?? 'My Agent',
    initialValue: initialName ?? nameDefault,
    validate: (v) => {
      if (!v || v.length > 50) return 'Required (max 50 chars)';
    },
  })) as string;

  if (p.isCancel(name)) return null;

  // ─── Step 3: Agent ID (auto-derived, confirm or edit) ─────
  const autoId = slugify(name);

  const id = (await p.text({
    message: 'Agent ID (auto-generated, press Enter to accept)',
    placeholder: autoId,
    initialValue: autoId,
    validate: (v = '') => {
      if (!/^[a-z][a-z0-9-]*$/.test(v)) return 'Must be kebab-case (e.g., "my-agent")';
    },
  })) as string;

  if (p.isCancel(id)) return null;

  // ─── Step 4: Role ─────────────────────────────────────────
  let role: string;

  if (isCustom || selectedArchetypes.length > 1) {
    if (isCustom) {
      p.note(
        [
          CUSTOM_ROLE_GUIDANCE.instruction,
          '',
          'Examples:',
          ...CUSTOM_ROLE_GUIDANCE.examples.map((e) => `  "${e}"`),
        ].join('\n'),
        '\u2726 Custom Agent Playbook',
      );
    }

    const rolePrompt = (await p.text({
      message:
        selectedArchetypes.length > 1
          ? 'Combined role (describe what this multi-purpose agent does)'
          : 'What does your agent do? (one sentence)',
      placeholder: 'Validates GraphQL schemas against federation rules',
      validate: (v) => {
        if (!v || v.length > 100) return 'Required (max 100 chars)';
      },
    })) as string;

    if (p.isCancel(rolePrompt)) return null;
    role = rolePrompt;
  } else {
    const prefilledRole = selectedArchetypes[0].defaults.role;
    const editedRole = (await p.text({
      message: 'Role (pre-filled, press Enter to accept)',
      initialValue: prefilledRole,
      validate: (v) => {
        if (!v || v.length > 100) return 'Required (max 100 chars)';
      },
    })) as string;

    if (p.isCancel(editedRole)) return null;
    role = editedRole;
  }

  // ─── Step 5: Description ──────────────────────────────────
  let description: string;

  if (isCustom || selectedArchetypes.length > 1) {
    if (isCustom) {
      p.note(
        [
          CUSTOM_DESCRIPTION_GUIDANCE.instruction,
          '',
          'Example:',
          ...CUSTOM_DESCRIPTION_GUIDANCE.examples.map((e) => `  "${e}"`),
        ].join('\n'),
        '\u2726 Description',
      );
    }

    const descPrompt = (await p.text({
      message:
        selectedArchetypes.length > 1
          ? 'Combined description (what does this multi-purpose agent do?)'
          : 'Describe your agent in detail',
      placeholder: 'This agent helps developers with...',
      validate: (v) => {
        if (!v || v.length < 10 || v.length > 500) return 'Required (10-500 chars)';
      },
    })) as string;

    if (p.isCancel(descPrompt)) return null;
    description = descPrompt;
  } else {
    const prefilledDesc = selectedArchetypes[0].defaults.description;
    const editedDesc = (await p.text({
      message: 'Description (pre-filled, press Enter to accept)',
      initialValue: prefilledDesc,
      validate: (v) => {
        if (!v || v.length < 10 || v.length > 500) return 'Required (10-500 chars)';
      },
    })) as string;

    if (p.isCancel(editedDesc)) return null;
    description = editedDesc;
  }

  // ─── Step 6: Domains (multiselect) ────────────────────────
  const preselectedDomains = new Set(merged?.domains ?? []);

  const domainChoices = [
    ...DOMAIN_OPTIONS.map((d) => ({
      value: d.value,
      label: d.label,
      hint: d.hint,
    })),
    {
      value: '_custom',
      label: '\u2726 Add custom domain...',
      hint: 'Define your own domain with playbook guidance',
    },
  ];

  // Pre-select archetype domains via initialValues
  const domainSelection = await p.multiselect({
    message: 'Select domains (areas of expertise)',
    options: domainChoices,
    initialValues: [...preselectedDomains],
    required: true,
  });

  if (p.isCancel(domainSelection)) return null;

  const domains = (domainSelection as string[]).filter((d) => d !== '_custom');
  const wantsCustomDomain = (domainSelection as string[]).includes('_custom');

  if (wantsCustomDomain) {
    p.note(
      [
        CUSTOM_DOMAIN_GUIDANCE.instruction,
        '',
        'Examples:',
        ...CUSTOM_DOMAIN_GUIDANCE.examples.map((e) => `  ${e}`),
        '',
        'Avoid:',
        ...CUSTOM_DOMAIN_GUIDANCE.antiExamples.map((e) => `  \u2717 ${e}`),
      ].join('\n'),
      '\u2726 Custom Domain',
    );

    const customDomain = (await p.text({
      message: 'Custom domain name (kebab-case)',
      placeholder: 'graphql-federation',
      validate: (v = '') => {
        if (!/^[a-z][a-z0-9-]*$/.test(v)) return 'Must be kebab-case';
        if (domains.includes(v)) return 'Already selected';
      },
    })) as string;

    if (!p.isCancel(customDomain)) {
      domains.push(customDomain);
    }
  }

  if (domains.length === 0) {
    p.log.error('At least one domain is required');
    return null;
  }

  // ─── Step 7: Principles (multiselect) ─────────────────────
  const preselectedPrinciples = new Set(merged?.principles ?? []);

  // Flatten categories into a single options list with group labels
  const principleChoices = PRINCIPLE_CATEGORIES.flatMap((cat) =>
    cat.options.map((o) => ({
      value: o.value,
      label: o.label,
      hint: cat.label,
    })),
  );

  principleChoices.push({
    value: '_custom',
    label: '\u2726 Add custom principle...',
    hint: 'Write your own guiding principle',
  });

  const principleSelection = await p.multiselect({
    message: 'Select guiding principles',
    options: principleChoices,
    initialValues: [...preselectedPrinciples],
    required: true,
  });

  if (p.isCancel(principleSelection)) return null;

  const principles = (principleSelection as string[]).filter((p) => p !== '_custom');
  const wantsCustomPrinciple = (principleSelection as string[]).includes('_custom');

  if (wantsCustomPrinciple) {
    p.note(
      [
        CUSTOM_PRINCIPLE_GUIDANCE.instruction,
        '',
        'Good principles are specific and actionable:',
        ...CUSTOM_PRINCIPLE_GUIDANCE.examples.map((e) => `  \u2713 "${e}"`),
        '',
        'Avoid vague principles:',
        ...CUSTOM_PRINCIPLE_GUIDANCE.antiExamples.map((e) => `  \u2717 ${e}`),
      ].join('\n'),
      '\u2726 Custom Principle',
    );

    const customPrinciple = (await p.text({
      message: 'Your custom principle',
      placeholder: 'Every public API must have a deprecation path',
      validate: (v) => {
        if (!v) return 'Required';
        if (v.length > 100) return 'Max 100 chars';
      },
    })) as string;

    if (!p.isCancel(customPrinciple)) {
      principles.push(customPrinciple);
    }
  }

  if (principles.length === 0) {
    p.log.error('At least one principle is required');
    return null;
  }

  // ─── Step 8: Communication tone ───────────────────────────
  let defaultTone: 'precise' | 'mentor' | 'pragmatic';

  if (merged && merged.tones.length === 1) {
    defaultTone = merged.tones[0];
  } else if (merged && merged.tones.length > 1) {
    p.note(`Selected archetypes use different tones: ${merged.tones.join(', ')}`, 'Tone Conflict');
    defaultTone = 'pragmatic';
  } else {
    defaultTone = 'pragmatic';
  }

  const tone = await p.select({
    message: 'Communication tone',
    options: TONE_OPTIONS.map((t) => ({
      value: t.value,
      label: t.label,
      hint: t.hint,
    })),
    initialValue: defaultTone,
  });

  if (p.isCancel(tone)) return null;

  // ─── Step 9: Skills (multiselect) ─────────────────────────
  const preselectedSkills = new Set(merged?.skills ?? []);

  p.note(`Always included: ${CORE_SKILLS.join(', ')}`, 'Core Skills');

  const skillChoices = SKILL_CATEGORIES.flatMap((cat) =>
    cat.options.map((o) => ({
      value: o.value,
      label: o.label,
      hint: `${o.hint} (${cat.label})`,
    })),
  );

  const skillSelection = await p.multiselect({
    message: 'Select additional skills',
    options: skillChoices,
    initialValues: [...preselectedSkills].filter((s) => ALL_OPTIONAL_SKILLS.includes(s)),
    required: false,
  });

  if (p.isCancel(skillSelection)) return null;

  const selectedSkills = [...CORE_SKILLS, ...(skillSelection as string[])];

  // ─── Step 10: Greeting (auto or custom) ───────────────────
  const autoGreeting =
    selectedArchetypes.length === 1
      ? selectedArchetypes[0].defaults.greetingTemplate(name)
      : `Hello! I'm ${name}. I ${role[0].toLowerCase()}${role.slice(1)}.`;

  const greetingChoice = await p.select({
    message: 'Greeting message',
    options: [
      {
        value: 'auto',
        label: `Auto \u2014 "${autoGreeting.length > 70 ? autoGreeting.slice(0, 67) + '...' : autoGreeting}"`,
        hint: 'Generated from name + role',
      },
      {
        value: 'custom',
        label: '\u2726 Custom \u2014 Write your own greeting',
        hint: 'Opens playbook-guided text field',
      },
    ],
    initialValue: 'auto',
  });

  if (p.isCancel(greetingChoice)) return null;

  let greeting: string;

  if (greetingChoice === 'custom') {
    p.note(
      [
        CUSTOM_GREETING_GUIDANCE.instruction,
        '',
        'Examples:',
        ...CUSTOM_GREETING_GUIDANCE.examples.map((e) => `  "${e}"`),
      ].join('\n'),
      '\u2726 Custom Greeting',
    );

    const customGreeting = (await p.text({
      message: 'Your greeting',
      placeholder: `Hello! I'm ${name}...`,
      validate: (v) => {
        if (!v || v.length < 10 || v.length > 300) return 'Required (10-300 chars)';
      },
    })) as string;

    if (p.isCancel(customGreeting)) return null;
    greeting = customGreeting;
  } else {
    greeting = autoGreeting;
  }

  // ─── Step 11: Output directory ────────────────────────────
  const outputDir = (await p.text({
    message: 'Output directory',
    initialValue: process.cwd(),
    placeholder: process.cwd(),
    validate: (v) => {
      if (!v) return 'Required';
    },
  })) as string;

  if (p.isCancel(outputDir)) return null;

  return {
    id,
    name,
    role,
    description,
    domains,
    principles,
    tone: tone as 'precise' | 'mentor' | 'pragmatic',
    greeting,
    outputDir,
    skills: selectedSkills,
  };
}
