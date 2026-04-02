export type OpenAIUsageWindow = {
  usedPercent: number
  resetsAt?: string
  windowMinutes?: number
}

export type OpenAIUsageCredits = {
  hasCredits: boolean
  unlimited: boolean
  balance?: string
}

export type OpenAIUsageSnapshot = {
  planType?: string
  primary?: OpenAIUsageWindow
  secondary?: OpenAIUsageWindow
  credits?: OpenAIUsageCredits
}

const OPENAI_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'

export async function fetchOpenAIUsageSnapshot(params: {
  accessToken: string
  accountId: string
  fetchImpl?: typeof globalThis.fetch
}): Promise<OpenAIUsageSnapshot | null> {
  const response = await (params.fetchImpl ?? globalThis.fetch)(OPENAI_USAGE_URL, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${params.accessToken}`,
      'chatgpt-account-id': params.accountId,
      'user-agent': 'doge-code',
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `OpenAI usage request failed (${response.status})${text ? `: ${text}` : ''}`,
    )
  }

  const data = (await response.json()) as Record<string, unknown>
  return parseOpenAIUsageSnapshot(data)
}

function parseOpenAIUsageSnapshot(
  data: Record<string, unknown>,
): OpenAIUsageSnapshot | null {
  const rateLimit =
    typeof data.rate_limit === 'object' && data.rate_limit !== null
      ? (data.rate_limit as Record<string, unknown>)
      : undefined

  const snapshot: OpenAIUsageSnapshot = {
    planType: typeof data.plan_type === 'string' ? data.plan_type : undefined,
    credits: parseCredits(data.credits),
    primary: parseWindow(rateLimit?.primary_window),
    secondary: parseWindow(rateLimit?.secondary_window),
  }

  return snapshot.primary || snapshot.secondary || snapshot.credits || snapshot.planType
    ? snapshot
    : null
}

function parseWindow(value: unknown): OpenAIUsageWindow | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const usedPercent = toNumber(record.used_percent)
  if (usedPercent === undefined) return undefined

  return {
    usedPercent,
    resetsAt:
      typeof record.reset_at === 'string'
        ? record.reset_at
        : typeof record.reset_at === 'number'
          ? new Date(
              record.reset_at < 1_000_000_000_000
                ? record.reset_at * 1000
                : record.reset_at,
            ).toISOString()
          : undefined,
    windowMinutes:
      typeof record.limit_window_seconds === 'number'
        ? Math.ceil(record.limit_window_seconds / 60)
        : undefined,
  }
}

function parseCredits(value: unknown): OpenAIUsageCredits | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  return {
    hasCredits: record.has_credits === true,
    unlimited: record.unlimited === true,
    balance: typeof record.balance === 'string' ? record.balance : undefined,
  }
}

function toNumber(value: unknown): number | undefined {
  return typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))
      ? Number(value)
      : undefined
}
