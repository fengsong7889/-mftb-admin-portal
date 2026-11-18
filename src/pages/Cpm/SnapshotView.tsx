/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { Empty, Space, Tag } from 'antd'
import type { CpmSnapshot } from '@/api/cpm'
import { STATUS_TEXT } from './cpmPeriod'
import './cpm.css'

/**
 * 聚合快照展示组件（我的汇报预览 / 已发布视图 / 团队详情共用一份渲染）。
 *
 * 为什么必须共用：「用户在生成页看到的分组与轨迹」和「上级在详情页看到的」
 * 必须是同一份数据的同一种表达——两套渲染必然在某个字段上分叉（历史上纪要就踩过
 * 「通知版少一列」的坑）。数字与状态一律取服务端快照，这里只做展示。
 */
export default function SnapshotView({ snapshot }: { snapshot: CpmSnapshot | null }) {
  if (!snapshot || snapshot.totals.total === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本期間沒有活躍的工作記錄" />
  }
  return (
    <>
      <Space size={8} wrap style={{ marginBottom: 12 }}>
        <Tag color="green">完成 {snapshot.totals.done}</Tag>
        <Tag color="blue">進行中 {snapshot.totals.doing}</Tag>
        <Tag color="orange">待辦 {snapshot.totals.todo}</Tag>
        {snapshot.totals.blocked > 0 && <Tag color="red">受阻 {snapshot.totals.blocked}</Tag>}
        <Tag>共 {snapshot.totals.total} 項</Tag>
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
                    {STATUS_TEXT[entry.status] ?? entry.status}
                  </Tag>
                  <span>{entry.workDate}</span>
                  {entry.trail.length > 1 && <span className="cpm-report__trail">軌跡 {entry.trail.join(' → ')}%</span>}
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
