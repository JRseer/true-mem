/**
 * True-Mem Configuration Types
 * 
 * Separates user configuration (config.json) from runtime state (state.json)
 */

/**
 * Config version - bump when adding new fields
 */
export const CONFIG_VERSION = 2;

/**
 * Injection mode types
 */
export type InjectionMode = 0 | 1;

/**
 * Sub-agent mode types  
 */
export type SubAgentMode = 0 | 1;

/**
 * Shadow ingest mode types
 */
export type ShadowIngestMode = 0 | 1;

/**
 * Main ingest write cutover mode types
 */
export type IngestWriteMode = 0 | 1;

/**
 * Retrieve pipeline mode types
 */
export type RetrievePipelineMode = 0 | 1;

/**
 * Storage location type
 */
export type StorageLocation = 'legacy' | 'opencode';

/**
 * User configuration - persistent settings that users can customize
 * Stored in: ~/.true-mem/config.json
 */
export interface TrueMemUserConfig {
  injectionMode: InjectionMode;
  subagentMode: SubAgentMode;
  maxMemories: number;
  embeddingsEnabled: number;
  shadowIngestEnabled: ShadowIngestMode;
  ingestWriteEnabled: IngestWriteMode;
  retrievePipelineEnabled: RetrievePipelineMode;
  storageLocation: StorageLocation;
}

/**
 * Default user configuration
 */
export const DEFAULT_USER_CONFIG: TrueMemUserConfig = {
  injectionMode: 1,      // ALWAYS - real-time memory updates
  subagentMode: 1,       // ENABLED
  maxMemories: 20,
  embeddingsEnabled: 0,
  shadowIngestEnabled: 0,
  ingestWriteEnabled: 0,
  retrievePipelineEnabled: 0,
  storageLocation: 'legacy',
};

/**
 * Default runtime state
 */
export const DEFAULT_STATE: TrueMemState = {
  embeddingsEnabled: false,
  lastEnvCheck: null,
  nodePath: null,
};

/**
 * Runtime state - internal plugin state (not user-facing)
 * Stored in: ~/.true-mem/state.json
 */
export interface TrueMemState {
  embeddingsEnabled: boolean;
  lastEnvCheck: string | null;
  nodePath: string | null;
}
