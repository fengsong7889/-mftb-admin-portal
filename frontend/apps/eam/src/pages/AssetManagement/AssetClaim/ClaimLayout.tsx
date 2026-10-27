/**
 * 资产领用模块的共享展示组件（页头 / 分节卡片 / 阶段告知条）。
 * 样式靠 index.css 里的 claim-* 类，AssetReturn 的预览页也复用本页的
 * ClaimFormHeader 与 ClaimSection，因此改这里会影响领用与验收两组页面。
 *
 * ⚠️ 本模块仍带有“第一阶段界面验收”痕迹（见 ClaimConnectionNotice）：页头与分节
 * 是纯展示容器，与业务状态无关，可安全复用。
 */
import type { ReactNode } from 'react'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Alert, Button } from 'antd'
import { useTranslation } from 'react-i18next'

/** 表单/详情页统一页头：渐变条 + 返回按钮 + 标题，subtitle 可选 */
export function ClaimFormHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="claim-form-header">
      <div className="claim-header-stripe" />
      <div className="claim-header-body">
        <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}>{t('common.back')}</Button>
        <div className="claim-header-divider" />
        <div><h2>{title}</h2>{subtitle && <div className="claim-muted">{subtitle}</div>}</div>
      </div>
    </div>
  )
}

/** 内容分节卡片；icon 可缺省（仅留一个占位圆，保持标题基线对齐） */
export function ClaimSection({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div className="claim-section-heading"><span className="claim-section-icon">{icon}</span><h3>{title}</h3><span className="claim-section-line" /></div>
      {children}
    </div>
  )
}

/** 阶段告知条：提醒当前为界面验收，统计中的 — 表示尚未加载而非数值为零 */
export function ClaimConnectionNotice() {
  return <Alert type="info" showIcon className="claim-notice" message="界面驗收階段 · 真實領用服務待接通" description="當前不讀取模擬領用記錄，也不提交業務數據。統計中的 — 表示尚未加載；界面確認後接通員工簽署、資產預留和正常歸還。" />
}
