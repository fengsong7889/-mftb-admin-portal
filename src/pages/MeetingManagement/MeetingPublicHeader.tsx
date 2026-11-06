import { useEffect, useLayoutEffect, useState } from 'react'
import { Button, Segmented } from 'antd'
import { CheckOutlined, CopyOutlined, ExportOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { changeAppLanguage, LANGUAGE_STORAGE_KEY } from '@/i18n'
import { applyWebViewTitle } from '@/utils/webViewTitle'

/** Keep public meeting controls within the meeting domain, independent of the RDM app. */
export default function MeetingPublicHeader({ kind, titleSuffix }: { kind: 'invite' | 'minutes'; titleSuffix?: string }) {
  const { t, i18n } = useTranslation()
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle')
  const lang = i18n.language?.startsWith('zh') ? 'zh-TW' : 'en'
  const title = kind === 'invite' ? t('meeting.meta.scenario.invite') : t('meeting.minutes.pageTitle')
  // 顶栏归属名与页内场景名是两件事：钉钉／浏览器顶栏要回答「这是哪个助手」，
  // 页内灰字才回答「这是邀约还是纪要」；两者混用就会把助手名塞进正文或把场景名顶到顶栏
  const docTitle = kind === 'invite'
    ? (i18n.language?.startsWith('zh') ? '會議助手' : 'Meeting Assistant')
    : title

  // Match the daily report: default to Chinese without overwriting a saved preference.
  useLayoutEffect(() => {
    if (!localStorage.getItem(LANGUAGE_STORAGE_KEY) && !i18n.language?.startsWith('zh')) {
      void i18n.changeLanguage('zh-TW')
    }
  }, [i18n])

  // Public routes bypass the portal header, so they must own the WebView/tab title.
  useLayoutEffect(() => {
    const previousTitle = document.title
    applyWebViewTitle(docTitle)
    return () => { document.title = previousTitle }
  }, [docTitle])

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

  const copyLabel = copyState === 'done' ? t('rdm.board.copyLinkDone')
    : copyState === 'failed' ? t('rdm.board.copyLinkFailedShort') : t('rdm.board.copyLink')
  const openLabel = t('rdm.board.openInBrowser')

  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 13, color: '#8C8C8C', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {/* 场景名与文档口径并排一行（如「會議紀要(只讀文件)」）：钉钉侧边栏首屏寸土寸金，不单独占一行 */}
        {titleSuffix ? `${title}(${titleSuffix})` : title}
      </span>
      {/* 三个控件压成一行且复制/打开改图标：钉钉侧边栏约 490px，两行带文字的工具条会吃掉首屏一整块内容 */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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
        <Button size="small" type="text" icon={copyState === 'done' ? <CheckOutlined /> : <CopyOutlined />}
          aria-label={copyLabel} title={copyLabel} onClick={() => void handleCopyLink()} />
        <Button size="small" type="text" icon={<ExportOutlined />}
          aria-label={openLabel} title={openLabel} onClick={handleOpenInBrowser} />
        {/* 图标按钮没有可见文字：复制结果靠 aria-live 播报给读屏用户 */}
        <span aria-live="polite" style={{
          position: 'absolute', width: 1, height: 1, margin: -1,
          overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
        }}>
          {copyState === 'idle' ? '' : copyLabel}
        </span>
      </span>
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
