import { useEffect, useLayoutEffect, useState } from 'react'
import { Button, Segmented } from 'antd'
import { CopyOutlined, ExportOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { changeAppLanguage, LANGUAGE_STORAGE_KEY } from '@/i18n'

/** Keep public meeting controls within the meeting domain, independent of the RDM app. */
export default function MeetingPublicHeader({ kind }: { kind: 'invite' | 'minutes' }) {
  const { t, i18n } = useTranslation()
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle')
  const lang = i18n.language?.startsWith('zh') ? 'zh-TW' : 'en'
  const title = kind === 'invite' ? t('meeting.meta.scenario.invite') : t('meeting.minutes.pageTitle')

  // Match the daily report: default to Chinese without overwriting a saved preference.
  useLayoutEffect(() => {
    if (!localStorage.getItem(LANGUAGE_STORAGE_KEY) && !i18n.language?.startsWith('zh')) {
      void i18n.changeLanguage('zh-TW')
    }
  }, [i18n])

  // Public routes bypass the portal header, so they must own the WebView/tab title.
  useLayoutEffect(() => {
    const previousTitle = document.title
    document.title = title
    return () => { document.title = previousTitle }
  }, [title])

  useEffect(() => {
    if (copyState === 'idle') return
    const timer = window.setTimeout(() => setCopyState('idle'), 2600)
    return () => window.clearTimeout(timer)
  }, [copyState])

  const handleOpenInBrowser = () => {
    const url = window.location.href
    const desktopDingTalk = /DingTalk/i.test(navigator.userAgent)
      && !/Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    if (desktopDingTalk) {
      // Preserve the signed link and use the same external-browser protocol as daily reports.
      const link = document.createElement('a')
      link.href = `dingtalk://dingtalkclient/page/link?url=${encodeURIComponent(url)}&pc_slide=false`
      document.body.appendChild(link)
      link.click()
      link.remove()
      return
    }
    window.open(url, '_blank', 'noopener')
  }

  const handleCopyLink = async () => {
    setCopyState((await copyPublicLink(window.location.href)) ? 'done' : 'failed')
  }

  return (
    <header style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
        <Segmented
          size="small"
          style={{ flexShrink: 0 }}
          aria-label={t('rdm.board.langSwitchAria')}
          value={lang}
          onChange={value => changeAppLanguage(String(value))}
          options={[
            { value: 'zh-TW', label: t('rdm.board.langZh') },
            { value: 'en', label: t('rdm.board.langEn') },
          ]}
        />
        <Button size="small" icon={<CopyOutlined />} onClick={() => void handleCopyLink()}>
          <span aria-live="polite">
            {copyState === 'done' ? t('rdm.board.copyLinkDone')
              : copyState === 'failed' ? t('rdm.board.copyLinkFailedShort') : t('rdm.board.copyLink')}
          </span>
        </Button>
        <Button size="small" icon={<ExportOutlined />} onClick={handleOpenInBrowser}>
          {t('rdm.board.openInBrowser')}
        </Button>
      </div>
    </header>
  )
}

/** Older WebViews may lack clipboard access; retain a selectable-copy fallback. */
async function copyPublicLink(url: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      return true
    }
  } catch {
    // Clipboard permission denial must not prevent the fallback.
  }
  const area = document.createElement('textarea')
  area.value = url
  area.readOnly = true
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  try {
    area.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}
