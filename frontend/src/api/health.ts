import { API_V1, request } from './client';

export interface HealthResponse {
  status: string;
}

/** GET /readyz (exists on Cloud Run and confirms Firestore is ready). */
export function checkBackendHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/readyz');
}

/** Shape of GET /api/v1/me (exists in the backend). */
export interface MeResponse {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  email_verified: boolean;
}

/** GET /api/v1/me: proves the backend accepts our Firebase token. Always hits the network. */
export function checkBackendAuth(): Promise<MeResponse> {
  return request<MeResponse>(`${API_V1}/me`);
}
