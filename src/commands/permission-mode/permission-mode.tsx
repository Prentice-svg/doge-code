import { feature } from 'bun:bundle'
import * as React from 'react'
import {
  setSessionBypassPermissionsMode,
} from '../../bootstrap/state.js'
import { Select } from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { Box, Link, Newline, Text } from '../../ink.js'
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js'
import { applyPermissionUpdate } from '../../utils/permissions/PermissionUpdate.js'
import {
  permissionModeTitle,
  type PermissionMode,
} from '../../utils/permissions/PermissionMode.js'
import {
  getAutoModeUnavailableNotification,
  getAutoModeUnavailableReason,
  isAutoModeGateEnabled,
  isBypassPermissionsModeDisabled,
  transitionPermissionMode,
} from '../../utils/permissions/permissionSetup.js'
import { hasSkipDangerousModePermissionPrompt, updateSettingsForSource } from '../../utils/settings/settings.js'

type RuntimeSelectablePermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'bypassPermissions'
  | 'auto'

function normalizeModeArg(arg: string): RuntimeSelectablePermissionMode | null {
  const normalized = arg.trim().toLowerCase()
  switch (normalized) {
    case 'default':
    case 'normal':
      return 'default'
    case 'acceptedits':
    case 'accept-edits':
    case 'accept':
      return 'acceptEdits'
    case 'plan':
      return 'plan'
    case 'bypasspermissions':
    case 'bypass':
    case 'dangerously-skip-permissions':
    case 'full-access':
    case 'fullaccess':
    case '完全访问':
      return 'bypassPermissions'
    case 'auto':
      return 'auto'
    default:
      return null
  }
}

function getAvailableModes(): RuntimeSelectablePermissionMode[] {
  return [
    'default',
    'acceptEdits',
    'plan',
    ...(feature('TRANSCRIPT_CLASSIFIER') ? (['auto'] as const) : []),
    'bypassPermissions',
  ]
}

function getModeDescription(mode: RuntimeSelectablePermissionMode): string {
  switch (mode) {
    case 'default':
      return '标准模式，按需询问权限'
    case 'acceptEdits':
      return '更顺畅地接受修改，但仍保留敏感权限检查'
    case 'plan':
      return '规划优先，适合先分析再执行'
    case 'auto':
      return '自动模式，按当前模型与策略决定'
    case 'bypassPermissions':
      return '完全跳过权限确认，风险最高'
  }
}

function formatModeChangedMessage(mode: RuntimeSelectablePermissionMode): string {
  if (mode === 'bypassPermissions') {
    return '已切换到 Bypass Permissions 模式，本会话将跳过权限确认。'
  }
  return `已切换到 ${permissionModeTitle(mode)} 模式。`
}

function applySessionPermissionMode(
  mode: RuntimeSelectablePermissionMode,
  setAppState: Parameters<LocalJSXCommandCall>[1]['setAppState'],
): void {
  setAppState(prev => {
    const currentMode = prev.toolPermissionContext.mode
    const nextBaseContext =
      mode === 'bypassPermissions' && !prev.toolPermissionContext.isBypassPermissionsModeAvailable
        ? {
            ...prev.toolPermissionContext,
            isBypassPermissionsModeAvailable: true,
          }
        : prev.toolPermissionContext
    const transitioned = transitionPermissionMode(
      currentMode,
      mode,
      nextBaseContext,
    )

    return {
      ...prev,
      toolPermissionContext: {
        ...applyPermissionUpdate(transitioned, {
          type: 'setMode',
          mode:
            mode === 'auto'
              ? 'default'
              : mode,
          destination: 'session',
        }),
        ...transitioned,
        mode,
        ...(mode === 'bypassPermissions'
          ? { isBypassPermissionsModeAvailable: true }
          : {}),
      },
    }
  })

  setSessionBypassPermissionsMode(mode === 'bypassPermissions')
}

function getModeBlockReason(
  mode: RuntimeSelectablePermissionMode,
  currentMode: PermissionMode,
): string | null {
  if (mode === currentMode) {
    return `当前已经是 ${permissionModeTitle(mode)} 模式。`
  }

  if (mode === 'bypassPermissions') {
    if (isBypassPermissionsModeDisabled()) {
      return '当前配置禁止启用 Bypass Permissions 模式。'
    }
    return null
  }

  if (mode === 'auto') {
    if (!feature('TRANSCRIPT_CLASSIFIER')) {
      return '当前构建不支持 auto 模式。'
    }
    if (!isAutoModeGateEnabled()) {
      const reason = getAutoModeUnavailableReason()
      return reason
        ? `当前无法启用 auto 模式：${getAutoModeUnavailableNotification(reason)}`
        : '当前无法启用 auto 模式。'
    }
  }

  return null
}

function BypassPermissionsConfirm({
  onAccept,
  onCancel,
}: {
  onAccept: () => void
  onCancel: () => void
}): React.ReactNode {
  return (
    <Dialog
      title="WARNING: 启用完全访问权限"
      color="error"
      onCancel={onCancel}
    >
      <Box flexDirection="column" gap={1}>
        <Text>
          启用后，本会话会跳过工具权限确认。
          <Newline />
          这相当于运行时开启 `--dangerously-skip-permissions` 的效果。
        </Text>
        <Text>
          只建议在可回滚、受控的环境里使用，比如沙箱、容器或测试机。
        </Text>
        <Link url="https://code.claude.com/docs/en/security" />
        <Select
          options={[
            { label: '取消', value: 'cancel' },
            { label: '确认启用', value: 'accept' },
          ]}
          onChange={value => {
            if (value === 'accept') {
              updateSettingsForSource('userSettings', {
                skipDangerousModePermissionPrompt: true,
              })
              onAccept()
              return
            }
            onCancel()
          }}
        />
      </Box>
    </Dialog>
  )
}

function PermissionModeMenu({
  currentMode,
  onCancel,
  onSelect,
}: {
  currentMode: PermissionMode
  onCancel: () => void
  onSelect: (mode: RuntimeSelectablePermissionMode) => void
}): React.ReactNode {
  return (
    <Dialog
      title="切换权限模式"
      subtitle={`当前模式：${permissionModeTitle(currentMode)}`}
      onCancel={onCancel}
    >
      <Select
        options={getAvailableModes().map(mode => ({
          label: permissionModeTitle(mode),
          value: mode,
          description: getModeDescription(mode),
        }))}
        defaultValue={currentMode as RuntimeSelectablePermissionMode}
        onChange={onSelect}
        layout="compact-vertical"
      />
    </Dialog>
  )
}

function PermissionModeCommand({
  currentMode,
  onDone,
  setAppState,
}: {
  currentMode: PermissionMode
  onDone: LocalJSXCommandOnDone
  setAppState: Parameters<LocalJSXCommandCall>[1]['setAppState']
}): React.ReactNode {
  const [pendingBypass, setPendingBypass] = React.useState(false)

  const handleModeSelection = React.useCallback(
    (mode: RuntimeSelectablePermissionMode) => {
      const blockedReason = getModeBlockReason(mode, currentMode)
      if (blockedReason) {
        onDone(blockedReason)
        return
      }

      if (
        mode === 'bypassPermissions' &&
        !hasSkipDangerousModePermissionPrompt()
      ) {
        setPendingBypass(true)
        return
      }

      applySessionPermissionMode(mode, setAppState)
      onDone(formatModeChangedMessage(mode))
    },
    [currentMode, onDone, setAppState],
  )

  if (pendingBypass) {
    return (
      <BypassPermissionsConfirm
        onAccept={() => {
          applySessionPermissionMode('bypassPermissions', setAppState)
          onDone(formatModeChangedMessage('bypassPermissions'))
        }}
        onCancel={() => onDone('已取消切换权限模式。')}
      />
    )
  }

  return (
    <PermissionModeMenu
      currentMode={currentMode}
      onCancel={() => onDone('已取消切换权限模式。')}
      onSelect={handleModeSelection}
    />
  )
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const currentMode = context.getAppState().toolPermissionContext.mode
  const trimmedArgs = args.trim()

  if (trimmedArgs) {
    const parsedMode = normalizeModeArg(trimmedArgs)
    if (!parsedMode) {
      onDone(
        '用法: /permission-mode [default|acceptEdits|plan|bypassPermissions|auto]',
      )
      return null
    }

    const blockedReason = getModeBlockReason(parsedMode, currentMode)
    if (blockedReason) {
      onDone(blockedReason)
      return null
    }

    if (
      parsedMode === 'bypassPermissions' &&
      !hasSkipDangerousModePermissionPrompt()
    ) {
      return (
        <BypassPermissionsConfirm
          onAccept={() => {
            applySessionPermissionMode('bypassPermissions', context.setAppState)
            onDone(formatModeChangedMessage('bypassPermissions'))
          }}
          onCancel={() => onDone('已取消切换权限模式。')}
        />
      )
    }

    applySessionPermissionMode(parsedMode, context.setAppState)
    onDone(formatModeChangedMessage(parsedMode))
    return null
  }

  return (
    <PermissionModeCommand
      currentMode={currentMode}
      onDone={onDone}
      setAppState={context.setAppState}
    />
  )
}
