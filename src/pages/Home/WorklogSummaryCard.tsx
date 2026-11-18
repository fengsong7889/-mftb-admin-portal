/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from 'antd'
import { FormOutlined, RightOutlined } from '@ant-design/icons'
import { useAuth } from '@/contexts/AuthContext'
import { fetchCpmHomeSummary, type CpmHomeSummaryVO } from '@/api/cpm'

/**
 * 首页「工作記錄/匯報」概览栏（方案 §七 工作台联动，阶段二真实数据）。
 *
 * 三条渲染纪律（TodayMeetingCard 同口径教训）：
 * 1. 无 cpm-my 菜单的人不发请求也不渲染整栏——拿 403 当「今天没记录」显示，
 *    是把错误当空数据撒谎；
 * 2. 静默请求失败 → 整栏不渲染（不打扰首页），而不是显示 0；
 * 3. 数字只展示服务端算好的（今日活跃条目数=日视图同一口径）。
 */
export default function WorklogSummaryCard() {
  const navigate = useNavigate()
  const { hasMenuPermission } = useAuth()
  const [summary, setSummary] = useState<CpmHomeSummaryVO | null>(null)

  const allowed = hasMenuPermission('cpm-my')

  useEffect(() => {
    if (!allowed) return
    let alive = true
    fetchCpmHomeSummary()
      .then(vo => { if (alive) setSummary(vo) })
      .catch(() => { if (alive) setSummary(null) })
    return () => { alive = false }
  }, [allowed])

  if (!allowed || !summary) return null

  return (
    <div className="home-worklog-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        <FormOutlined style={{ color: 'var(--brand)' }} />
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>今日工作記錄</span>
        <strong style={{ fontSize: 16, color: 'var(--brand)' }}>{summary.todayCount}</strong>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>條</span>
        <span className="home-worklog-bar__divider" aria-hidden="true" />
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>本週匯報</span>
        <strong style={{ fontSize: 13, color: summary.weekPublished ? 'var(--success)' : 'var(--warning)' }}>
          {summary.weekPublished ? '已發布' : '未提交'}
        </strong>
        {summary.weekPublished && summary.weekFeedbackCount > 0 && (
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>· 收到 {summary.weekFeedbackCount} 條反饋</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Button
          type="link"
          size="small"
          style={{ padding: 0, height: 'auto', fontSize: 12, fontWeight: 500, color: 'var(--brand)' }}
          onClick={() => navigate('/cpm-my')}
        >
          去記錄 <RightOutlined style={{ fontSize: 10 }} />
        </Button>
        <Button
          type="link"
          size="small"
          style={{ padding: 0, height: 'auto', fontSize: 12, color: 'var(--text-2)' }}
          onClick={() => navigate('/cpm-report')}
        >
          寫週報
        </Button>
      </div>
    </div>
  )
}
