import type { LocalCommandCall } from '../../types/command.js'
import {
  getOpenAIOAuthUnsupportedModelMessage,
  isOpenAIOAuthSupportedModel,
} from '../../constants/openaiOauth.js'
import { saveGlobalConfig } from '../../utils/config.js'
import { readCustomApiStorage, writeCustomApiStorage } from '../../utils/customApiStorage.js'

export const call: LocalCommandCall = async (args, _context) => {
  const nextModel = args.trim()
  if (!nextModel) {
    return {
      type: 'text',
      value: 'Usage: /add-model <model-name>',
    }
  }

  const current = readCustomApiStorage()
  if (
    current.provider === 'openai' &&
    current.authMode === 'oauth' &&
    !isOpenAIOAuthSupportedModel(nextModel)
  ) {
    return {
      type: 'text',
      value: getOpenAIOAuthUnsupportedModelMessage(nextModel),
    }
  }

  saveGlobalConfig(current => ({
    ...current,
    customApiEndpoint: {
      ...current.customApiEndpoint,
      model: nextModel,
      savedModels: [...new Set([...(current.customApiEndpoint?.savedModels ?? []), nextModel])],
    },
  }))
  const secureStored = current
  writeCustomApiStorage({
    ...secureStored,
    model: nextModel,
    savedModels: [...new Set([...(secureStored.savedModels ?? []), nextModel])]
  })

  process.env.ANTHROPIC_MODEL = nextModel

  return {
    type: 'text',
    value: `Added custom model: ${nextModel}`,
  }
}
