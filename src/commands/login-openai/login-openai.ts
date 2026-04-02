import type { LocalCommandCall } from '../../types/command.js'
import { OPENAI_OAUTH_CONFIG } from '../../constants/openaiOauth.js'
import { AuthCodeListener } from '../../services/oauth/auth-code-listener.js'
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from '../../services/oauth/crypto.js'
import {
  buildOpenAIAuthUrl,
  exchangeOpenAICodeForTokens,
} from '../../services/oauth/openaiOauthClient.js'
import { openBrowser } from '../../utils/browser.js'
import {
  readCustomApiStorage,
  writeCustomApiStorage,
} from '../../utils/customApiStorage.js'
import { saveOpenAIOAuthTokens } from '../../utils/openaiOauthStorage.js'

export const call: LocalCommandCall = async (_args, _context) => {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()

  const listener = new AuthCodeListener(OPENAI_OAUTH_CONFIG.CALLBACK_PATH)
  try {
    let port: number
    try {
      port = await listener.start(OPENAI_OAUTH_CONFIG.REDIRECT_PORT)
    } catch {
      return {
        type: 'text',
        value: `Failed to start OAuth callback server: port ${OPENAI_OAUTH_CONFIG.REDIRECT_PORT} is already in use. Close any process using that port and try again.`,
      }
    }

    const authUrl = buildOpenAIAuthUrl({ codeChallenge, state, port })

    const authCode = await listener.waitForAuthorization(state, async () => {
      await openBrowser(authUrl)
    })

    const redirectUri = `http://localhost:${port}${OPENAI_OAUTH_CONFIG.CALLBACK_PATH}`
    const tokens = await exchangeOpenAICodeForTokens({
      authorizationCode: authCode,
      codeVerifier,
      redirectUri,
    })

    listener.handleSuccessRedirect([], (res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(
        '<html><body><h1>OpenAI login successful!</h1><p>You can close this tab.</p></body></html>',
      )
    })

    saveOpenAIOAuthTokens(tokens)

    const current = readCustomApiStorage()
    const nextModel =
      current.provider === 'openai' && current.model?.trim()
        ? current.model.trim()
        : OPENAI_OAUTH_CONFIG.DEFAULT_MODEL
    const nextSavedModels = [...new Set([...(current.savedModels ?? []), nextModel])]

    writeCustomApiStorage({
      ...current,
      provider: 'openai',
      authMode: 'oauth',
      baseURL: OPENAI_OAUTH_CONFIG.API_BASE_URL,
      apiKey: undefined,
      model: nextModel,
      savedModels: nextSavedModels,
    })

    process.env.ANTHROPIC_BASE_URL = OPENAI_OAUTH_CONFIG.API_BASE_URL
    process.env.ANTHROPIC_MODEL = nextModel
    process.env.DOGE_API_KEY = tokens.accessToken

    return {
      type: 'text',
      value: `OpenAI OAuth login successful. Using model ${nextModel}.`,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error during OAuth flow'
    return {
      type: 'text',
      value: `OpenAI OAuth login failed: ${message}`,
    }
  } finally {
    listener.close()
  }
}
