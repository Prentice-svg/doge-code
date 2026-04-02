import type {
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
  BetaToolUnion,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { OpenAIOAuthAccountInfo } from '../../constants/openaiOauth.js'

type AnyBlock = Record<string, unknown>

type OpenAICodexConfig = {
  apiKey: string
  baseURL: string
  accountInfo?: OpenAIOAuthAccountInfo | null
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
}

type OpenAICodexTool = {
  type: 'function'
  name: string
  description?: string
  parameters?: unknown
  strict?: boolean
}

type OpenAICodexInputItem =
  | {
      role: 'user'
      content: Array<{ type: 'input_text'; text: string }>
    }
  | {
      role: 'assistant'
      content: Array<{ type: 'output_text'; text: string }>
    }
  | {
      type: 'function_call'
      call_id: string
      name: string
      arguments: string
    }
  | {
      type: 'function_call_output'
      call_id: string
      output: string
    }

export type OpenAICodexResponsesRequest = {
  model: string
  instructions: string
  input: OpenAICodexInputItem[]
  tools: OpenAICodexTool[]
  tool_choice: 'auto' | 'required' | { type: 'function'; name: string }
  parallel_tool_calls: boolean
  store: false
  stream: true
  include: string[]
  reasoning?: {
    effort: 'low' | 'medium' | 'high' | 'xhigh'
  }
}

type OpenAICodexStreamEvent =
  | {
      type: 'response.created'
      response?: {
        id?: string
        model?: string
      }
    }
  | {
      type: 'response.output_item.added'
      item?: {
        id?: string
        type?: string
        call_id?: string
        name?: string
      }
      output_index?: number
    }
  | {
      type: 'response.content_part.added'
      item_id?: string
      content_index?: number
      part?: {
        type?: string
      }
    }
  | {
      type: 'response.output_text.delta'
      item_id?: string
      content_index?: number
      delta?: string
    }
  | {
      type: 'response.function_call_arguments.delta'
      item_id?: string
      delta?: string
    }
  | {
      type: 'response.output_item.done'
      item?: {
        id?: string
        type?: string
        call_id?: string
        name?: string
      }
    }
  | {
      type: 'response.completed'
      response?: {
        id?: string
        model?: string
        usage?: {
          input_tokens?: number
          output_tokens?: number
        }
        output?: Array<{
          id?: string
          type?: string
        }>
      }
    }

function joinBaseUrl(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/$/, '')}${path}`
}

function parseSSEChunk(buffer: string): { events: string[]; remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const remainder = parts.pop() ?? ''
  return { events: parts, remainder }
}

function toBlocks(content: BetaMessageParam['content']): AnyBlock[] {
  return Array.isArray(content)
    ? (content as unknown as AnyBlock[])
    : [{ type: 'text', text: content }]
}

function blockTextContent(block: AnyBlock): string {
  if (typeof block.text === 'string') return block.text
  if (typeof block.content === 'string') return block.content
  if (Array.isArray(block.content)) {
    return block.content
      .map(item => {
        if (
          item &&
          typeof item === 'object' &&
          'text' in item &&
          typeof (item as Record<string, unknown>).text === 'string'
        ) {
          return (item as Record<string, string>).text
        }
        return JSON.stringify(item)
      })
      .join('\n')
  }
  if (block.content !== undefined) return JSON.stringify(block.content)
  return ''
}

function getInstructions(
  system?: string | Array<{ type?: string; text?: string }>,
): string {
  if (!system) return 'You are a helpful assistant.'
  if (typeof system === 'string') return system
  return system.map(block => block.text ?? '').join('\n').trim() || 'You are a helpful assistant.'
}

function getCodexToolDefinitions(tools?: BetaToolUnion[]): OpenAICodexTool[] {
  if (!tools || tools.length === 0) return []
  return tools.flatMap(tool => {
    const record = tool as unknown as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name : undefined
    if (!name) return []
    return [{
      type: 'function' as const,
      name,
      description:
        typeof record.description === 'string' ? record.description : undefined,
      parameters: record.input_schema,
      strict: record.strict === true,
    }]
  })
}

export function convertAnthropicRequestToOpenAICodexResponses(input: {
  model: string
  system?: string | Array<{ type?: string; text?: string }>
  messages: BetaMessageParam[]
  tools?: BetaToolUnion[]
  tool_choice?: BetaToolChoiceAuto | BetaToolChoiceTool
}): OpenAICodexResponsesRequest {
  const configuredModel = process.env.ANTHROPIC_MODEL?.trim()
  const targetModel = configuredModel || input.model
  const requestInput: OpenAICodexInputItem[] = []

  for (const message of input.messages) {
    if (message.role === 'user') {
      const blocks = toBlocks(message.content)
      const textBlocks = blocks
        .filter(block => block.type === 'text')
        .map(block => ({
          type: 'input_text' as const,
          text: blockTextContent(block),
        }))
        .filter(block => block.text.trim() !== '')

      if (textBlocks.length > 0) {
        requestInput.push({
          role: 'user',
          content: textBlocks,
        })
      }

      for (const result of blocks.filter(block => block.type === 'tool_result')) {
        const callId =
          typeof result.tool_use_id === 'string' ? result.tool_use_id : undefined
        if (!callId) continue
        requestInput.push({
          type: 'function_call_output',
          call_id: callId,
          output: blockTextContent(result),
        })
      }
      continue
    }

    if (message.role === 'assistant') {
      const blocks = Array.isArray(message.content)
        ? (message.content as unknown as AnyBlock[])
        : []

      const textBlocks = blocks
        .filter(block => block.type === 'text')
        .map(block => ({
          type: 'output_text' as const,
          text: blockTextContent(block),
        }))
        .filter(block => block.text.trim() !== '')

      if (textBlocks.length > 0) {
        requestInput.push({
          role: 'assistant',
          content: textBlocks,
        })
      }

      for (const block of blocks.filter(item => item.type === 'tool_use')) {
        const callId = typeof block.id === 'string' ? block.id : undefined
        const name = typeof block.name === 'string' ? block.name : undefined
        if (!callId || !name) continue
        requestInput.push({
          type: 'function_call',
          call_id: callId,
          name,
          arguments:
            typeof block.input === 'string'
              ? block.input
              : JSON.stringify(block.input ?? {}),
        })
      }
    }
  }

  const tools = getCodexToolDefinitions(input.tools)

  return {
    model: targetModel,
    instructions: getInstructions(input.system),
    input: requestInput,
    tools,
    tool_choice:
      input.tool_choice?.type === 'tool'
        ? {
            type: 'function',
            name: input.tool_choice.name,
          }
        : 'auto',
    parallel_tool_calls: false,
    reasoning: { effort: 'medium' },
    store: false,
    stream: true,
    include: [],
  }
}

export async function createOpenAICodexStream(
  config: OpenAICodexConfig,
  request: OpenAICodexResponsesRequest,
  signal?: AbortSignal,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const response = await (config.fetch ?? globalThis.fetch)(
    joinBaseUrl(config.baseURL, '/responses'),
    {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        authorization: `Bearer ${config.apiKey}`,
        ...(config.accountInfo?.accountId
          ? { 'chatgpt-account-id': config.accountInfo.accountId }
          : {}),
        ...config.headers,
      },
      body: JSON.stringify(request),
    },
  )

  if (!response.ok || !response.body) {
    let responseText = ''
    try {
      responseText = await response.text()
    } catch {
      responseText = ''
    }
    throw new Error(
      `OpenAI Codex request failed with status ${response.status}${responseText ? `: ${responseText}` : ''}`,
    )
  }

  return response.body.getReader()
}

export async function* createAnthropicStreamFromOpenAICodex(input: {
  reader: ReadableStreamDefaultReader<Uint8Array>
  model: string
}): AsyncGenerator<BetaRawMessageStreamEvent, BetaMessage, void> {
  const decoder = new TextDecoder()
  let buffer = ''
  let started = false
  let messageId = 'openai-codex'
  const itemIndexes = new Map<string, number>()
  const itemTypes = new Map<string, string>()
  let nextContentIndex = 0
  let promptTokens = 0
  let completionTokens = 0
  let sawToolUse = false

  while (true) {
    const { done, value } = await input.reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSSEChunk(buffer)
    buffer = parsed.remainder

    for (const rawEvent of parsed.events) {
      const dataLines = rawEvent
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())

      for (const data of dataLines) {
        if (!data) continue
        const event = JSON.parse(data) as OpenAICodexStreamEvent
        if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
          throw new Error(
            `[openaiCodex] invalid stream chunk: ${String(data).slice(0, 500)}`,
          )
        }

        if (!started && event.type === 'response.created') {
          started = true
          messageId = event.response?.id ?? messageId
          yield {
            type: 'message_start',
            message: {
              id: messageId,
              type: 'message',
              role: 'assistant',
              model: input.model,
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: {
                input_tokens: 0,
                output_tokens: 0,
              },
            },
          } as BetaRawMessageStreamEvent
          continue
        }

        if (event.type === 'response.output_item.added') {
          const item = event.item
          if (!item?.id || !item.type || item.type === 'reasoning') continue
          const index = nextContentIndex++
          itemIndexes.set(item.id, index)
          itemTypes.set(item.id, item.type)

          if (item.type === 'function_call') {
            sawToolUse = true
            yield {
              type: 'content_block_start',
              index,
              content_block: {
                type: 'tool_use',
                id: item.call_id ?? item.id,
                name: item.name ?? '',
                input: '',
              },
            } as BetaRawMessageStreamEvent
          }
          continue
        }

        if (event.type === 'response.content_part.added') {
          const itemId = event.item_id
          const index =
            itemId && itemIndexes.has(itemId)
              ? itemIndexes.get(itemId)
              : undefined
          if (
            itemId &&
            index !== undefined &&
            event.part?.type === 'output_text' &&
            itemTypes.get(itemId) === 'message'
          ) {
            yield {
              type: 'content_block_start',
              index,
              content_block: {
                type: 'text',
                text: '',
              },
            } as BetaRawMessageStreamEvent
          }
          continue
        }

        if (event.type === 'response.output_text.delta') {
          const itemId = event.item_id
          const index =
            itemId && itemIndexes.has(itemId)
              ? itemIndexes.get(itemId)
              : undefined
          if (index === undefined || !event.delta) continue
          yield {
            type: 'content_block_delta',
            index,
            delta: {
              type: 'text_delta',
              text: event.delta,
            },
          } as BetaRawMessageStreamEvent
          continue
        }

        if (event.type === 'response.function_call_arguments.delta') {
          const itemId = event.item_id
          const index =
            itemId && itemIndexes.has(itemId)
              ? itemIndexes.get(itemId)
              : undefined
          if (index === undefined || !event.delta) continue
          yield {
            type: 'content_block_delta',
            index,
            delta: {
              type: 'input_json_delta',
              partial_json: event.delta,
            },
          } as BetaRawMessageStreamEvent
          continue
        }

        if (event.type === 'response.output_item.done') {
          const itemId = event.item?.id
          const index =
            itemId && itemIndexes.has(itemId)
              ? itemIndexes.get(itemId)
              : undefined
          if (index === undefined) continue
          yield {
            type: 'content_block_stop',
            index,
          } as BetaRawMessageStreamEvent
          continue
        }

        if (event.type === 'response.completed') {
          messageId = event.response?.id ?? messageId
          promptTokens = event.response?.usage?.input_tokens ?? promptTokens
          completionTokens =
            event.response?.usage?.output_tokens ?? completionTokens

          yield {
            type: 'message_delta',
            delta: {
              stop_reason: sawToolUse ? 'tool_use' : 'end_turn',
              stop_sequence: null,
            },
            usage: {
              output_tokens: completionTokens,
            },
          } as BetaRawMessageStreamEvent

          yield {
            type: 'message_stop',
          } as BetaRawMessageStreamEvent

          return {
            id: messageId,
            type: 'message',
            role: 'assistant',
            model: event.response?.model ?? input.model,
            content: [],
            stop_reason: sawToolUse ? 'tool_use' : 'end_turn',
            stop_sequence: null,
            usage: {
              input_tokens: promptTokens,
              output_tokens: completionTokens,
            },
          } as BetaMessage
        }
      }
    }
  }

  throw new Error(
    `[openaiCodex] stream ended unexpectedly before message_stop for model=${input.model}`,
  )
}
