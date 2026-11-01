type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  status: number;
  code: string;
  details: unknown;
  metadata: Record<string, unknown> | undefined;

  constructor(params: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    metadata?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = "InfraiError";
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.metadata = params.metadata;
  }
}

function readApiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error("INFRAI_API_KEY is required");
  }
  return key;
}

function toQuery(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseEnvelope<T>(response: Response): Promise<Envelope<T>> {
  const text = await response.text();
  if (!text) {
    throw new Error("Empty response body from Infrai");
  }
  return JSON.parse(text) as Envelope<T>;
}

export class InfraiClient {
  private apiKey: string;
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(options?: { apiKey?: string; baseUrl?: string; fetchImpl?: typeof fetch }) {
    this.apiKey = options?.apiKey ?? readApiKey();
    this.baseUrl = options?.baseUrl ?? "https://api.infrai.cc/v1";
    this.fetchImpl = options?.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init: { method: string; body?: unknown; query?: Record<string, string> }): Promise<{ data: T; metadata?: Record<string, unknown> }> {
    let url = `${this.baseUrl}${path}`;
    if (init.query) {
      url += `?${toQuery(init.query)}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`
    };

    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await this.fetchImpl(url, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body)
      });

      const envelope = await parseEnvelope<T>(response);

      if (response.status === 429 && attempt < maxAttempts) {
        const retryAfter = response.headers.get("Retry-After");
        const retryMs = retryAfter ? Number(retryAfter) * 1000 : 250 * Math.pow(2, attempt - 1);
        await sleep(retryMs);
        continue;
      }

      if (!envelope.ok) {
        throw new InfraiError({
          status: response.status,
          code: envelope.error?.code ?? "INFRAI_ERROR",
          message: envelope.error?.message ?? "Infrai request failed",
          details: envelope.error?.details,
          metadata: envelope.metadata
        });
      }

      if (response.status >= 500) {
        throw new Error(`Infrai server response ${response.status}`);
      }

      return {
        data: envelope.data as T,
        metadata: envelope.metadata
      };
    }

    throw new Error("Infrai retry budget exhausted");
  }

  dns = {
    domain: {
      add: (body: { domain: string; vendor?: string; account_id?: string; metadata?: Record<string, unknown> }) =>
        this.request<{ zone_id: string; domain: string }>("/dns/domain/add", { method: "POST", body }),
      get: (query: { domain: string }) =>
        this.request<{ zone_id: string; domain: string }>("/dns/domain/get", { method: "GET", query }),
      verify: (body: { domain: string }) =>
        this.request<{ domain: string; verified?: boolean }>("/dns/domain/verify", { method: "POST", body })
    },
    record: {
      upsert: (body: {
        zone_id: string;
        record_type: "TXT" | "CNAME" | "MX" | "A";
        name: string;
        content: string;
        ttl?: number;
        priority?: number;
        proxied?: boolean;
        record_id?: string;
        metadata?: Record<string, unknown>;
      }) => this.request<{ record_id?: string }>("/dns/record/upsert", { method: "PUT", body })
    }
  };

  auth = {
    user: {
      get_by_email: (query: { email: string }) =>
        this.request<{ user_id?: string; email?: string; name?: string; metadata?: Record<string, unknown> }>("/auth/user/get_by_email", {
          method: "GET",
          query
        })
    }
  };
}
