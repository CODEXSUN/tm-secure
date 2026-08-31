export type AdminPage = "overview" | "users" | "applications" | "devices" | "sessions" | "audit" | "settings";
export interface AdminPrincipal { id: string; email: string; displayName: string; role: string; mustChangePassword: boolean }
export interface Overview { metrics: Record<"users" | "pending" | "apps" | "devices" | "sessions", number>; events: AuditEvent[] }
export interface ManagedUser { id: string; mobile: string; email: string; username: string; status: string; approvalStatus: string; createdAt: string }
export interface ManagedApplication { id: string; clientId: string; name: string; domain: string; clientType: string; status: string; scopes: string; createdAt: string }
export interface ManagedDevice { id: string; label: string; platform: string; trustStatus: string; user: string; firstSeenAt: string; lastSeenAt: string }
export interface ManagedSession { id: string; user: string; authenticationMethod: string; userAgent: string; createdAt: string; lastSeenAt: string; expiresAt: string; revokedAt: string | null }
export interface AuditEvent { id?: string; eventType: string; actorType: string; actorId?: string; details?: string; createdAt: string }
