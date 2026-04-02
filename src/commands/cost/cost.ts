import { formatTotalCost } from '../../cost-tracker.js'
import { currentLimits } from '../../services/claudeAiLimits.js'
import type { LocalCommandCall } from '../../types/command.js'
import { getAccountInformationAsync, isClaudeAISubscriber } from '../../utils/auth.js'
import { readCustomApiStorage } from '../../utils/customApiStorage.js'
import {
  getTotalInputTokens,
  getTotalOutputTokens,
} from '../../bootstrap/state.js'

export const call: LocalCommandCall = async () => {
  const customApi = readCustomApiStorage()
  const isOpenAIOAuth =
    customApi.provider === 'openai' && customApi.authMode === 'oauth'

  if (isOpenAIOAuth) {
    const accountInfo = await getAccountInformationAsync()
    const lines = [
      'OpenAI OAuth cost summary',
      'This session is using the ChatGPT Codex backend, so billable usage is best interpreted from the account usage windows below.',
      accountInfo?.fiveHourUsage ? `5h usage: ${accountInfo.fiveHourUsage}` : undefined,
      accountInfo?.weeklyUsage ? `Weekly usage: ${accountInfo.weeklyUsage}` : undefined,
      accountInfo?.usageCreditBalance ? `Credits: ${accountInfo.usageCreditBalance}` : undefined,
      accountInfo?.usageError ? `Usage status: ${accountInfo.usageError}` : undefined,
      '',
      `Tracked input tokens: ${getTotalInputTokens()}`,
      `Tracked output tokens: ${getTotalOutputTokens()}`,
      '',
      formatTotalCost(),
    ].filter((line): line is string => Boolean(line))

    return { type: 'text', value: lines.join('\n') }
  }

  if (isClaudeAISubscriber()) {
    let value: string

    if (currentLimits.isUsingOverage) {
      value =
        'You are currently using your overages to power your Claude Code usage. We will automatically switch you back to your subscription rate limits when they reset'
    } else {
      value =
        'You are currently using your subscription to power your Claude Code usage'
    }

    if (process.env.USER_TYPE === 'ant') {
      value += `\n\n[ANT-ONLY] Showing cost anyway:\n ${formatTotalCost()}`
    }
    return { type: 'text', value }
  }
  return { type: 'text', value: formatTotalCost() }
}
