/**
 * OmniRoute Provider Extension
 *
 * Conecta o Pi ao OmniRoute — um gateway de IA open-source
 * que agrega 236+ providers em um único endpoint OpenAI-compatible.
 *
 * GitHub: https://github.com/diegosouzapw/OmniRoute
 *
 * Configuração (escolha uma):
 *
 *   A) Via /login (recomendado):
 *      No Pi, execute /login omniroute e siga as instruções.
 *      A extensão pergunta a URL do servidor e a API key.
 *
 *   B) Via variáveis de ambiente:
 *      export OMNIROUTE_BASE_URL="http://<servidor>:20128/v1"
 *      export OMNIROUTE_API_KEY="sk-..."
 *
 * Depois de configurado: /model → omniroute (modelos auto-routing são filtrados)
 */

import type {
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import type {
  OAuthCredentials,
  OAuthLoginCallbacks,
} from "@earendil-works/pi-ai";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ---------------------------------------------------------------------------
// Estado mutável: populado pelo /login, auth.json ou variáveis de ambiente
// ---------------------------------------------------------------------------

let baseUrl = process.env.OMNIROUTE_BASE_URL || "";
let apiKey = process.env.OMNIROUTE_API_KEY || "";

function loadAuthCredentials() {
  if (baseUrl && apiKey) return; // já tem por env var
  const authPath = join(homedir(), ".pi", "agent", "auth.json");
  if (!existsSync(authPath)) return;
  try {
    const auth = JSON.parse(readFileSync(authPath, "utf-8"));
    const entry = auth["omniroute"];
    if (entry?.refresh && entry?.access) {
      if (!baseUrl) baseUrl = entry.refresh;
      if (!apiKey) apiKey = entry.access;
    }
  } catch {
    // ignora erro de parse
  }
}

// ---------------------------------------------------------------------------
// Modelos fallback (usados quando OmniRoute não responde ao /v1/models)
// ---------------------------------------------------------------------------

// Sem fallbacks padrão — se a descoberta falhar, nenhum modelo é registrado.
// Isso evita que modelos auto-routing apareçam como opção.
const FALLBACK_MODELS: Array<{
  id: string;
  name: string;
  reasoning: boolean;
  input: readonly ("text" | "image")[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}> = [];

interface OmniRouteModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  context_length?: number;
  max_output_tokens?: number;
  capabilities?: {
    vision?: boolean;
    tool_calling?: boolean;
    reasoning?: boolean;
    thinking?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Descoberta dinâmica de modelos
// ---------------------------------------------------------------------------

/** Modelos auto-routing do OmniRoute que devem ser ocultados */
const AUTO_MODEL_PREFIXES = ["auto"];

function isAutoModel(modelId: string): boolean {
  return AUTO_MODEL_PREFIXES.some((prefix) =>
    prefix.endsWith("/")
      ? modelId.startsWith(prefix)
      : modelId === prefix,
  );
}

async function fetchModels(url: string, key: string) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;

  const response = await fetch(`${url}/models`, {
    headers,
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { data?: OmniRouteModel[] };
  if (!data.data?.length) return null;

  return data.data
    .filter((m) => !isAutoModel(m.id))
    .map((m) => ({
      id: m.id,
      name: m.id,
      reasoning: m.capabilities?.reasoning ?? true,
      input: m.capabilities?.vision ? (["text", "image"] as const) : (["text"] as const),
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.context_length ?? 200000,
      maxTokens: m.max_output_tokens ?? 32000,
    }));
}

// ---------------------------------------------------------------------------
// OAuth / /login
// ---------------------------------------------------------------------------

async function loginOmniRoute(
  callbacks: OAuthLoginCallbacks,
): Promise<OAuthCredentials> {
  // Etapa 1: URL do servidor
  const url = await callbacks.onPrompt({
    message:
      "URL do servidor OmniRoute (ex: http://192.168.1.100:20128/v1):",
  });
  if (!url) throw new Error("Login cancelado — URL não informada");

  // Etapa 2: API key
  const key = await callbacks.onPrompt({
    message: "API key do OmniRoute (gerada no dashboard):",
  });
  if (!key) throw new Error("Login cancelado — API key não informada");

  // Atualiza o estado mutável imediatamente
  baseUrl = url;
  apiKey = key;

  return {
    refresh: url, // reutilizamos refresh para armazenar a URL
    access: key,
    expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // ~1 ano
  };
}

async function refreshOmniRouteToken(
  credentials: OAuthCredentials,
): Promise<OAuthCredentials> {
  // Sem refresh real — apenas mantém as credenciais atuais
  return credentials;
}

// ---------------------------------------------------------------------------
// Extensão
// ---------------------------------------------------------------------------

export default async function (pi: ExtensionAPI) {
  // Tenta carregar credenciais do auth.json se não veio por env
  loadAuthCredentials();

  // Tenta descobrir modelos automaticamente
  let models: typeof FALLBACK_MODELS = FALLBACK_MODELS;

  if (baseUrl && apiKey) {
    const discovered = await fetchModels(baseUrl, apiKey);
    if (discovered) {
      models = discovered;
    }
  }

  pi.registerProvider("omniroute", {
    name: "OmniRoute",
    baseUrl: baseUrl || "http://localhost:20128/v1",
    apiKey: apiKey || undefined,
    api: "openai-completions",
    authHeader: true,
    models,

    oauth: {
      name: "OmniRoute (servidor remoto)",
      login: loginOmniRoute,
      refreshToken: refreshOmniRouteToken,
      getApiKey: (creds) => creds.access,
      modifyModels: (_models, creds) => {
        // IMPORTANTE: o Pi passa aqui a lista COMPLETA de modelos de TODOS os
        // providers (combined catalog), não apenas os do OmniRoute. Portanto só
        // podemos ajustar o baseUrl dos modelos cujo provider é "omniroute" —
        // caso contrário reescreveríamos o baseUrl de deepseek/anthropic/etc.
        // apontando-os para o servidor OmniRoute e quebrando esses providers.
        const url = creds.refresh || baseUrl;
        return _models.map((m) =>
          m.provider === "omniroute" ? { ...m, baseUrl: url } : m,
        );
      },
    },
  });
}
