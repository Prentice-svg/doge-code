export const OPENAI_OAUTH_CONFIG = {
  CLIENT_ID: 'app_EMoamEEZ73f0CkXaXp7hrann',
  AUTHORIZE_URL: 'https://auth.openai.com/oauth/authorize',
  TOKEN_URL: 'https://auth.openai.com/oauth/token',
  REDIRECT_PORT: 1455,
  CALLBACK_PATH: '/auth/callback',
  SCOPES: ['openid', 'profile', 'email', 'offline_access'],
  API_BASE_URL: 'https://chatgpt.com/backend-api/codex',
  DEFAULT_MODEL: 'gpt-5.4',
  SUPPORTED_MODELS: [
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.3-codex',
    'gpt-5.2-codex',
    'gpt-5.2',
    'gpt-5.1-codex-max',
    'gpt-5.1-codex',
    'gpt-5.1',
    'gpt-5-codex',
    'gpt-5',
    'gpt-5.1-codex-mini',
    'gpt-5-codex-mini',
  ],
} as const

export type OpenAIOAuthTokens = {
  accessToken: string
  idToken?: string
  refreshToken: string
  expiresAt: number
}

export type OpenAIOAuthAccountInfo = {
  email?: string
  accountId?: string
  userId?: string
  name?: string
  planType?: string
}

export function isOpenAIOAuthSupportedModel(model: string): boolean {
  const normalized = model.trim().toLowerCase()
  return OPENAI_OAUTH_CONFIG.SUPPORTED_MODELS.includes(
    normalized as (typeof OPENAI_OAUTH_CONFIG.SUPPORTED_MODELS)[number],
  )
}

export function getOpenAIOAuthUnsupportedModelMessage(model: string): string {
  return `Model '${model}' is not supported with OpenAI OAuth in this build. OpenAI OAuth here uses the ChatGPT Codex backend, so choose one of the Codex backend models such as '${OPENAI_OAUTH_CONFIG.DEFAULT_MODEL}'.`
}
