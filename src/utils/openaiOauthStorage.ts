import type {
  OpenAIOAuthAccountInfo,
  OpenAIOAuthTokens,
} from '../constants/openaiOauth.js'
import { decodeJwtPayload } from '../bridge/jwtUtils.js'
import {
  isOpenAITokenExpired,
  refreshOpenAIToken,
} from '../services/oauth/openaiOauthClient.js'
import { getSecureStorage } from './secureStorage/index.js'

const OPENAI_OAUTH_KEY = 'openaiOauth'

type OpenAIOAuthStoredData = {
  accessToken: string
  idToken?: string
  refreshToken: string
  expiresAt: number
  accountInfo?: OpenAIOAuthAccountInfo
}

function parseOpenAIAccountInfoFromIdToken(
  idToken: string | undefined,
): OpenAIOAuthAccountInfo | undefined {
  if (!idToken) return undefined
  const payload = decodeJwtPayload(idToken)
  if (!payload || typeof payload !== 'object') return undefined

  const record = payload as Record<string, unknown>
  const authClaims =
    typeof record['https://api.openai.com/auth'] === 'object' &&
    record['https://api.openai.com/auth'] !== null
      ? (record['https://api.openai.com/auth'] as Record<string, unknown>)
      : undefined

  const info: OpenAIOAuthAccountInfo = {
    email: typeof record.email === 'string' ? record.email : undefined,
    name:
      typeof record.name === 'string'
        ? record.name
        : typeof record.preferred_username === 'string'
          ? record.preferred_username
          : undefined,
    accountId:
      typeof authClaims?.chatgpt_account_id === 'string'
        ? authClaims.chatgpt_account_id
        : undefined,
    userId:
      typeof authClaims?.chatgpt_user_id === 'string'
        ? authClaims.chatgpt_user_id
        : typeof authClaims?.user_id === 'string'
          ? authClaims.user_id
          : undefined,
    planType:
      typeof authClaims?.chatgpt_plan_type === 'string'
        ? authClaims.chatgpt_plan_type
        : undefined,
  }

  return Object.values(info).some(value => typeof value === 'string' && value)
    ? info
    : undefined
}

function getStoredOpenAIOAuthData(): OpenAIOAuthStoredData | null {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
  }
  const data = storage.read?.() ?? {}
  const raw = data[OPENAI_OAUTH_KEY]
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (typeof value.accessToken !== 'string') return null
  return {
    accessToken: value.accessToken as string,
    idToken: typeof value.idToken === 'string' ? value.idToken : undefined,
    refreshToken:
      typeof value.refreshToken === 'string' ? value.refreshToken : '',
    expiresAt: typeof value.expiresAt === 'number' ? value.expiresAt : 0,
    accountInfo:
      value.accountInfo && typeof value.accountInfo === 'object'
        ? {
            email:
              typeof (value.accountInfo as Record<string, unknown>).email ===
              'string'
                ? ((value.accountInfo as Record<string, unknown>).email as string)
                : undefined,
            accountId:
              typeof (value.accountInfo as Record<string, unknown>).accountId ===
              'string'
                ? ((value.accountInfo as Record<string, unknown>)
                    .accountId as string)
                : undefined,
            userId:
              typeof (value.accountInfo as Record<string, unknown>).userId ===
              'string'
                ? ((value.accountInfo as Record<string, unknown>).userId as string)
                : undefined,
            name:
              typeof (value.accountInfo as Record<string, unknown>).name ===
              'string'
                ? ((value.accountInfo as Record<string, unknown>).name as string)
                : undefined,
            planType:
              typeof (value.accountInfo as Record<string, unknown>).planType ===
              'string'
                ? ((value.accountInfo as Record<string, unknown>)
                    .planType as string)
                : undefined,
          }
        : undefined,
  }
}

export function readOpenAIOAuthTokens(): OpenAIOAuthTokens | null {
  const value = getStoredOpenAIOAuthData()
  if (!value) return null
  return {
    accessToken: value.accessToken,
    idToken: value.idToken,
    refreshToken: value.refreshToken,
    expiresAt: value.expiresAt,
  }
}

export function saveOpenAIOAuthTokens(tokens: OpenAIOAuthTokens): void {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const data = storage.read?.() ?? {}
  const current = getStoredOpenAIOAuthData()
  data[OPENAI_OAUTH_KEY] = {
    accessToken: tokens.accessToken,
    idToken: tokens.idToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    accountInfo:
      parseOpenAIAccountInfoFromIdToken(tokens.idToken) ?? current?.accountInfo,
  }
  storage.update?.(data)
}

export function readOpenAIOAuthAccountInfo(): OpenAIOAuthAccountInfo | null {
  const value = getStoredOpenAIOAuthData()
  if (!value) return null
  const parsedFromToken = parseOpenAIAccountInfoFromIdToken(value.idToken)
  return parsedFromToken ?? value.accountInfo ?? null
}

export function clearOpenAIOAuthTokens(): void {
  const storage = getSecureStorage() as {
    read?: () => Record<string, unknown> | null
    update?: (data: Record<string, unknown>) => { success: boolean }
  }
  const data = storage.read?.() ?? {}
  delete data[OPENAI_OAUTH_KEY]
  storage.update?.(data)
}

export function hasOpenAIOAuthTokens(): boolean {
  const tokens = readOpenAIOAuthTokens()
  return tokens !== null && !!tokens.accessToken
}

let pendingOpenAIRefresh: Promise<string | null> | null = null

export async function getOpenAIAccessToken(): Promise<string | null> {
  const tokens = readOpenAIOAuthTokens()
  if (!tokens) return null

  if (!isOpenAITokenExpired(tokens.expiresAt)) {
    return tokens.accessToken
  }

  if (!tokens.refreshToken) return null

  if (pendingOpenAIRefresh) return pendingOpenAIRefresh

  pendingOpenAIRefresh = (async () => {
    try {
      const refreshed = await refreshOpenAIToken(tokens.refreshToken)
      saveOpenAIOAuthTokens(refreshed)
      process.env.DOGE_API_KEY = refreshed.accessToken
      return refreshed.accessToken
    } catch {
      return null
    } finally {
      pendingOpenAIRefresh = null
    }
  })()

  return pendingOpenAIRefresh
}
