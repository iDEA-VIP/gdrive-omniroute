import { createHash } from "node:crypto";

/**
 * Deployment-level configuration. Individual tenant IDs are deliberately not
 * set in .env: they are derived from the verified Google OIDC identity so that
 * multiple Google accounts never share a tenant by accident.
 */
export interface TenantRuntimeConfig {
  namespace: string;
  displayName: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  allowedGoogleDomain: string | null;
  driveStorageMode: "appDataFolder" | "drive.file";
  driveFolderId: string | null;
  encryptionKey: string;
}

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function getTenantRuntimeConfig(): TenantRuntimeConfig {
  const mode = readEnv("GOOGLE_DRIVE_STORAGE_MODE") || "appDataFolder";
  if (mode !== "appDataFolder" && mode !== "drive.file") {
    throw new Error("GOOGLE_DRIVE_STORAGE_MODE must be appDataFolder or drive.file");
  }

  return {
    namespace: readEnv("OMNIROUTE_TENANT_NAMESPACE"),
    displayName: readEnv("OMNIROUTE_TENANT_DISPLAY_NAME"),
    googleClientId: readEnv("GOOGLE_OAUTH_CLIENT_ID"),
    googleClientSecret: readEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
    googleRedirectUri:
      readEnv("GOOGLE_OAUTH_REDIRECT_URI") || "http://localhost:20128/api/auth/google/callback",
    allowedGoogleDomain: readEnv("GOOGLE_OAUTH_ALLOWED_DOMAIN") || null,
    driveStorageMode: mode,
    driveFolderId: readEnv("GOOGLE_DRIVE_APP_DATA_FOLDER") || null,
    encryptionKey: readEnv("OMNIROUTE_TENANT_ENCRYPTION_KEY"),
  };
}

/**
 * Resolve a stable, opaque tenant key from a *verified* OIDC issuer + subject.
 * Never pass an email address or an unverified user-supplied identifier here.
 * A namespace allows separate deployments to keep independent Drive data.
 */
export function resolveGoogleTenantId(
  issuer: string,
  subject: string,
  namespace = getTenantRuntimeConfig().namespace
): string {
  const normalizedIssuer = typeof issuer === "string" ? issuer.trim() : "";
  const normalizedSubject = typeof subject === "string" ? subject.trim() : "";
  if (!normalizedIssuer || !normalizedSubject) {
    throw new Error("A verified Google OIDC issuer and subject are required to resolve a tenant");
  }

  const digest = createHash("sha256")
    .update("omniroute-tenant-v1\0")
    .update(namespace.trim())
    .update("\0")
    .update(normalizedIssuer)
    .update("\0")
    .update(normalizedSubject)
    .digest("hex");

  return `gtn_${digest}`;
}

/** Validate only at the point the Google Drive integration is enabled. */
export function assertGoogleDriveTenantConfig(config = getTenantRuntimeConfig()): void {
  const missing = [
    ["GOOGLE_OAUTH_CLIENT_ID", config.googleClientId],
    ["GOOGLE_OAUTH_CLIENT_SECRET", config.googleClientSecret],
    ["GOOGLE_OAUTH_REDIRECT_URI", config.googleRedirectUri],
    ["OMNIROUTE_TENANT_ENCRYPTION_KEY", config.encryptionKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Google Drive tenant storage is not configured. Set: ${missing.join(", ")}`);
  }

  if (config.driveStorageMode === "drive.file" && !config.driveFolderId) {
    throw new Error("GOOGLE_DRIVE_APP_DATA_FOLDER is required when GOOGLE_DRIVE_STORAGE_MODE=drive.file");
  }
}
