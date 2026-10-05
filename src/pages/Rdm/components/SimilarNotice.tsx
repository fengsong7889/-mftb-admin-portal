/**
 * 相似需求查重提示 —— 提单页与详情页共用
 *
 * 设计口径：查重**只提示、不拦路**。算法不可能百分百准，
 * 拦在提交按钮前会误伤真需求（用户只会认为"系统坏了"）；
 * 所以这里给出候选、命中词与状态，把判断权留给提出人，
 * 同时把「疑似重复」显式标红，让他在提交前顺手确认一下。
 */
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Space, Spin, Tag, Tooltip } from 'antd'
import { CopyOutlined, EyeOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { fetchSimilarRequirements, type RdmSimilarItem } from '../../../api/rdm'
import { RDM_STATUS_LABEL, type RdmStatus } from '../../../constants/rdm'

interface SimilarNoticeProps {
  /** 当前填写的标题 */
  title?: string
  /** 期望结果/描述，参与相似度计算 */
  expectText?: string
  /** 编辑场景排除自身 */
  excludeId?: number
}

/** 标题最短触发长度（过短必然误报） */
const MIN_TRIGGER_LENGTH = 4
/** 输入停止多久后再查（避免每敲一个字打一次接口） */
const DEBOUNCE_MS = 450

export default function SimilarNotice({ title, expectText, excludeId }: SimilarNoticeProps) {
  const navigate = useNavigate()
  const [items, setItems] = useState<RdmSimilarItem[]>([])
  const [duplicateSuspect, setDuplicateSuspect] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [method, setMethod] = useState<string>()
  const timerRef = useRef<number>()
  // 请求序号：只接受最后一次结果，避免快速输入时旧响应覆盖新结果
  const seqRef = useRef(0)

  useEffect(() => {
    const query = (title ?? '').trim()
    if (query.length < MIN_TRIGGER_LENGTH) {
      setItems([])
      setDuplicateSuspect(false)
      setLoading(false)
      return
    }
    setLoading(true)
    window.clearTimeout(timerRef.current)
    const seq = ++seqRef.current
    timerRef.current = window.setTimeout(() => {
      fetchSimilarRequirements({ title: query, expectText, excludeId })
        .then(res => {
          if (seq !== seqRef.current) return
          setItems(res.items ?? [])
          setDuplicateSuspect(res.duplicateSuspect ?? false)
          setMethod(res.method ?? undefined)
        })
        .catch(() => {
          if (seq !== seqRef.current) return
          setItems([])
          setDuplicateSuspect(false)
        })
        .finally(() => {
          if (seq === seqRef.current) setLoading(false)
        })
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(timerRef.current)
  }, [title, expectText, excludeId])

  if (loading && items.length === 0) {
    return (
      <div style={{ margin: '-8px 0 12px', fontSize: 12, color: '#8C8C8C' }}>
        <Spin size="small" style={{ marginRight: 6 }} />正在檢查是否已有相似需求…
      </div>
    )
  }
  if (items.length === 0) return null

  const visible = expanded ? items : items.slice(0, 2)
  // 首条候选的命中词（先取定再判长，避开 items[0] 可能为 undefined 的空值问题）
  const firstMatchedTerms = items[0]?.matchedTerms ?? []

  return (
    <Alert
      type={duplicateSuspect ? 'warning' : 'info'}
      showIcon
      icon={<CopyOutlined />}
      style={{ marginBottom: 12 }}
      message={(
        <Space size={8} wrap>
          <span>
            {duplicateSuspect
              ? '已有高度相似的在途需求，建議先在原需求下補充說明，而不是重新提單'
              : `有 ${items.length} 條相近需求可先比對`}
          </span>
          {method && (
            <Tooltip title={method}>
              <Tag style={{ margin: 0 }}>查重方式</Tag>
            </Tooltip>
          )}
        </Space>
      )}
      description={(
        <div>
          {visible.map(item => (
            <div key={item.reqId} className="rdm-similar-row">
              <span className="rdm-similar-row-main">
                <a style={{ color: '#E8720C' }} onClick={() => navigate(`/rdm-detail?id=${item.reqId}`)}>
                  {item.title}
                </a>
                <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>
                  {item.reqNo} · {RDM_STATUS_LABEL[item.status as RdmStatus] ?? item.status}
                  {item.pmName ? ` · 產品 ${item.pmName}` : ''}
                  {item.submitterName ? ` · 提出 ${item.submitterName}` : ''}
                </span>
              </span>
              <Space size={6}>
                {item.sameSubmitter && <Tag color="purple" style={{ margin: 0 }}>同一人</Tag>}
                {item.inProgress && <Tag color="processing" style={{ margin: 0 }}>在途</Tag>}
                <SimilarityTag value={item.similarity} />
                <Button
                  type="link"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => navigate(`/rdm-detail?id=${item.reqId}`)}
                >
                  查看
                </Button>
              </Space>
            </div>
          ))}
          <Space size={8} style={{ marginTop: 4 }}>
            {items.length > 2 && (
              <Button type="link" size="small" style={{ paddingLeft: 0 }} onClick={() => setExpanded(v => !v)}>
                {expanded ? '收起' : `展開其餘 ${items.length - 2} 條`}
              </Button>
            )}
            {firstMatchedTerms.length > 0 && (
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                命中詞：{firstMatchedTerms.join('、')}
              </span>
            )}
          </Space>
        </div>
      )}
    />
  )
}

/** 相似度标签（阈值配色，让“多像”一眼可比） */
function SimilarityTag({ value }: { value?: number | null }) {
  const score = value ?? 0
  const color = score >= 0.7 ? '#CF1322' : score >= 0.45 ? '#FA8C16' : '#1890FF'
  return (
    <span style={{ fontSize: 12, color, fontWeight: 600 }}>
      {Math.round(score * 100)}%
    </span>
  )
}
