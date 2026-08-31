interface ApiError { error?: string }

export class AdminApi {
	async get<T>(path: string): Promise<T> { return this.request<T>(path); }
	async post<T>(path: string, body: object): Promise<T> { return this.request<T>(path, "POST", body); }
	async patch<T>(path: string, body: object): Promise<T> { return this.request<T>(path, "PATCH", body); }

	private async request<T>(path: string, method = "GET", body?: object): Promise<T> {
		const response = await fetch(`/api/v1/admin${path}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
		const result = await response.json() as T & ApiError;
		if (!response.ok) throw new Error(result.error ?? "The request could not be completed.");
		return result;
	}
}

export const adminApi = new AdminApi();
