import { API_VERSION, type HealthResponse } from '@erp/contracts';

export function getLiveness(): HealthResponse {
  return { status: 'ok', service: 'erp-api', version: API_VERSION };
}
