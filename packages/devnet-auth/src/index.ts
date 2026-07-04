import type { DevNetConfig, SeaportConfig } from "@meridian/shared-types";
import { JsonLedgerClient } from "@meridian/ledger-client";

const DEFAULT_REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

export class DevNetAuthError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "DevNetAuthError";
  }
}

export class DevNetAuthClient {
  private cache: TokenCache | null = null;

  constructor(private config: DevNetConfig) {
    if (!config.clientSecret) {
      throw new DevNetAuthError("MISSING_SECRET", "DEVNET_CLIENT_SECRET is required");
    }
  }

  /** Load DevNet config from process.env (after dotenv). */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): DevNetAuthClient {
    return new DevNetAuthClient(loadDevNetConfigFromEnv(env));
  }

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cache && now < this.cache.expiresAt - DEFAULT_REFRESH_BUFFER_MS) {
      return this.cache.accessToken;
    }
    return this.refreshToken();
  }

  async refreshToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      audience: this.config.audience,
      scope: this.config.scope,
    });

    const res = await fetch(this.config.authUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new DevNetAuthError("TOKEN_EXCHANGE_FAILED", await res.text());
    }

    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) {
      throw new DevNetAuthError("TOKEN_EXCHANGE_FAILED", "No access_token in response");
    }

    const expiresInMs = (json.expires_in ?? 28800) * 1000;
    this.cache = {
      accessToken: json.access_token,
      expiresAt: Date.now() + expiresInMs,
    };
    return this.cache.accessToken;
  }

  invalidateCache(): void {
    this.cache = null;
  }

  getSeaportConfig(): SeaportConfig {
    return {
      ledgerApiUrl: this.config.ledgerApiUrl,
      ledgerWsUrl: this.config.ledgerWsUrl,
      authUrl: this.config.authUrl,
      clientId: this.config.clientId,
      audience: this.config.audience,
      scope: this.config.scope,
      validatorId: "seaport-devnet",
    };
  }

  async createAuthenticatedLedgerClient(actingParty?: string): Promise<JsonLedgerClient> {
    const token = await this.getAccessToken();
    return new JsonLedgerClient({
      baseUrl: this.config.ledgerApiUrl.replace(/\/$/, ""),
      bearerToken: token,
      actingParty,
    });
  }
}

export function loadDevNetConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DevNetConfig {
  return {
    ledgerApiUrl:
      env.DEVNET_LEDGER_API_URL ??
      "https://ledger-api.validator.devnet.sandbox.fivenorth.io",
    ledgerWsUrl:
      env.DEVNET_LEDGER_WS_URL ??
      "wss://ledger-api.validator.devnet.sandbox.fivenorth.io",
    authUrl:
      env.DEVNET_AUTH_URL ?? "https://auth.sandbox.fivenorth.io/application/o/token/",
    clientId: env.DEVNET_CLIENT_ID ?? "validator-devnet-m2m",
    clientSecret: env.DEVNET_CLIENT_SECRET ?? "",
    audience: env.DEVNET_AUDIENCE ?? "validator-devnet-m2m",
    scope: env.DEVNET_SCOPE ?? "daml_ledger_api",
  };
}

export async function getAccessToken(config?: DevNetConfig): Promise<string> {
  const client = config ? new DevNetAuthClient(config) : DevNetAuthClient.fromEnv();
  return client.getAccessToken();
}

export async function createAuthenticatedLedgerClient(
  actingParty?: string,
  config?: DevNetConfig
): Promise<JsonLedgerClient> {
  const client = config ? new DevNetAuthClient(config) : DevNetAuthClient.fromEnv();
  return client.createAuthenticatedLedgerClient(actingParty);
}
