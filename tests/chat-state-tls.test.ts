import { afterEach, expect, it, vi } from "vitest";
import pg from "pg";
import { chatLifecycleClient } from "../lib/chat/state";

afterEach(() => vi.unstubAllEnvs());

it("trusts the configured CA without disabling certificate verification", () => {
  vi.stubEnv("CHAT_STATE_DATABASE_URL", "postgres://chat:password@db.example.com/postgres?sslmode=require");
  vi.stubEnv("CHAT_STATE_DATABASE_CA", "test-ca");
  const client = chatLifecycleClient() as pg.Client & { connectionParameters: { ssl: unknown } };
  expect(client.connectionParameters.ssl).toEqual({ ca: "test-ca", rejectUnauthorized: true });
});

it("leaves local database TLS unchanged when no custom CA is configured", () => {
  vi.stubEnv("CHAT_STATE_DATABASE_URL", "postgres://chat:password@localhost/postgres");
  vi.stubEnv("CHAT_STATE_DATABASE_CA", "");
  const client = chatLifecycleClient() as pg.Client & { connectionParameters: { ssl: unknown } };
  expect(client.connectionParameters.ssl).toBe(false);
});
