import type { Command } from '../../commands.js'

const permissions = {
  type: 'local-jsx',
  name: 'permissions',
  aliases: ['allowed-tools'],
  description: 'Manage permission rules, or switch permission mode with an argument',
  load: () => import('./permissions.js'),
} satisfies Command

export default permissions
