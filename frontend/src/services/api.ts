export const API_BASE_URL = 'http://10.0.2.2:8000';

export interface HealthResponse {
  status: string;
}

export async function checkBackendHealth(
  baseUrl: string = API_BASE_URL,
): Promise<HealthResponse> {
  const response = await fetch(`${baseUrl}/healthz`);
  if (!response.ok) {
    throw new Error(`Backend responded with HTTP ${response.status}`);
  }
  return response.json() as Promise<HealthResponse>;
}

