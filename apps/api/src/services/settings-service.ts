import type { ConfigurationPatch } from '@erp/contracts';
import type { SettingsRepository } from '../repositories/settings-repository.ts';
export class SettingsService {
  private readonly repository: SettingsRepository;
  constructor(repository: SettingsRepository) { this.repository = repository; }
  read(unit: string) { return this.repository.read(unit); }
  update(unit: string, revision: string, patch: ConfigurationPatch) {
    return this.repository.update(unit, revision, patch);
  }
}
