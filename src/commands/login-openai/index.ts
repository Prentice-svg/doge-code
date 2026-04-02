import type { Command } from '../../commands.js'

export default {
  type: 'local',
  name: 'login-openai',
  description: 'Sign in with your OpenAI account (Codex OAuth)',
  isEnabled: () => true,
  load: () => import('./login-openai.js'),
} satisfies Command
