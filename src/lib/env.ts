import { z } from "zod";

/**
 * Central environment configuration.
 * Fails loudly only on truly required values; optional integrations degrade
 * gracefully and surface their configuration state in Settings > Integrations.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_ENCRYPTION_KEY: z.string().optional().default(""),
  CRON_SECRET: z.string().optional().default(""),
  SETUP_TOKEN: z.string().optional().default(""),
  // AI
  AI_PROVIDER: z.enum(["openai", "anthropic", "google"]).optional().default("openai"),
  AI_API_KEY: z.string().optional().default(""),
  AI_BASE_URL: z.string().optional().default(""),
  AI_MODEL_FAST: z.string().optional().default(""),
  AI_MODEL_RESEARCH: z.string().optional().default(""),
  AI_MODEL_REASONING: z.string().optional().default(""),
  AI_MODEL_WRITING: z.string().optional().default(""),
  AI_MODEL_DOC_EXTRACT: z.string().optional().default(""),
  AI_EMBEDDING_MODEL: z.string().optional().default(""),
  AI_MONTHLY_BUDGET_USD: z.coerce.number().optional().default(10),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().optional().default(2000),
  // Integrations
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  GITHUB_TOKEN: z.string().optional().default(""),
  GITHUB_CLIENT_ID: z.string().optional().default(""),
  GITHUB_CLIENT_SECRET: z.string().optional().default(""),
  // Storage
  FILE_STORAGE_DIR: z.string().optional().default(".data/files"),
  NODE_ENV: z.enum(["development", "test", "production"]).optional().default("development"),
});

type Env = z.infer<typeof schema>;

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration -> ${issues}`);
  }
  return parsed.data;
}

const env: Env = loadEnv();

export function aiEnabled(): boolean {
  return Boolean(env.AI_API_KEY);
}

export function embeddingsEnabled(): boolean {
  return Boolean(env.AI_API_KEY && env.AI_EMBEDDING_MODEL);
}

export function googleOAuthConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function githubConfigured(): boolean {
  return Boolean(env.GITHUB_TOKEN || (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET));
}

export function cronSecretConfigured(): boolean {
  return Boolean(env.CRON_SECRET);
}

export function encryptionConfigured(): boolean {
  return Boolean(env.APP_ENCRYPTION_KEY);
}

export default env;
