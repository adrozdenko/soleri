export {
  composeCLAUDEmd,
  FORMAT_VERSION,
  OPEN_MARKER,
  CLOSE_MARKER,
  USER_ZONE_OPEN,
  USER_ZONE_CLOSE,
} from './compose.js';
export type { ComposeOptions } from './compose.js';
export { injectCLAUDEmd, removeCLAUDEmd, hasCLAUDEmdBlock, extractUserZone } from './inject.js';
export type {
  AgentMeta,
  GlobalInstruction,
  FacadeInstructions,
  InjectionResult,
  RemovalResult,
} from './types.js';
