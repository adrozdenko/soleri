export { HealthRegistry, withDegradation } from './health-registry.js';
export type {
  SubsystemStatus,
  SubsystemHealth,
  StatusChangeListener,
  RecoveryHook,
  HealthSnapshot,
} from './health-registry.js';

export { checkVaultIntegrity } from './vault-integrity.js';
export type { IntegrityResult } from './vault-integrity.js';
