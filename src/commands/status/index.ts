import type { Command } from '../../commands.js'

const status = {
  type: 'local',
  name: 'status',
  description:
    'Show Claude Code status including version, model, account, API connectivity, and tool statuses',
  immediate: true,
  supportsNonInteractive: true,
  load: () => import('./status.js'),
} satisfies Command

export default status
