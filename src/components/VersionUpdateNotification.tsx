import { notification, Button } from 'antd'
import { ArrowRightOutlined, ClockCircleOutlined, CloudUploadOutlined, ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import type { VersionInfo } from '../hooks/useVersionCheck'
import './VersionUpdateNotification.css'

interface Props {
  updateAvailable: boolean
  current: VersionInfo
  latest: VersionInfo | null
}

const NOTICE_KEY = 'version-update'

/** 构建时间是 UTC ISO 串，展示统一转本地时间的横杠分隔格式（与全站时间格式一致） */
function formatBuildTime(iso?: string) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * 更新提示卡片：整张卡由我们自己绘制，保证「无法忽视」的强度——
 * 品牌橙渐变头 + 呼吸图标 + NEW 徽章 + 扫光条，正文给出版本对照与刷新后果说明。
 */
export function VersionUpdateCard({ current, latest, onReload, onSnooze }: {
  current: VersionInfo
  latest: VersionInfo | null
  onReload: () => void
  onSnooze: () => void
}) {
  const { t } = useTranslation()
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
        <div className="version-update-versions">
          <div className="version-update-version">
            <span className="version-update-version-label">{t('versionUpdate.current')}</span>
            <code>{current.hash}</code>
            <span className="version-update-version-time">{formatBuildTime(current.buildTime)}</span>
          </div>
          <ArrowRightOutlined className="version-update-arrow" aria-hidden="true" />
          <div className="version-update-version is-latest">
            <span className="version-update-version-label">{t('versionUpdate.latest')}</span>
            <code>{latest?.hash ?? '—'}</code>
            <span className="version-update-version-time">{formatBuildTime(latest?.buildTime)}</span>
          </div>
        </div>

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
 * - 检测到新版本时弹出强提示卡（不自动关闭），引导刷新获取最新资源
 * - 「稍後再說」收起弹卡后保留右下角常驻胶囊，随时一键刷新，避免提示被误关后丢失
 * - 语言切换时按同一 key 重开通知，卡片文案跟随界面语言更新
 */
export default function VersionUpdateNotification({ updateAvailable, current, latest }: Props) {
  const { t, i18n } = useTranslation()
  const [snoozed, setSnoozed] = useState(false)

  const reload = () => {
    notification.destroy(NOTICE_KEY)
    window.location.reload()
  }

  useEffect(() => {
    if (!updateAvailable) return
    notification.open({
      key: NOTICE_KEY,
      message: null,
      description: (
        <VersionUpdateCard
          current={current}
          latest={latest}
          onReload={reload}
          onSnooze={() => { notification.destroy(NOTICE_KEY); setSnoozed(true) }}
        />
      ),
      duration: 0,
      placement: 'topRight',
      className: 'version-update-notice',
      closable: false,
    })
    // current / latest 来自 hook 的稳定引用，只有真正检测到新版本才会变化
  }, [updateAvailable, current, latest, i18n.language])

  if (!updateAvailable || !snoozed) return null

  return (
    <button type="button" className="version-update-pill" onClick={reload}>
      <span className="version-update-pill-dot" aria-hidden="true" />
      <CloudUploadOutlined aria-hidden="true" />
      {t('versionUpdate.pending')}
    </button>
  )
}
