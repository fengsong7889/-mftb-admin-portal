import { Modal } from 'antd'
import { useTranslation } from 'react-i18next'
import type { DailyReportPublicView } from '@/api/rdmDailyReportPublic'
import { RdmDailyReportBoard } from '../../RdmDailyReportView'

interface Props {
  open: boolean
  /** 免登看板链接；只接受 http(s) 绝对地址或站内绝对路径，拒绝 javascript:/data: 等伪协议 */
  url?: string | null
  /** 登录态实时预览：直接渲染色板正文，不读已落库快照 */
  view?: DailyReportPublicView | null
  onClose: () => void
}

/**
 * 日报看板预览弹窗（模板编辑 / 手动触发共用）。
 *
 * <p>为什么用 iframe 而不是把看板组件搬进弹窗：看板是独立公开路由，
 * 自带「令牌失效/快照未生成/空态」整套兜底；iframe 复用的是同一个页面，
 * 不会出现“弹窗里好看、真正点开链接却不一样”的两套渲染。
 *
 * <p>为什么不给 iframe 传 JWT：看板链接本身就是免登令牌，弹窗里也不需要登录态；
 * 传了反而会把后台会话带进一个本应对外可看的页面。
 */
export default function DailyReportBoardPreviewModal({ open, url, view, onClose }: Props) {
  const { t } = useTranslation()
  const safeSrc = resolveSrc(url)
  return (
    <Modal
      open={open}
      title={t('rdm.board.previewModalTitle', { defaultValue: '看板預覽' })}
      footer={null}
      width={1120}
      onCancel={onClose}
      styles={{ body: { padding: 0 } }}
    >
      {open && view ? (
        <div className="rdm-board-page" style={{ height: 'calc(100vh - 160px)' }}>
          <div className="rdm-board-shell">
            <RdmDailyReportBoard view={view} preview />
          </div>
        </div>
      ) : open && safeSrc ? (
        <iframe
          title={t('rdm.board.previewModalTitle', { defaultValue: '看板預覽' })}
          src={safeSrc}
          style={{ width: '100%', height: 'calc(100vh - 160px)', border: 'none', display: 'block' }}
        />
      ) : (
        <div style={{ padding: 32, textAlign: 'center', color: '#8c8c8c', fontSize: 13 }}>
          {t('rdm.board.previewModalEmpty', { defaultValue: '暫無可預覽的看板連結' })}
        </div>
      )}
    </Modal>
  )
}

/**
 * 解析弹窗内嵌地址：
 * 1. 只允许 http(s)，避免 javascript:/data: 在 iframe 里执行；
 * 2. 看板路由一律改写成「当前访问的同源地址」——推送配置里的 base_url 是给钉钉用的
 *    生产站点，本地开发/预览环境直接加载它会落到旧构建，旧构建没有公开看板路由，
 *    于是被路由兜底跳到登录页（用户看到“弹窗是登录界面”）。
 */
function resolveSrc(url?: string | null): string | null {
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url.trim(), window.location.origin)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (parsed.hash.startsWith('#/rdm-daily-view')) {
    return `${window.location.origin}${window.location.pathname}#${parsed.hash.slice(1)}`
  }
  return parsed.toString()
}
