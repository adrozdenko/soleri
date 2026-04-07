/**
 * Boot-time validation for agent.yaml required fields.
 *
 * Extracted to a separate module so it can be imported without triggering
 * the engine's top-level main() call.
 */

/**
 * Ensures the parsed agent.yaml contains the required `id` and `name` fields.
 * Throws a descriptive error if either is missing, preventing undefined vault paths.
 */
export function validateAgentConfig(config: Record<string, unknown>, yamlPath: string): void {
  if (!config.id || typeof config.id !== 'string' || config.id.trim() === '') {
    throw new Error(
      `agent.yaml requires an 'id' field. Add 'id: my-agent' to your agent.yaml (${yamlPath}).`,
    );
  }

  if (!config.name || typeof config.name !== 'string' || config.name.trim() === '') {
    throw new Error(
      `agent.yaml requires a 'name' field. Add 'name: My Agent' to your agent.yaml (${yamlPath}).`,
    );
  }
}
