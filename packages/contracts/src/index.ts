export const API_VERSION = '0.1.0';

/** Liveness do processo; não certifica banco, Auth ou prontidão operacional. */
export interface HealthResponse {
  status: 'ok';
  service: 'erp-api';
  version: string;
}

export interface ErrorResponse {
  error: { code: 'NOT_FOUND' | 'METHOD_NOT_ALLOWED'; message: string };
}
