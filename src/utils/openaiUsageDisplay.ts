import type {
  OpenAIUsageCredits,
  OpenAIUsageWindow,
} from '../services/oauth/openaiUsage.js'

const PROGRESS_BAR_WIDTH = 20

function clampPercentage(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function formatPercent(value: number | undefined): string {
  return `${Math.round(clampPercentage(value))}%`
}

function buildProgressBar(value: number | undefined): string {
  const percent = clampPercentage(value)
  const filled = Math.round((percent / 100) * PROGRESS_BAR_WIDTH)
  return `[${'#'.repeat(filled)}${'-'.repeat(PROGRESS_BAR_WIDTH - filled)}]`
}

function formatWindowSpan(windowMinutes?: number): string | undefined {
  if (!windowMinutes) return undefined
  if (windowMinutes >= 24 * 60) {
    return `${Math.round(windowMinutes / (24 * 60))}d window`
  }
  if (windowMinutes >= 60) {
    return `${Math.round(windowMinutes / 60)}h window`
  }
  return `${windowMinutes}m window`
}

function formatResetTime(resetsAt?: string): string | undefined {
  if (!resetsAt) return undefined
  const resetDate = new Date(resetsAt)
  if (Number.isNaN(resetDate.getTime())) return undefined
  return `resets ${resetDate.toLocaleString()}`
}

export function getOpenAIUsageStatusLabel(
  window?: OpenAIUsageWindow,
): string | undefined {
  if (!window) return undefined
  const usedPercent = clampPercentage(window.usedPercent)
  if (usedPercent >= 90) return 'Near limit'
  if (usedPercent >= 70) return 'Busy'
  return 'Healthy'
}

export function formatOpenAIUsageWindow(window?: OpenAIUsageWindow): string | undefined {
  if (!window) return undefined
  const usedPercent = clampPercentage(window.usedPercent)
  const remainingPercent = clampPercentage(100 - usedPercent)
  const parts = [
    getOpenAIUsageStatusLabel(window),
    `${buildProgressBar(usedPercent)} ${formatPercent(usedPercent)} used`,
    `${formatPercent(remainingPercent)} remaining`,
    formatWindowSpan(window.windowMinutes),
    formatResetTime(window.resetsAt),
  ].filter((part): part is string => Boolean(part))

  return parts.join(' | ')
}

export function formatOpenAIUsageWindowLines(
  label: string,
  window?: OpenAIUsageWindow,
): string[] {
  const summary = formatOpenAIUsageWindow(window)
  return summary ? [`${label}: ${summary}`] : []
}

export function formatOpenAIUsageCredits(
  credits?: OpenAIUsageCredits,
): string | undefined {
  if (!credits) return undefined
  if (credits.unlimited) return 'Unlimited'

  const parts = [
    credits.hasCredits ? 'Credits available' : 'No credits',
    credits.balance,
  ].filter((part): part is string => Boolean(part))

  return parts.join(' | ')
}

export function formatOpenAIUsageUpdatedAt(value?: string): string | undefined {
  if (!value) return undefined
  const updatedAt = new Date(value)
  if (Number.isNaN(updatedAt.getTime())) return undefined
  return updatedAt.toLocaleString()
}
