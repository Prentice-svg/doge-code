import type { Command } from '../../commands.js'

const stats = {
  type: 'local',
  name: 'stats',
  description: 'Show your Claude Code usage statistics and activity',
  supportsNonInteractive: true,
  load: () => import('./stats.js'),
} satisfies Command

export default stats
