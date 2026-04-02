import type { LocalCommandCall } from '../../types/command.js'
import {
  OPENAI_OAUTH_CONFIG,
  isOpenAIOAuthSupportedModel,
} from '../../constants/openaiOauth.js'
import { formatDuration, formatNumber } from '../../utils/format.js'
import { getAccountInformationAsync } from '../../utils/auth.js'
import { readCustomApiStorage } from '../../utils/customApiStorage.js'
import { aggregateClaudeCodeStatsForRange } from '../../utils/stats.js'

function formatTopModels(
  modelUsage: Awaited<ReturnType<typeof aggregateClaudeCodeStatsForRange>>['modelUsage'],
  options: {
    onlyOpenAIModels?: boolean
    limit?: number
  } = {},
): string[] {
  const { onlyOpenAIModels = false, limit = 5 } = options
  return Object.entries(modelUsage)
    .filter(([model]) =>
      onlyOpenAIModels ? isOpenAIOAuthSupportedModel(model) : true,
    )
    .map(([model, usage]) => ({
      model,
      totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, limit)
    .map(item => `${item.model}: ${formatNumber(item.totalTokens)} tokens`)
}

export const call: LocalCommandCall = async () => {
  const [stats, last7dStats, last30dStats, accountInfo] = await Promise.all([
    aggregateClaudeCodeStatsForRange('all'),
    aggregateClaudeCodeStatsForRange('7d'),
    aggregateClaudeCodeStatsForRange('30d'),
    getAccountInformationAsync(),
  ])

  if (!stats || stats.totalSessions === 0) {
    return {
      type: 'text',
      value: 'Stats\nNo usage stats available yet.',
    }
  }

  const customApi = readCustomApiStorage()
  const currentModel =
    process.env.ANTHROPIC_MODEL ?? customApi.model ?? 'unknown'
  const isOpenAIOAuth =
    customApi.provider === 'openai' && customApi.authMode === 'oauth'
  const longestSession = stats.longestSession
    ? `${formatDuration(stats.longestSession.duration)} (${stats.longestSession.sessionId})`
    : undefined
  const recent7dTopModel = formatTopModels(last7dStats.modelUsage)[0]
  const recent30dTopModel = formatTopModels(last30dStats.modelUsage)[0]
  const recent7dOpenAITopModels = formatTopModels(last7dStats.modelUsage, {
    onlyOpenAIModels: true,
    limit: 3,
  })
  const recent30dOpenAITopModels = formatTopModels(last30dStats.modelUsage, {
    onlyOpenAIModels: true,
    limit: 3,
  })
  const allTimeOpenAITopModels = formatTopModels(stats.modelUsage, {
    onlyOpenAIModels: true,
    limit: 5,
  })
  const recent7dOpenAITopModel = recent7dOpenAITopModels[0]
  const recent30dOpenAITopModel = recent30dOpenAITopModels[0]

  const lines = [
    'Stats',
    '',
    'Current session:',
    `Current model: ${currentModel}`,
    accountInfo?.planType ? `Current plan: ${accountInfo.planType}` : undefined,
    '',
    ...(isOpenAIOAuth
      ? [
        'OpenAI OAuth account:',
          `Supported models: ${OPENAI_OAUTH_CONFIG.SUPPORTED_MODELS.length}`,
          accountInfo?.usageSource
            ? `Usage source: ${accountInfo.usageSource}`
            : undefined,
          accountInfo?.fiveHourUsage
            ? `5h usage: ${accountInfo.fiveHourUsage}`
            : undefined,
          accountInfo?.weeklyUsage
            ? `Weekly usage: ${accountInfo.weeklyUsage}`
            : undefined,
          accountInfo?.usageCreditBalance
            ? `Credits: ${accountInfo.usageCreditBalance}`
            : undefined,
          accountInfo?.usageError
            ? `Usage status: ${accountInfo.usageError}`
            : undefined,
          recent7dOpenAITopModel
            ? `Recent 7d OpenAI top model: ${recent7dOpenAITopModel}`
            : 'Recent 7d OpenAI top model: No local OpenAI model history yet',
          recent30dOpenAITopModel
            ? `Recent 30d OpenAI top model: ${recent30dOpenAITopModel}`
            : undefined,
          ...(
            recent7dOpenAITopModels.length > 0
              ? ['Recent 7d OpenAI models:', ...recent7dOpenAITopModels]
              : []
          ),
          ...(
            recent30dOpenAITopModels.length > 0
              ? ['Recent 30d OpenAI models:', ...recent30dOpenAITopModels]
              : []
          ),
          '',
        ]
      : []),
    'Local history, recent 7 days:',
    `Sessions: ${formatNumber(last7dStats.totalSessions)}`,
    `Messages: ${formatNumber(last7dStats.totalMessages)}`,
    `Active days: ${formatNumber(last7dStats.activeDays)}`,
    recent7dTopModel ? `Top model: ${recent7dTopModel}` : undefined,
    '',
    'Local history, recent 30 days:',
    `Sessions: ${formatNumber(last30dStats.totalSessions)}`,
    `Messages: ${formatNumber(last30dStats.totalMessages)}`,
    `Active days: ${formatNumber(last30dStats.activeDays)}`,
    recent30dTopModel ? `Top model: ${recent30dTopModel}` : undefined,
    '',
    'Local history, all time:',
    `Sessions: ${formatNumber(stats.totalSessions)}`,
    `Messages: ${formatNumber(stats.totalMessages)}`,
    `Active days: ${formatNumber(stats.activeDays)}`,
    `Current streak: ${formatNumber(stats.streaks.currentStreak)} day(s)`,
    `Longest streak: ${formatNumber(stats.streaks.longestStreak)} day(s)`,
    stats.firstSessionDate ? `First session: ${new Date(stats.firstSessionDate).toLocaleString()}` : undefined,
    stats.lastSessionDate ? `Last session: ${new Date(stats.lastSessionDate).toLocaleString()}` : undefined,
    longestSession ? `Longest session: ${longestSession}` : undefined,
    stats.peakActivityDay ? `Peak activity day: ${stats.peakActivityDay}` : undefined,
    stats.peakActivityHour !== null ? `Peak activity hour: ${stats.peakActivityHour}:00` : undefined,
    '',
    'Top models:',
    ...formatTopModels(stats.modelUsage),
    ...(isOpenAIOAuth && allTimeOpenAITopModels.length > 0
      ? ['', 'Top OpenAI models:', ...allTimeOpenAITopModels]
      : []),
  ].filter((line): line is string => Boolean(line))

  return {
    type: 'text',
    value: lines.join('\n'),
  }
}
