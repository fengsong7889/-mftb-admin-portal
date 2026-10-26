import { Button, Modal } from 'antd'
import {
  ArrowRightOutlined,
  ClockCircleOutlined,
  CloudUploadOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useMemo, useState } from 'react'
import type { CommitChange, VersionInfo } from '@/hooks/useVersionCheck'
import './VersionUpdateNotification.css'

interface Props {
  updateAvailable: boolean
  current: VersionInfo
  latest: VersionInfo | null
}

/** 弹窗最多列出的更新条目数：再多会把说明和操作挤出视线 */
const MAX_VISIBLE_CHANGES = 6

/** 构建时间是 UTC ISO 串，展示统一转本地时间的横杠分隔格式（与全站时间格式一致） */
function formatBuildTime(iso?: string) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 版本对照行只需要「哪天发的」，秒级精度留给完整格式场景，这里收窄到分钟避免撑行 */
function formatBuildMinute(iso?: string) {
  const full = formatBuildTime(iso)
  return full.length >= 16 ? full.slice(0, 16) : full
}

/** 短哈希长度由 git 自适应，两边可能不等长，只能按前缀比对 */
function isSameCommit(a: string, b: string) {
  if (!a || !b) return false
  return a === b || a.startsWith(b) || b.startsWith(a)
}

/**
 * 从最新版本的提交清单里截出「比当前版本新」的部分。
 * 浅克隆时清单里没有当前版本（拿不到边界），退化为展示最近若干条，
 * 至少让人知道这次刷新会带来什么，不能让弹窗空着。
 */
function resolveUpdateChanges(latest: VersionInfo | null, current: VersionInfo) {
  const changes = latest?.changes ?? []
  if (changes.length === 0) return { items: [] as CommitChange[], total: 0 }
  const boundary = changes.findIndex((item) => isSameCommit(item.hash, current.hash))
  const pending = boundary === -1 ? changes : changes.slice(0, boundary)
  return { items: pending.slice(0, MAX_VISIBLE_CHANGES), total: pending.length }
}

/**
 * 更新提示卡片：整张卡由我们自己绘制，保证「无法忽视」的强度——
 * 品牌橙渐变头 + 呼吸图标 + NEW 徽章 + 扫光条，正文以更新内容为主角，
 * 版本对照弱化成一行元信息（提交号只是佐证，不该抢走注意力）。
 */
export function VersionUpdateCard({ current, latest, onReload, onSnooze }: {
  current: VersionInfo
  latest: VersionInfo | null
  onReload: () => void
  onSnooze: () => void
}) {
  const { t } = useTranslation()
  const { items, total } = useMemo(() => resolveUpdateChanges(latest, current), [latest, current])

  return (
    <div className="version-update-card">
      <div className="version-update-head">
        <span className="version-update-icon"><CloudUploadOutlined /></span>
        <span className="version-update-head-text">
          <b className="version-update-title">{t('versionUpdate.title')}</b>
          <span className="version-update-subtitle">{t('versionUpdate.pending')}</span>
        </span>
        <span className="version-update-tag">NEW</span>
        <span className="version-update-sweep" aria-hidden="true" />
      </div>

      <div className="version-update-body">
        {/* 版本对照：一行轻量元信息，弱化原来的两个大色块 */}
        <div className="version-update-meta">
          <span className="version-update-meta-item">
            <span className="version-update-meta-label">{t('versionUpdate.current')}</span>
            <code>{current.hash}</code>
          </span>
          <ArrowRightOutlined className="version-update-meta-arrow" aria-hidden="true" />
          <span className="version-update-meta-item">
            <span className="version-update-meta-label">{t('versionUpdate.latest')}</span>
            <code className="is-latest">{latest?.hash ?? '—'}</code>
          </span>
          <span className="version-update-meta-time">{formatBuildMinute(latest?.buildTime)}</span>
        </div>

        {/* 本次更新内容：来自构建期写入 version.json 的提交清单 */}
        {items.length > 0 && (
          <div className="version-update-changes">
            <div className="version-update-changes-title">
              <HistoryOutlined aria-hidden="true" />
              <span>{t('versionUpdate.changesTitle')}</span>
              <em>
                {t('versionUpdate.changesCount', { total })}
                {total > items.length ? t('versionUpdate.changesShown', { shown: items.length }) : ''}
              </em>
            </div>
            <ul className="version-update-change-list">
              {items.map((item) => (
                <li key={item.hash}>
                  <code>{item.hash}</code>
                  <span title={item.subject}>{item.subject}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="version-update-desc">{t('versionUpdate.desc')}</p>
        <p className="version-update-hint">
          <ClockCircleOutlined aria-hidden="true" />
          {t('versionUpdate.refreshHint')}
        </p>

        <div className="version-update-actions">
          <Button className="version-update-later" onClick={onSnooze}>{t('versionUpdate.snooze')}</Button>
          <Button type="primary" className="version-update-reload" icon={<ReloadOutlined />} onClick={onReload}>
            {t('versionUpdate.reload')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * 版本更新通知
 * - 检测到新版本时居中弹出强提示卡（不自动关闭、不可点遮罩关闭），引导刷新获取最新资源
 * - 「稍後再說」收起弹卡后保留右下角常驻胶囊，随时一键刷新，避免提示被误关后丢失
 * - 文案随界面语言实时切换（Modal 由 React 渲染，不再需要按语言重开通知）
 */
export default function VersionUpdateNotification({ updateAvailable, current, latest }: Props) {
  const { t } = useTranslation()
  const [snoozed, setSnoozed] = useState(false)

  if (!updateAvailable) return null

  return (
    <>
      <Modal
        open={!snoozed}
        centered
        footer={null}
        closable={false}
        maskClosable={false}
        keyboard={false}
        width={520}
        destroyOnHidden
        className="version-update-modal"
      >
        <VersionUpdateCard
          current={current}
          latest={latest}
          onReload={() => window.location.reload()}
          onSnooze={() => setSnoozed(true)}
        />
      </Modal>

      {snoozed && (
        <button
          type="button"
          className="version-update-pill"
          onClick={() => window.location.reload()}
        >
          <span className="version-update-pill-dot" aria-hidden="true" />
          <CloudUploadOutlined aria-hidden="true" />
          {t('versionUpdate.pending')}
        </button>
      )}
    </>
  )
}
