/**
 * 逾期风险摘要卡 —— 数字来自 SQL，AI 只负责把要点写成一段话
 *
 * 设计口径：管理层要的是"今天该动谁"。所以：
 * 1. 结构化要点永远展示（后端熔断/额度用完也在），它才是可行动部分；
 * 2. AI 叙述单独标注来源与「非 AI」降级提示，绝不让人误以为是模型算出来的数字；
 * 3. 每条风险可直接跳需求详情，摘要不能变成只能看的墙。
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Segmented, Space, Tag, Tooltip, message } from 'antd'
import { AlertOutlined, BulbOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { fetchRiskSummary, type RdmRiskSummary } from '../../../api/rdm'
import { RDM_RISK_COLOR, RDM_RISK_LABEL, RDM_STATUS_LABEL, type RdmRiskType, type RdmStatus } from '../../../constants/rdm'

const WINDOW_OPTIONS = [
  { label: '近 7 天', value: '7' },
  { label: '近 14 天', value: '14' },
  { label: '近 30 天', value: '30' },
]

export default function RiskSummaryCard() {
  const navigate = useNavigate()
  const [days, setDays] = useState(14)
  const [data, setData] = useState<RdmRiskSummary | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchRiskSummary(days))
    } catch {
      message.error('風險摘要載入失敗')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { void load() }, [load])

  const risks = data?.topRisks ?? []

  return (
    <div className="rdm-card">
      <div className="rdm-card-title">
        <span className="rdm-icon-block" style={{ background: '#FFF1F0', color: '#FF4D4F' }}><AlertOutlined /></span>
        風險摘要
        <span className="rdm-card-title-split" />
        <Segmented
          size="small"
          value={String(days)}
          options={WINDOW_OPTIONS}
          onChange={v => setDays(Number(v))}
        />
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()} style={{ marginLeft: 8 }}>
          重算
        </Button>
      </div>

      {data?.narrative && (
        <div className="rdm-risk-narrative">
          <span className="rdm-risk-narrative-text">{data.narrative}</span>
          <Space size={6} style={{ marginTop: 6 }}>
            {data.aiUsed
              ? (
                <Tag color="purple" icon={<BulbOutlined />} style={{ margin: 0 }}>
                  AI 生成 · {data.model ?? '模型'} · 僅描述文字，數字來自統計
                </Tag>
              )
              : <Tag style={{ margin: 0 }}>結構化摘要（未經 AI）</Tag>}
            {data.notice && (
              <Tooltip title={data.notice}>
                <Tag color="warning" style={{ margin: 0 }}>AI 未啟用</Tag>
              </Tooltip>
            )}
          </Space>
        </div>
      )}

      {data && data.highlights && data.highlights.length > 0 && (
        <ul className="rdm-risk-highlights">
          {data.highlights.map(h => <li key={h}>{h}</li>)}
        </ul>
      )}

      {risks.length === 0 && !data?.narrative && (
        <div style={{ fontSize: 12, color: '#8C8C8C' }}>
          {loading ? '生成中…' : '暫無需要管理動作的風險需求。'}
        </div>
      )}

      {risks.length > 0 && (
        <div className="rdm-risk-list">
          {risks.slice(0, 6).map(r => {
            const color = RDM_RISK_COLOR[r.riskType as RdmRiskType] ?? '#8C8C8C'
            return (
              <div key={r.reqId} className="rdm-risk-list-item" onClick={() => navigate(`/rdm-detail?id=${r.reqId}`)}>
                <Tag style={{ margin: 0, color, borderColor: `${color}66`, background: `${color}12` }}>
                  {RDM_RISK_LABEL[r.riskType as RdmRiskType] ?? r.riskType}
                </Tag>
                <span className="rdm-risk-list-main">
                  <span style={{ color: '#262626' }}>{r.title}</span>
                  <span className="rdm-risk-list-meta">
                    {r.reqNo} · {RDM_STATUS_LABEL[r.status as RdmStatus] ?? r.status} · 處理人 {r.handler ?? '待分配'}
                  </span>
                </span>
                <span className="rdm-risk-list-days">停留 {r.days ?? 0} 天</span>
                <RightOutlined style={{ color: '#BFBFBF', fontSize: 11 }} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
