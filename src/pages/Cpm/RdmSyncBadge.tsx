/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useState } from 'react'
import { Button, Popover, Space, Switch, Tag, message } from 'antd'
import { SyncOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import HelpPopover from '@/components/HelpPopover'
import type { CpmRdmSyncVO, CpmSyncState } from '@/api/cpm'
import './cpm.css'

/**
 * RDM 进度回写徽标。
 *
 * 存在的全部理由是：**回写失败必须看得见**。CPM 是过程层事实、RDM 是交付真值，
 * 让 CPM 因为 RDM 的规则（PRD 只能走提交评审、完成必须有交付说明）而拒绝保存是错的；
 * 但把回写失败静默吞掉更错——那会让人以为 RDM 甘特图与自己的记录是一致的。
 * 所以：写入照常成功，结果如实回显，并给出唯一的补救入口「重新對齊」。
 */

interface Props {
  /** 只有关联了 RDM 任务的条目才有值；null/undefined 都表示「这一行不该出现回写徽标」 */
  sync?: CpmRdmSyncVO | null
  /**
   * 服务端回写总闸（`cpm.rdm-sync-enabled`）。默认按「开」处理：只有明确取到 false
   * 才改口，否则接口一次失败就会把正常状态说成「系统未开启」，比不显示更误导。
   */
  globalEnabled?: boolean
  onToggle?: (enabled: boolean) => void
  onRealign?: () => void
}

/**
 * 状态色只放色板名，文案一律在 render 期取词。
 *
 * 不把 label 写进模块级常量表：模块顶层的 `i18n.t()` 在 import 时就冻结语言，
 * 用户切完语言回来，徽标还会是上一次的语言——同一个页面上别的词都换了，只有它不换。
 */
const STATE_COLORS: Record<CpmSyncState, string> = {
  pending: 'default',
  success: 'green',
  conflict: 'orange',
  rejected: 'red',
  error: 'volcano',
}

export default function RdmSyncBadge({ sync, globalEnabled = true, onToggle, onRealign }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const stateText = (state: CpmSyncState): string => {
    switch (state) {
      case 'success': return t('cpm.rdmSync.state.success', { defaultValue: '已同步 RDM' })
      case 'conflict': return t('cpm.rdmSync.state.conflict', { defaultValue: 'RDM 有變更' })
      case 'rejected': return t('cpm.rdmSync.state.rejected', { defaultValue: 'RDM 拒絕回寫' })
      case 'error': return t('cpm.rdmSync.state.error', { defaultValue: '回寫異常' })
      default: return t('cpm.rdmSync.state.pending', { defaultValue: '未回寫' })
    }
  }

  if (!sync) return null

  const state = sync.enabled ? (sync.state ?? 'pending') : 'pending'
  // 开关关掉时不展示失败态：那是「本来就不回写」，不是「回写没成功」
  // 总闸关掉时也不展示条目侧状态：那同样是系统级未开启，不是这一行出了问题。
  // 这一层必须显示出来——否则用户开了开关、更新了进度，徽标永远停在「未回寫」，
  // 看的人无法区分「还没触发」「被规则拒绝」「运维根本没打开」。
  const gateClosed = sync.enabled && !globalEnabled
  const label = !sync.enabled
    ? t('cpm.rdmSync.disabled', { defaultValue: '回寫已關閉' })
    : gateClosed
      ? t('cpm.rdmSync.gateClosed', { defaultValue: '系統未開啟回寫' })
      : stateText(state)

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="left"
      title={(
        <Space size={6}>
          <span>{t('cpm.rdmSync.title', { defaultValue: 'RDM 進度回寫' })}</span>
          <HelpPopover
            ariaLabel={t('cpm.rdmSync.helpAria', { defaultValue: '回寫規則說明' })}
            title={t('cpm.rdmSync.helpTitle', { defaultValue: '哪些情況不會回寫' })}
            content={t('cpm.rdmSync.helpBody', { defaultValue: 'PRD 任務的 100% 以「提交評審」為準；標記完成與標記阻塞必須填寫說明或原因；已取消與延期屬個人過程判斷，不寫入交付真值。以上情況 CPM 仍會正常保存，只在這裡告知未同步的原因。' })}
          />
        </Space>
      )}
      content={(
        <div style={{ width: 280 }}>
          <div className="cpm-item__sync" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
            <Tag color={STATE_COLORS[state]} style={{ marginInlineEnd: 0 }}>{label}</Tag>
            <span style={{ fontSize: 12, color: 'var(--text-2)', wordBreak: 'break-all' }}>
              {gateClosed
                ? t('cpm.rdmSync.gateClosedHint', { defaultValue: '運維尚未在服務端開啟 RDM 回寫總閘（cpm.rdm-sync-enabled=false）；開啟後本條目的進度更新才會寫入 RDM。期間 CPM 記錄照常保存。' })
                : sync.message ?? (sync.enabled
                  ? t('cpm.rdmSync.noRecord', { defaultValue: '尚無回寫記錄' })
                  : t('cpm.rdmSync.disabledHint', { defaultValue: '關閉後 CPM 的更動不影響 RDM' }))}
            </span>
            {sync.taskNo && (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {t('cpm.rdmSync.task', { taskNo: sync.taskNo, defaultValue: '任務：{{taskNo}}' })}
              </span>
            )}
            {sync.syncedAt && (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {t('cpm.rdmSync.syncedAt', { time: sync.syncedAt, defaultValue: '最近：{{time}}' })}
              </span>
            )}
          </div>
          <Space size={10} align="center" style={{ marginTop: 12, width: '100%', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{t('cpm.rdmSwitch.label', { defaultValue: '進度回寫到 RDM' })}</span>
            <Switch
              size="small"
              checked={sync.enabled}
              onChange={checked => {
                onToggle?.(checked)
                message.success(checked
                  ? t('cpm.rdmSwitch.enabled', { defaultValue: '已開啟回寫' })
                  : t('cpm.rdmSwitch.disabled', { defaultValue: '已關閉回寫' }))
              }}
            />
          </Space>
          {(sync.state === 'conflict' || sync.state === 'rejected') && onRealign && (
            <Button size="small" block style={{ marginTop: 10 }} onClick={() => { onRealign(); setOpen(false) }}>
              {t('cpm.rdmSync.realign', { defaultValue: '以 RDM 當前值重新對齊' })}
            </Button>
          )}
        </div>
      )}
    >
      <Button type="link" size="small" className="cpm-item__sync">
        <SyncOutlined style={{ fontSize: 11, color: sync.enabled && sync.state === 'success' ? 'var(--success)' : 'var(--text-3)' }} />
        {label}
      </Button>
    </Popover>
  )
}
