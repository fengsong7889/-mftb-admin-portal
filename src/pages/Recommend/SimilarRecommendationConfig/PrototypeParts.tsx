/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import type { ReactNode } from 'react'
import { Alert, Button } from 'antd'
import AlgorithmSection from '../AlgorithmForm/AlgorithmSection'
import { ArrowLeftOutlined } from '@ant-design/icons'
import './index.css'

// P1 临时繁中文案，界面确认后再统一接入 i18n。
/** 相似推薦引擎图标：圆环包围相互吸引的双磁铁，N／S 极标记在圆环左右两侧（橙徽点＋白字），
 *  表达「相似商家在一個匹配場內相互磁吸」。环与磁铁 body 用 currentColor：浅色列表头继承文字色、
 *  深色 hero 卡由 .algo-card-icon 覆写为白，保证两处同源且均可见。 */
export function SimilarEngineIcon({ size = 20 }: { size?: number }) {
  return <svg className="similar-engine-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ verticalAlign: '-2px' }}>
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <rect x="5" y="10" width="4.5" height="4" rx="0.8" fill="currentColor" />
    <rect x="9.5" y="10" width="2" height="4" fill="var(--brand)" />
    <rect x="12.5" y="10" width="2" height="4" fill="var(--brand)" />
    <rect x="14.5" y="10" width="4.5" height="4" rx="0.8" fill="currentColor" />
    <circle cx="12" cy="12" r="0.9" fill="var(--brand)" />
    <path d="M10 8.6 Q12 7.2 14 8.6" stroke="var(--brand)" strokeWidth="1" fill="none" />
    <path d="M10 15.4 Q12 16.8 14 15.4" stroke="var(--brand)" strokeWidth="1" fill="none" />
    <circle cx="3" cy="12" r="3" fill="var(--brand)" />
    <text x="3" y="12.5" textAnchor="middle" dominantBaseline="middle" fontSize="4" fontWeight="700" fill="rgba(255, 255, 255, 0.95)">N</text>
    <circle cx="21" cy="12" r="3" fill="var(--brand)" />
    <text x="21" y="12.5" textAnchor="middle" dominantBaseline="middle" fontSize="4" fontWeight="700" fill="rgba(255, 255, 255, 0.95)">S</text>
  </svg>
}
export function PrototypeNotice() {
  return <Alert className="similar-prototype__notice" type="info" showIcon
    message="配置已接入算法庫與場景綁定；推薦執行、消費者標籤與曝光計量尚未接入（配置完成、運行未接入）。" />
}
/** 与算法库标准列表/表单头部同构：渐变条 + 返回 + 蓝色标题 + 类型名副题。 */
export function PrototypeHeader({ title, onBack, children, subtitle }: { title: string; onBack: () => void; children?: ReactNode; subtitle?: ReactNode }) {
  return <div className="similar-prototype__header">
    <div className="similar-prototype__accent" />
    <div className="similar-prototype__header-body">
      <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
      <span className="similar-prototype__divider-v" />
      <div className="similar-prototype__title-row">
        <h2>{title}</h2>
        {subtitle && <span className="similar-prototype__subtitle">{subtitle}</span>}
      </div>
      {children && <div className="similar-prototype__header-extra">{children}</div>}
    </div>
  </div>
}
export function PrototypeSection({ title, children, extra, readOnly = false }: { title: string; children: ReactNode; extra?: ReactNode; readOnly?: boolean }) {
  return <AlgorithmSection title={title} extra={extra} readOnly={readOnly} tone={title === '基礎信息' ? 'info' : 'strategy'}>{children}</AlgorithmSection>
}
