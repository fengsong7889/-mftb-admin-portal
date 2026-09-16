import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Tag, Spin, message } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppstoreOutlined, IdcardOutlined, BarChartOutlined } from '@ant-design/icons'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { fetchModels, type AiModel } from '../../../api'
import { POSITION_SEQUENCE, POSITION_SEQUENCE_TAG_COLOR } from '../../../api/position'
import AnimatedNumber from '../../../components/AnimatedNumber'
import { ModelAuthSectionReadonly } from './ModelAuthSection'
import { clampModelConfigs, type PosAuthRule } from './modelAuthCapability'
import { getPosStrategyById } from '../../../api/empAuth'

/**
 * 按職位授權 - 詳情獨立頁（參考部門模型權控詳情頁佈局）
 * 分區：统计概览 → 適用職位 → 授權模型（能力矩陣） → 基础信息
 * 路由：/ai-pos-auth-detail?id=xxx
 */
export default function EmpPosAuthDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ruleId = searchParams.get('id')

  const [loading, setLoading] = useState(true)
  const [rule, setRule] = useState<PosAuthRule | null>(null)
  const [models, setModels] = useState<AiModel[]>([])

  useEffect(() => {
    if (!ruleId) {
      message.error(t('aiQuotaAuth.missingRuleId'))
      navigate('/ai-emp-model-auth')
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [modelList, detail] = await Promise.all([fetchModels({ status: 1 }), getPosStrategyById(ruleId)])
        if (cancelled) return
        setModels(modelList)
        setRule({
          id: detail.id,
          ruleName: detail.ruleName,
          sequence: detail.sequence ?? [],
          jobLevels: detail.jobLevels ?? [],
          modelConfigs: clampModelConfigs(detail.modelConfigs ?? [], modelList),
          dataResidency: detail.dataResidency,
          description: detail.description ?? '',
          status: detail.status,
          createdAt: detail.createdAt ?? '',
          updatedBy: detail.updatedBy,
          updatedAt: detail.updatedAt,
        })
      } catch {
        if (!cancelled) message.error(t('aiQuotaAuth.posAuthNotFound'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [ruleId, navigate])

  const handleBack = () => navigate('/ai-emp-model-auth')

  if (loading) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!rule) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: 16, color: '#8C8C8C' }}>{t('aiQuotaAuth.authPolicyLoadFailed')}</div>
        <Button style={{ marginTop: 16 }} onClick={handleBack}>{t('aiQuotaAuth.backToList')}</Button>
      </div>
    )
  }

  return (
    <div className="content-area">
      {/* 頭部概覽卡（全局統一規範：詳情頁紫色頂條 + 橙色返回 + 權限門控紫色編輯） */}
      <DetailPageHeader
        title={t('aiQuotaAuth.posAuthDetailTitle')}
        tags={<Tag color={rule.status === 1 ? 'success' : 'default'} style={{ margin: 0 }}>{rule.status === 1 ? t('aiQuotaAuth.enableText') : t('aiQuotaAuth.disableText')}</Tag>}
        meta={<>{rule.ruleName} · {t('aiQuotaAuth.lastUpdateLabel')}：{rule.updatedBy ?? '-'} · {rule.updatedAt ?? '-'}</>}
        onBack={handleBack}
        onEdit={() => navigate(`/ai-pos-auth-edit?id=${rule.id}`)}
        menuKey="ai-emp-model-auth"
      />

      {/* ═══ 分区 1：统计概览（數據指標統計卡標準 12.1） ═══ */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChartOutlined style={{ fontSize: 14, color: '#52C41A' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('aiQuotaAuth.statsOverview')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div key={rule.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: '#E6F7FF', border: '1px solid #1890FF22', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1890FF' }}>
              <AnimatedNumber value={rule.sequence.length} />
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{t('aiQuotaAuth.seqLabel')}</div>
          </div>
          <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: '#F6FFED', border: '1px solid #52C41A22', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#52C41A' }}>
              <AnimatedNumber value={rule.jobLevels.length} />
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{t('aiQuotaAuth.jobLevelCount')}</div>
          </div>
          <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: '#F9F0FF', border: '1px solid #722ED122', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#722ED1' }}>
              <AnimatedNumber value={rule.modelConfigs.length} />
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{t('aiQuotaAuth.authModelCount')}</div>
          </div>
          <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: '#FFF7E6', border: '1px solid #E8720C22', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#E8720C' }}>
              {rule.createdAt?.split('T')[0] ?? '-'}
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{t('aiQuotaAuth.createdAtCol')}</div>
          </div>
        </div>
      </div>

      {/* ═══ 分区 2：适用职位 ═══ */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <IdcardOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('aiQuotaAuth.applicablePosTitle')}</span>
          <Tag color="blue">{t('aiQuotaAuth.seqLevelCount', { seqCount: rule.sequence.length, levelCount: rule.jobLevels.length })}</Tag>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>{t('aiQuotaAuth.seqLabel')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {rule.sequence.map((s) => (
                <Tag key={s} color={POSITION_SEQUENCE_TAG_COLOR[s]} style={{ fontSize: 13, padding: '4px 12px', lineHeight: '24px' }}>
                  {POSITION_SEQUENCE[s] ?? s}
                </Tag>
              ))}
              {rule.sequence.length === 0 && <span style={{ color: '#BFBFBF' }}>{t('aiQuotaAuth.notSetLabel')}</span>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>{t('aiQuotaAuth.jobLevelLabel')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {rule.jobLevels.map((l) => (
                <Tag key={l} style={{ fontSize: 13, padding: '4px 12px', lineHeight: '24px' }}>{l}</Tag>
              ))}
              {rule.jobLevels.length === 0 && <span style={{ color: '#BFBFBF' }}>{t('aiQuotaAuth.notSetLabel')}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ 分区 3：授权模型（能力顆粒度矩陣） ═══ */}
      <ModelAuthSectionReadonly models={models} configs={rule.modelConfigs} />

      {/* ═══ 分区 4：基础信息 ═══ */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('aiQuotaAuth.basicInfoSection')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {([
            { label: t('aiQuotaAuth.strategyNameCol'), value: rule.ruleName },
            { label: t('aiQuotaAuth.descLabel'), value: rule.description || '-' },
            { label: t('aiQuotaAuth.statusCol'), value: rule.status === 1 ? t('aiQuotaAuth.enableText') : t('aiQuotaAuth.disableText') },
            { label: t('aiQuotaAuth.lastUpdatedByCol'), value: rule.updatedBy ?? '-' },
            { label: t('aiQuotaAuth.createdAtCol'), value: rule.createdAt ?? '-' },
            { label: t('aiQuotaAuth.updatedAtCol'), value: rule.updatedAt ?? '-' },
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
