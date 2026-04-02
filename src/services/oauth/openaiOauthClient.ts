import {
  OPENAI_OAUTH_CONFIG,
  type OpenAIOAuthTokens,
} from '../../constants/openaiOauth.js'

export function buildOpenAIAuthUrl(params: {
  codeChallenge: string
  state: string
  port: number
}): string {
  const authUrl = new URL(OPENAI_OAUTH_CONFIG.AUTHORIZE_URL)
  authUrl.searchParams.append('client_id', OPENAI_OAUTH_CONFIG.CLIENT_ID)
  authUrl.searchParams.append('response_type', 'code')
  authUrl.searchParams.append(
    'redirect_uri',
    `http://localhost:${params.port}${OPENAI_OAUTH_CONFIG.CALLBACK_PATH}`,
  )
  authUrl.searchParams.append('scope', OPENAI_OAUTH_CONFIG.SCOPES.join(' '))
  authUrl.searchParams.append('code_challenge', params.codeChallenge)
  authUrl.searchParams.append('code_challenge_method', 'S256')
  authUrl.searchParams.append('state', params.state)
  return authUrl.toString()
}

export async function exchangeOpenAICodeForTokens(params: {
  authorizationCode: string
  codeVerifier: string
  redirectUri: string
}): Promise<OpenAIOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.authorizationCode,
    redirect_uri: params.redirectUri,
    client_id: OPENAI_OAUTH_CONFIG.CLIENT_ID,
    code_verifier: params.codeVerifier,
  })

  const response = await fetch(OPENAI_OAUTH_CONFIG.TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      response.status === 401
        ? 'OpenAI authentication failed: Invalid authorization code'
        : `OpenAI token exchange failed (${response.status}): ${text}`,
    )
  }

  const data = (await response.json()) as {
    access_token: string
    id_token?: string
    refresh_token: string
    expires_in: number
    token_type: string
  }

  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

export async function refreshOpenAIToken(
  refreshToken: string,
): Promise<OpenAIOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: OPENAI_OAUTH_CONFIG.CLIENT_ID,
  })

  const response = await fetch(OPENAI_OAUTH_CONFIG.TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`OpenAI token refresh failed (${response.status}): ${text}`)
  }

  const data = (await response.json()) as {
    access_token: string
    id_token?: string
    refresh_token?: string
    expires_in: number
    token_type: string
  }

  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000

export function isOpenAITokenExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt - TOKEN_EXPIRY_BUFFER_MS
}
