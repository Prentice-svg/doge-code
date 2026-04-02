import type { Command } from '../../commands.js'

const permissionMode = {
  type: 'local-jsx',
  name: 'permission-mode',
  description: 'Switch the current session permission mode',
  argumentHint: '[default|acceptEdits|plan|bypassPermissions|auto]',
  load: () => import('./permission-mode.js'),
} satisfies Command

export default permissionMode
