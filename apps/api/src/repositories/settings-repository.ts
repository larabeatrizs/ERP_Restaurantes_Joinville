import type { Configuration, ConfigurationPatch, ConfigurationResult, UnitSummary } from '@erp/contracts';
export interface SettingsRepository {
  listUnits(): Promise<UnitSummary[]>;
  read(unit: string): Promise<ConfigurationResult>;
  update(unit: string, revision: string, patch: ConfigurationPatch): Promise<Configuration>;
}
export interface SettingsSession { authenticate(): Promise<void>; repository: SettingsRepository }
export interface RuntimeEnv { SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string }
export type SessionFactory = (env: RuntimeEnv, token: string) => SettingsSession;
