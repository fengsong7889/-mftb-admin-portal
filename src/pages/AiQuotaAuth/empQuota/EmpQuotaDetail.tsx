import { useEffect, useState } from 'react'
import { Button, Tag, Spin, Progress, message } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppstoreOutlined, IdcardOutlined, BarChartOutlined, FundOutlined } from '@ant-design/icons'
import DetailPageHeader from '../../../components/DetailPageHeader'
import AnimatedNumber from '../../../components/AnimatedNumber'
import { fetchModels, type AiModel } from '../../../api'
import { POSITION_SEQUENCE, POSITION_SEQUENCE_TAG_COLOR } from '../../../api/position'
import {
  usagePercent,
  usageColor,
  quotaText,
  usedText,
  QUOTA_PERIOD_LABEL,
  QUOTA_TYPE_LABEL,
  QUOTA_TYPE_UNIT,
  OVER_LIMIT_ACTION_LABEL,
  OVER_LIMIT_TAG,
  CURRENCY_SYMBOL,
} from './empQuotaStore'
import { fetchPosQuotaDetail, type PosQuotaVO } from '../../../api/empQuota'

/**
 * 員工額度 — 詳情獨立頁（參考部門額度詳情頁佈局）
 * 分區：用量概览 → 適用職位 → 額度配置 → 基础信息
 * 路由：/ai-emp-quota-detail?id=xxx
 */
export default function EmpQuotaDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const quotaId = searchParams.get('id')

  const [loading, setLoading] = useState(true)
  const [policy, setPolicy] = useState<PosQuotaVO | null>(null)
  const [models, setModels] = useState<AiModel[]>([])

  useEffect(() => {
    if (!quotaId) {
      message.error('缺少策略 ID')
      navigate('/ai-emp-quota')
      return
    }
    let cancelled = false
    setLoading(true)
    fetchModels({ status: 1 })
      .then((modelList) => {
        if (cancelled) return
        setModels(modelList)
        return fetchPosQuotaDetail(Number(quotaId))
      })
      .then((found) => {
        if (cancelled) return
        setPolicy(found ?? null)
        if (!found) message.error('額度策略不存在或已刪除')
      })
      .catch(() => { if (!cancelled) message.error('加載詳情失敗') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [quotaId, navigate])

  const handleBack = () => navigate('/ai-emp-quota')

  if (loading) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!policy) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: 16, color: '#8C8C8C' }}>額度策略信息加載失敗</div>
        <Button style={{ marginTop: 16 }} onClick={handleBack}>返回列表</Button>
      </div>
    )
  }

  const pct = usagePercent(policy)
  const pctColor = usageColor(policy)
  const pctBg = pct >= 100 ? '#FFF1F0' : pct >= policy.softThreshold ? '#FFFBE6' : '#F6FFED'
  const statusText = pct >= 100 ? '已超額' : pct >= policy.softThreshold ? '接近上限' : '用量正常'
  const statusTagColor = pct >= 100 ? 'error' : pct >= policy.softThreshold ? 'warning' : 'success'
  const remaining = Math.max(0, policy.quotaValue - policy.usedValue)
  const valuePrefix = policy.quotaType === 'cost' ? CURRENCY_SYMBOL[policy.currency] : ''
  const unitLabel = policy.quotaType === 'cost' ? '' : QUOTA_TYPE_UNIT[policy.quotaType]
  const downgradeModelName = policy.downgradeModelId
    ? models.find((m) => m.id === policy.downgradeModelId)?.name
    : null

  return (
    <div className="content-area">
      {/* 頭部概覽卡 */}
      <DetailPageHeader
        title="額度詳情-職位"
        tags={
          <>
            <Tag color={policy.status === 1 ? 'success' : 'default'} style={{ margin: 0 }}>
              {policy.status === 1 ? '啟用' : '停用'}
            </Tag>
            <Tag color={statusTagColor} style={{ margin: 0 }}>{statusText}</Tag>
          </>
        }
        meta={<>{policy.name} · 最後更新：{policy.updatedBy ?? '-'} · {policy.updatedAt ?? '-'}</>}
        onBack={handleBack}
        onEdit={() => navigate(`/ai-emp-quota-edit?id=${policy.id}`)}
        menuKey="ai-emp-quota"
      />

      {/* ═══ 分区 1：用量概览 ═══ */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChartOutlined style={{ fontSize: 14, color: '#52C41A' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>用量概览</span>
          <Tag color="green">{QUOTA_PERIOD_LABEL[policy.period]}重置</Tag>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <div key={policy.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: '#E6F7FF', border: '1px solid #1890FF22', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1890FF' }}>
              <AnimatedNumber value={policy.usedValue} prefix={valuePrefix} />
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>本期已用{unitLabel ? `（${unitLabel}）` : ''}</div>
          </div>
          <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: '#F9F0FF', border: '1px solid #722ED122', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#722ED1' }}>
              <AnimatedNumber value={policy.quotaValue} prefix={valuePrefix} />
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>限額總值{unitLabel ? `（${unitLabel}）` : ''}</div>
          </div>
          <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: pctBg, border: `1px solid ${pctColor}22`, transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: pctColor }}>
              <AnimatedNumber value={pct} suffix="%" />
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>本期使用率</div>
          </div>
          <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: '#F6FFED', border: '1px solid #52C41A22', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#52C41A' }}>
              <AnimatedNumber value={policy.totalEmployeeCount} suffix=" 人" />
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>覆蓋人數</div>
          </div>
        </div>

        {/* 用量進度條 */}
        <div style={{ marginTop: 20, padding: '18px 20px', borderRadius: 12, background: '#FAFAFA', border: '1px solid #F0F0F0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>本期用量進度</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: pctColor }}>{pct}%</span>
          </div>
          <Progress percent={Math.min(pct, 100)} strokeColor={pctColor} showInfo={false} size={['100%', 14]} style={{ marginBottom: 12 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 13 }}>
            <span style={{ color: '#595959' }}>
              已用 <strong style={{ color: pctColor }}>{usedText(policy)}</strong> · 限額 {quotaText(policy)}
            </span>
            <span style={{ color: '#8C8C8C' }}>
              軟提醒 {policy.softThreshold}% · 剩餘 <strong style={{ color: remaining > 0 ? '#52C41A' : '#FF4D4F' }}>{valuePrefix}{remaining.toLocaleString()}{unitLabel ? ` ${unitLabel}` : ''}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ═══ 分区 2：适用职位 ═══ */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IdcardOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>適用職位</span>
          <Tag color="blue">{policy.sequences.length} 個序列 · {policy.jobLevels.length} 個職級</Tag>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>職級序列</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {policy.sequences.map((s) => (
                <Tag key={s} color={POSITION_SEQUENCE_TAG_COLOR[s]} style={{ fontSize: 13, padding: '4px 12px', lineHeight: '24px' }}>
                  {POSITION_SEQUENCE[s] ?? s}
                </Tag>
              ))}
              {policy.sequences.length === 0 && <span style={{ color: '#BFBFBF' }}>未設置</span>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>職級</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {policy.jobLevels.map((l) => (
                <Tag key={l} style={{ fontSize: 13, padding: '4px 12px', lineHeight: '24px' }}>{l}</Tag>
              ))}
              {policy.jobLevels.length === 0 && <span style={{ color: '#BFBFBF' }}>未設置</span>}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16, fontSize: 13, color: '#595959' }}>
          共覆蓋 <strong>{policy.totalEmployeeCount.toLocaleString()}</strong> 人
          <span style={{ marginLeft: 8, color: '#8C8C8C' }}>· 人均獨立額度，每人 {quotaText(policy)}</span>
        </div>
      </div>

      {/* ═══ 分区 3：额度配置 ═══ */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FundOutlined style={{ fontSize: 14, color: '#E8720C' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>額度配置</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px 16px' }}>
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>限額周期</div>
            <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{QUOTA_PERIOD_LABEL[policy.period]}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>限額類型</div>
            <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{QUOTA_TYPE_LABEL[policy.quotaType]}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>限額值</div>
            <div style={{ fontSize: 14, color: '#E8720C', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{quotaText(policy)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>軟限額提醒閾值</div>
            <div style={{ fontSize: 14, color: '#FAAD14', fontWeight: 600 }}>{policy.softThreshold}%</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>超出限額動作</div>
            <Tag color={OVER_LIMIT_TAG[policy.overLimitAction]}>{OVER_LIMIT_ACTION_LABEL[policy.overLimitAction]}</Tag>
          </div>
          {policy.overLimitAction === 'downgrade' && (
            <div>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 6 }}>降級目標模型</div>
              <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{downgradeModelName ?? (policy.downgradeModelId ? `模型 #${policy.downgradeModelId}` : '-')}</div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ 分区 4：基础信息 ═══ */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基础信息</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {([
            { label: '策略名稱', value: policy.name },
            { label: '描述', value: policy.description || '-' },
            { label: '狀態', value: policy.status === 1 ? '啟用' : '停用' },
            { label: '最後更新人', value: policy.updatedBy ?? '-' },
            { label: '創建時間', value: policy.createdAt ?? '-' },
            { label: '更新時間', value: policy.updatedAt ?? '-' },
          ] as Array<{ label: string; value: string }>).map((item) => (
            <div key={item.label}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
