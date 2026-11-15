import assert from "node:assert/strict";
import testCase from "node:test";
import {
  assertGoogleDriveTenantConfig,
  getTenantRuntimeConfig,
  resolveGoogleTenantId,
} from "../../src/lib/tenant/identity";

testCase("Google tenant IDs are stable and isolated by OIDC subject", () => {
  const first = resolveGoogleTenantId("https://accounts.google.com", "user-1", "test");
  assert.equal(first, resolveGoogleTenantId("https://accounts.google.com", "user-1", "test"));
  assert.notEqual(first, resolveGoogleTenantId("https://accounts.google.com", "user-2", "test"));
  assert.notEqual(first, resolveGoogleTenantId("https://accounts.google.com", "user-1", "other"));
  assert.match(first, /^gtn_[a-f0-9]{64}$/);
});

testCase("tenant resolver rejects missing or unverified identity fields", () => {
  assert.throws(() => resolveGoogleTenantId("", "user-1", "test"), /verified Google OIDC/);
  assert.throws(() => resolveGoogleTenantId("https://accounts.google.com", "", "test"), /verified Google OIDC/);
});

testCase("Drive config remains unset until supplied through environment", () => {
  const names = [
    "OMNIROUTE_TENANT_NAMESPACE",
    "OMNIROUTE_TENANT_DISPLAY_NAME",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_OAUTH_REDIRECT_URI",
    "GOOGLE_OAUTH_ALLOWED_DOMAIN",
    "GOOGLE_DRIVE_STORAGE_MODE",
    "GOOGLE_DRIVE_APP_DATA_FOLDER",
    "OMNIROUTE_TENANT_ENCRYPTION_KEY",
  ];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    const config = getTenantRuntimeConfig();
    assert.equal(config.namespace, "");
    assert.equal(config.displayName, "");
    assert.equal(config.googleClientId, "");
    assert.equal(config.googleClientSecret, "");
    assert.equal(config.driveStorageMode, "appDataFolder");
    assert.equal(config.encryptionKey, "");
    assert.throws(() => assertGoogleDriveTenantConfig(config), /Google Drive tenant storage is not configured/);
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
