import { request } from './client';

export interface HealthResponse {
  status: string;
}

/** GET /healthz (exists in the backend). Always hits the network, even with mocks on. */
export function checkBackendHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/healthz');
}
