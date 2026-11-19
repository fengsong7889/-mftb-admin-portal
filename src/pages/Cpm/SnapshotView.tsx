/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useTranslation } from 'react-i18next'
import { Empty, Space, Tag } from 'antd'
import type { CpmSnapshot } from '@/api/cpm'
import { CPM_STATUS_LABELS, CpmStatus, type CpmStatusValue } from './meta'
import './cpm.css'

/**
 * 聚合快照展示组件（我的汇报预览 / 已发布视图 / 团队详情共用一份渲染）。
 *
 * 为什么必须共用：「用户在生成页看到的分组与轨迹」和「上级在详情页看到的」
 * 必须是同一份数据的同一种表达——两套渲染必然在某个字段上分叉（历史上纪要就踩过
 * 「通知版少一列」的坑）。数字与状态一律取服务端快照，这里只做展示。
 *
 * 状态词一律引用 `CPM_STATUS_LABELS`，不在这里再写一遍「已完成/進行中」：
 * 同一枚枚举在两处各有一套措辞，是六语改造后最容易复发的缺陷。
 */
export default function SnapshotView({ snapshot }: { snapshot: CpmSnapshot | null }) {
  const { t } = useTranslation()
  if (!snapshot || snapshot.totals.total === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('cpm.report.emptyPeriod', { defaultValue: '本期間沒有活躍的工作記錄' })} />
  }
  return (
    <>
      <Space size={8} wrap style={{ marginBottom: 12 }}>
        <Tag color="green">{CPM_STATUS_LABELS[CpmStatus.DONE]} {snapshot.totals.done}</Tag>
        <Tag color="blue">{CPM_STATUS_LABELS[CpmStatus.DOING]} {snapshot.totals.doing}</Tag>
        <Tag color="orange">{CPM_STATUS_LABELS[CpmStatus.TODO]} {snapshot.totals.todo}</Tag>
        {snapshot.totals.blocked > 0 && <Tag color="red">{CPM_STATUS_LABELS[CpmStatus.BLOCKED]} {snapshot.totals.blocked}</Tag>}
        <Tag>{t('cpm.report.totalItems', { count: snapshot.totals.total, defaultValue: '共 {{count}} 項' })}</Tag>
      </Space>
      {snapshot.groups.map(g => (
        <div key={g.category}>
          <div className="cpm-report__group-title">{g.categoryLabel}（{g.items.length}）</div>
          {g.items.map(entry => (
            <div className="cpm-item" key={entry.itemId}>
              <div className="cpm-item__main">
                <div className="cpm-item__title">{entry.title}</div>
                <div className="cpm-item__meta">
                  <Tag
                    color={entry.status === 'done' ? 'success' : entry.status === 'blocked' ? 'error' : 'processing'}
                    style={{ marginInlineEnd: 0 }}
                  >
                    {CPM_STATUS_LABELS[entry.status as CpmStatusValue] ?? entry.status}
                  </Tag>
                  <span>{entry.workDate}</span>
                  {entry.trail.length > 1 && (
                    <span className="cpm-report__trail">{t('cpm.report.trail', { trail: entry.trail.join(' → '), defaultValue: '軌跡 {{trail}}%' })}</span>
                  )}
                </div>
              </div>
              <div className="cpm-item__progress" style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-2)' }}>
                {entry.progress}%
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
