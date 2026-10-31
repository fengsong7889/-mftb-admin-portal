/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Empty, Tag } from 'antd'
import { AimOutlined, ExperimentOutlined } from '@ant-design/icons'
import { RECOMMEND_CHANNEL_OPTIONS } from '@mftb/contracts/recommendConstants'
import HelpPopover from '@/components/HelpPopover'
import { ELIGIBILITY_LABELS, STATUS_META } from './fixtures'
import { brandLabel } from './display'
import type { Eligibility, MatchStatus, ScoreSnapshot } from './types'

export function DemoNotice() {
  return <Alert className="organic__notice" type="info" showIcon message="演示資料 · 未接入門店真實報名與計分" description="所有門店、分數及排名均為固定虛擬樣例。此頁不修改算法配置，不產生曝光或扣費。" />
}
export function ScoreHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return <header className="organic__header"><div className="organic__heading"><span className="organic__heading-icon"><ExperimentOutlined /></span><div><div className="organic__eyebrow">自然流量 · 分數與排名分析</div><h1>{title}</h1><p>{subtitle}</p></div></div><div className="organic__header-extra">{children}<Tag color="orange">前端原型</Tag></div></header>
}
export function Section({ title, description, extra, children }: { title: string; description?: string; extra?: ReactNode; children: ReactNode }) {
  return <section className="organic__section"><div className="organic__section-title"><div><h3>{title}</h3>{description && <p>{description}</p>}</div>{extra}</div>{children}</section>
}
export function ContextStrip({ snapshot }: { snapshot: ScoreSnapshot }) {
  const { t } = useTranslation()
  const channel = RECOMMEND_CHANNEL_OPTIONS.find(o => o.value === snapshot.channel)?.labelKey ?? 'recommend.channelDelivery'
  return <div className="organic__context"><span><AimOutlined /> {snapshot.location.label} · WGS84</span><span>{brandLabel(snapshot.brand)} / {t(channel)}</span><span>評估：{snapshot.evaluationTime}（澳門）</span><span>{snapshot.configVersion}</span>
    <HelpPopover title="本次排名口徑" ariaLabel="本次排名口徑" placement="bottomRight" content={[
      { tone: 'info', label: '範圍與版本', body: `全澳門＝澳門半島＋氹仔區域的11個運營商圈，不含珠海。${snapshot.configScope}。` },
      { tone: 'neutral', label: '固定資料快照', body: `${snapshot.snapshotId}\n候選集合：${snapshot.candidateSetId}\n資料時間：${snapshot.observedAt}\n位置：${snapshot.location.lat}, ${snapshot.location.lng}` },
      { tone: 'warn', label: '位次不是坑位', body: '名次只在同品牌、頻道、配置、時間和定位下可比較。篩選與分頁不會改寫全澳名次；最終瀑布流展示位置另行決定。' },
    ]} /></div>
}
export function EligibilityTag({ value }: { value: Eligibility }) {
  return <Tag color={value === 'ranked' ? 'success' : value === 'pending' ? 'warning' : 'default'}>{ELIGIBILITY_LABELS[value]}</Tag>
}
export function MatchTag({ status }: { status: MatchStatus }) {
  const meta = STATUS_META[status]
  return <Tag color={meta.color}>{meta.label}</Tag>
}
/** 图表或地图失败不能使数值表格一起不可用；不输出内部错误详情。 */
export class VisualBoundary extends Component<{ children: ReactNode; label: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* 仅降级，避免日志带出地图或业务数据。 */ }
  render() { return this.state.failed ? <Empty description={`${this.props.label}暫不可用，仍可查看下方數值表格`}><Button onClick={() => this.setState({ failed: false })}>重試</Button></Empty> : this.props.children }
}
