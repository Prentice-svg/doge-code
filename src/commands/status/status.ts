import type { LocalCommandCall } from '../../types/command.js'
import { getSessionId } from '../../bootstrap/state.js'
import { OPENAI_OAUTH_CONFIG } from '../../constants/openaiOauth.js'
import { getCwd } from '../../utils/cwd.js'
import { getCurrentSessionTitle } from '../../utils/sessionStorage.js'
import { getAccountInformationAsync } from '../../utils/auth.js'
import { readCustomApiStorage } from '../../utils/customApiStorage.js'
import { formatOpenAIUsageWindowLines } from '../../utils/openaiUsageDisplay.js'
import { permissionModeTitle } from '../../utils/permissions/PermissionMode.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import { getProxyUrl } from '../../utils/proxy.js'
import { getMTLSConfig } from '../../utils/mtls.js'
import { readOpenAIOAuthTokens } from '../../utils/openaiOauthStorage.js'
import {
  getLastApiCompletionTimestamp,
  getLastMainRequestId,
} from '../../bootstrap/state.js'
import packageJson from '../../../package.json' with { type: 'json' }

function pushLine(lines: string[], label: string, value: string | undefined): void {
  if (!value) return
  lines.push(`${label}: ${value}`)
}

function formatAccountSection(
  accountInfo: Awaited<ReturnType<typeof getAccountInformationAsync>>,
): string[] {
  if (!accountInfo) return []

  const lines: string[] = []
  pushLine(lines, 'Login method', accountInfo.subscription ? `${accountInfo.subscription} Account` : accountInfo.provider === 'openai' ? 'OpenAI Account' : undefined)
  pushLine(lines, 'Auth token', accountInfo.tokenSource)
  pushLine(lines, 'API key', accountInfo.apiKeySource)
  pushLine(lines, 'Token status', accountInfo.tokenStatus)
  pushLine(lines, 'Plan', accountInfo.planType)
  pushLine(lines, 'Account ID', process.env.IS_DEMO ? undefined : accountInfo.accountId)
  pushLine(lines, 'Organization', process.env.IS_DEMO ? undefined : accountInfo.organization)
  pushLine(lines, 'Name', process.env.IS_DEMO ? undefined : accountInfo.name)
  pushLine(lines, 'Email', process.env.IS_DEMO ? undefined : accountInfo.email)
  pushLine(lines, 'Usage source', accountInfo.usageSource)
  lines.push(...formatOpenAIUsageWindowLines('5h usage', accountInfo.usagePrimaryWindow))
  lines.push(...formatOpenAIUsageWindowLines('Weekly usage', accountInfo.usageSecondaryWindow))
  pushLine(lines, 'Credits', accountInfo.usageCreditBalance)
  pushLine(lines, 'Usage status', accountInfo.usageError)
  return lines
}

function formatProviderSection(): string[] {
  const apiProvider = getAPIProvider()
  const customApi = readCustomApiStorage()
  const openAITokens = readOpenAIOAuthTokens()
  const lines: string[] = []

  if (apiProvider !== 'firstParty') {
    const providerLabel =
      {
        bedrock: 'AWS Bedrock',
        vertex: 'Google Vertex AI',
        foundry: 'Microsoft Foundry',
      }[apiProvider] ?? apiProvider
    pushLine(lines, 'API provider', providerLabel)
  } else if (customApi.provider === 'openai') {
    pushLine(
      lines,
      'API provider',
      customApi.authMode === 'oauth'
        ? 'OpenAI Codex backend'
        : 'OpenAI-compatible',
    )
    pushLine(lines, 'Auth mode', customApi.authMode === 'oauth' ? 'OAuth' : 'API key')
    if (customApi.authMode === 'oauth') {
      pushLine(
        lines,
        'Supported models',
        String(OPENAI_OAUTH_CONFIG.SUPPORTED_MODELS.length),
      )
      pushLine(
        lines,
        'Saved models',
        (customApi.savedModels ?? [])
          .filter(Boolean)
          .filter(model => OPENAI_OAUTH_CONFIG.SUPPORTED_MODELS.includes(model as (typeof OPENAI_OAUTH_CONFIG.SUPPORTED_MODELS)[number]))
          .join(', '),
      )
      pushLine(
        lines,
        'Refresh token',
        openAITokens?.refreshToken ? 'Available' : 'Missing',
      )
      pushLine(
        lines,
        'Token expires at',
        openAITokens?.expiresAt
          ? new Date(openAITokens.expiresAt).toLocaleString()
          : undefined,
      )
    }
  } else {
    pushLine(lines, 'API provider', 'Anthropic')
  }

  pushLine(lines, 'API base URL', process.env.ANTHROPIC_BASE_URL)
  pushLine(lines, 'Model', process.env.ANTHROPIC_MODEL)
  pushLine(lines, 'Proxy', getProxyUrl())

  const mtlsConfig = getMTLSConfig()
  if (process.env.NODE_EXTRA_CA_CERTS) {
    pushLine(lines, 'Additional CA cert(s)', process.env.NODE_EXTRA_CA_CERTS)
  }
  if (process.env.CLAUDE_CODE_CLIENT_CERT && mtlsConfig?.cert) {
    pushLine(lines, 'mTLS cert', process.env.CLAUDE_CODE_CLIENT_CERT)
  }
  if (process.env.CLAUDE_CODE_CLIENT_KEY && mtlsConfig?.key) {
    pushLine(lines, 'mTLS key', process.env.CLAUDE_CODE_CLIENT_KEY)
  }

  return lines
}

function formatRecentRequestSection(): string[] {
  const lines: string[] = []
  const lastCompletion = getLastApiCompletionTimestamp()
  const lastRequestId = getLastMainRequestId()

  if (!lastCompletion && !lastRequestId) {
    return ['Recent request: No successful main-thread API request recorded yet']
  }

  if (lastCompletion) {
    const completedAt = new Date(lastCompletion)
    const ageMs = Date.now() - lastCompletion
    const ageMinutes = Math.floor(ageMs / 60000)
    const healthLabel =
      ageMs < 5 * 60 * 1000
        ? 'Healthy recently'
        : ageMs < 60 * 60 * 1000
          ? 'Idle'
          : 'Stale'

    pushLine(lines, 'Recent request', healthLabel)
    pushLine(lines, 'Last success', completedAt.toLocaleString())
    pushLine(
      lines,
      'Last success age',
      ageMinutes < 1 ? 'less than 1 minute ago' : `${ageMinutes} minute(s) ago`,
    )
  }

  pushLine(lines, 'Last request ID', lastRequestId)
  return lines
}

export const call: LocalCommandCall = async (_args, context) => {
  const sessionId = getSessionId()
  const sessionName = getCurrentSessionTitle(sessionId)
  const accountInfo = await getAccountInformationAsync()
  const permissionMode = context.getAppState().toolPermissionContext.mode

  const lines = [
    'Status',
    '',
    'Session:',
    `Version: ${packageJson.version}`,
    `Session ID: ${sessionId}`,
    `Session name: ${sessionName ?? '(unnamed)'}`,
    `cwd: ${getCwd()}`,
    `Permission mode: ${permissionModeTitle(permissionMode)}`,
    '',
    'Account:',
    '',
    ...formatAccountSection(accountInfo),
    '',
    'Provider:',
    ...formatProviderSection(),
    '',
    'Request health:',
    ...formatRecentRequestSection(),
  ].filter((line, index, array) => {
    if (line !== '') return true
    return index > 0 && array[index - 1] !== ''
  })

  return {
    type: 'text',
    value: lines.join('\n'),
  }
}
