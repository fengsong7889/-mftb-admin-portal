import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, InputNumber, Radio, Select, Slider, Switch, Tag, Tooltip, message, Spin } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeftOutlined, SaveOutlined, AppstoreOutlined, IdcardOutlined,
  FundOutlined, PoweroffOutlined,
} from '@ant-design/icons'
import { fetchModels, type AiModel } from '../../../api'
import { POSITION_SEQUENCE_OPTIONS, POSITION_RANK_OPTIONS, POSITION_SEQUENCE, POSITION_SEQUENCE_TAG_COLOR } from '../../../api/position'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'
import {
  QUOTA_PERIOD_LABEL,
  QUOTA_TYPE_LABEL,
  QUOTA_TYPE_UNIT,
  OVER_LIMIT_ACTION_LABEL,
  CURRENCY_SYMBOL,
  CURRENCY_OPTIONS,
  type QuotaPeriod,
  type QuotaType,
  type OverLimitAction,
  type Currency,
} from './empQuotaStore'
import { fetchPosQuotaDetail, savePosQuota, type PosQuotaRequest } from '../../../api/empQuota'

/** 格式化時間為 YYYY-MM-DD HH:mm:ss */
const nowText = (): string => new Date().toISOString().slice(0, 19).replace('T', ' ')

/**
 * 員工額度 — 新增 / 編輯獨立頁（全局統一：取消彈窗，參考部門額度）
 * 分區：基础信息 → 適用職位（職級序列 + 職級） → 額度配置 → 狀態配置
 * 路由：/ai-emp-quota-edit（新增）、/ai-emp-quota-edit?id=xxx（編輯）
 */
export default function EmpQuotaEdit() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const quotaId = searchParams.get('id')
  const isEdit = !!quotaId

  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  /* ── 基礎數據 ── */
  const [models, setModels] = useState<AiModel[]>([])
  const [employees, setEmployees] = useState<EmployeeItem[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchModels({ status: 1 }).catch(() => [] as AiModel[]),
      fetchEmployees({ page: 1, size: 200 }).catch(() => ({ records: [] as EmployeeItem[] } as any)),
    ])
      .then(([modelList, empResult]) => {
        if (cancelled) return
        setModels(modelList)
        setEmployees(empResult.records || [])

        if (quotaId) {
          fetchPosQuotaDetail(Number(quotaId)).then((policy) => {
            if (!policy) {
              message.error('額度策略不存在或已刪除')
              navigate('/ai-emp-quota')
              return
            }
            form.setFieldsValue({
              name: policy.name,
              description: policy.description ?? '',
              sequences: policy.sequences,
              jobLevels: policy.jobLevels,
              period: policy.period,
              quotaType: policy.quotaType,
              quotaValue: policy.quotaValue,
              currency: policy.currency,
              softThreshold: policy.softThreshold,
              overLimitAction: policy.overLimitAction,
              downgradeModelId: policy.downgradeModelId ?? undefined,
              status: policy.status,
            })
          }).catch(() => { message.error('加載詳情失敗'); navigate('/ai-emp-quota') })
        }
      })
      .catch(() => { if (!cancelled) message.error('加載數據失敗') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [quotaId, form, navigate])

  /* ── 表單聯動 ── */
  const period = Form.useWatch('period', form) as QuotaPeriod | undefined
  const quotaType = Form.useWatch('quotaType', form) as QuotaType | undefined
  const quotaValue = Form.useWatch('quotaValue', form) as number | undefined
  const currency = Form.useWatch('currency', form) as Currency | undefined
  const softThreshold = Form.useWatch('softThreshold', form) as number | undefined
  const overLimitAction = Form.useWatch('overLimitAction', form) as OverLimitAction | undefined
  const sequences = Form.useWatch('sequences', form) as string[] | undefined
  const jobLevels = Form.useWatch('jobLevels', form) as string[] | undefined

  /** 匹配員工數（按序列 + 職級） */
  const matchedEmployeeCount = useMemo(() => {
    if (!sequences?.length || !jobLevels?.length) return 0
    return employees.filter(
      (e) => e.sequence && sequences.includes(e.sequence) && e.jobLevel && jobLevels.includes(e.jobLevel),
    ).length
  }, [employees, sequences, jobLevels])

  /** 限額值輸入框單位後綴 */
  const valueUnit = useMemo(() => {
    if (!quotaType) return ''
    if (quotaType === 'cost') return currency === 'USD' ? 'USD' : 'CNY'
    return QUOTA_TYPE_UNIT[quotaType]
  }, [quotaType, currency])

  /** 限額文案 */
  const fmtQuota = (val: number, qt: QuotaType, cur: Currency): string => {
    if (qt === 'cost') return `${CURRENCY_SYMBOL[cur]}${val.toLocaleString()}`
    return `${val.toLocaleString()} ${QUOTA_TYPE_UNIT[qt]}`.trim()
  }

  /** 降級目標模型下拉 */
  const modelOptions = useMemo(
    () => models.map((m) => ({ value: m.id, label: m.name })),
    [models],
  )

  /* ── 保存 ── */
  const handleSave = async () => {
    const values = await form.validateFields()

    if (!values.sequences?.length || !values.jobLevels?.length) {
      message.warning('請至少選擇一個職級序列和職級')
      return
    }
    if (values.overLimitAction === 'downgrade' && !values.downgradeModelId) {
      message.warning('超額動作為「自動降級」時，請選擇降級目標模型')
      return
    }

    const now = nowText()
    const base = {
      name: String(values.name).trim(),
      description: (values.description ?? '') as string,
      sequences: values.sequences as string[],
      jobLevels: values.jobLevels as string[],
      totalEmployeeCount: matchedEmployeeCount,
      period: values.period as QuotaPeriod,
      quotaType: values.quotaType as QuotaType,
      quotaValue: Number(values.quotaValue),
      currency: (values.currency ?? 'CNY') as Currency,
      softThreshold: (values.softThreshold ?? 80) as number,
      overLimitAction: values.overLimitAction as OverLimitAction,
      downgradeModelId: values.overLimitAction === 'downgrade' ? (values.downgradeModelId ?? null) : null,
      status: (values.status ?? 1) as number,
      updatedBy: 'admin',
      updatedAt: now,
    }

    setSaving(true)
    try {
      const payload: PosQuotaRequest = {
        ...(isEdit && quotaId ? { id: Number(quotaId) } : {}),
        name: String(values.name).trim(),
        description: (values.description ?? '') as string,
        sequences: values.sequences as string[],
        jobLevels: values.jobLevels as string[],
        totalEmployeeCount: matchedEmployeeCount,
        period: values.period as string,
        quotaType: values.quotaType as string,
        quotaValue: Number(values.quotaValue),
        currency: (values.currency ?? 'CNY') as string,
        softThreshold: (values.softThreshold ?? 80) as number,
        overLimitAction: values.overLimitAction as string,
        downgradeModelId: values.overLimitAction === 'downgrade' ? (values.downgradeModelId ?? null) : null,
        status: (values.status ?? 1) as number,
      }
      await savePosQuota(payload)
      message.success(isEdit ? '額度策略已更新' : '額度策略已創建')
      navigate('/ai-emp-quota')
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => navigate('/ai-emp-quota')

  if (loading && !models.length && !isEdit) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  /* ── 實時額度解讀 ── */
  const seqLabel = (sequences ?? []).map((s) => POSITION_SEQUENCE[s] ?? s).join('、') || '（尚未選擇序列）'
  const lvlLabel = (jobLevels ?? []).join('、') || '（尚未選擇職級）'
  const quotaReadable = quotaValue && quotaType && period
    ? `每人獨立 ${fmtQuota(quotaValue, quotaType, currency ?? 'CNY')} / ${QUOTA_PERIOD_LABEL[period]}，${matchedEmployeeCount} 人合計上限 ${fmtQuota(quotaValue * matchedEmployeeCount, quotaType, currency ?? 'CNY')}`
    : '（請完善限額類型、周期與限額值）'

  return (
    <div className="content-area">
      {/* 頁面頭部（全局統一：橙色頂條 + 橙色返回按鈕） */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8,
                height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEdit ? '編輯模型額度-職位' : '新增模型額度-職位'}
            </h2>
          </div>
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          period: 'monthly', quotaType: 'token',
          currency: 'CNY', softThreshold: 80, overLimitAction: 'reject', status: 1,
          sequences: [], jobLevels: [],
        }}
      >
        {/* ═══ 分区 1：基础信息 ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基础信息</span>
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>可编辑</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="name" label="策略名稱" rules={[{ required: true, message: '請輸入策略名稱' }]}>
              <Input placeholder="如：管理層月度 Token 額度" maxLength={50} allowClear />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input placeholder="請輸入策略用途說明（選填）" maxLength={200} allowClear />
            </Form.Item>
          </div>
        </div>

        {/* ═══ 分区 2：适用职位（职级序列 + 职级） ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IdcardOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>適用職位</span>
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>職級序列 · 職級</Tag>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>匹配所選序列/職級的職位下所有員工自動生效額度</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="sequences" label="職級序列" rules={[{ required: true, message: '請選擇職級序列', type: 'array', min: 1 }]}>
              <Select placeholder="選擇職級序列（可多选）" options={POSITION_SEQUENCE_OPTIONS} mode="multiple" allowClear maxTagCount="responsive" />
            </Form.Item>
            <Form.Item name="jobLevels" label="職級" rules={[{ required: true, message: '請選擇職級', type: 'array', min: 1 }]}>
              <Select placeholder="選擇職級（可多选）" options={POSITION_RANK_OPTIONS} mode="multiple" allowClear maxTagCount="responsive" />
            </Form.Item>
          </div>

          {/* 匹配員工預覽 */}
          <div style={{
            marginTop: 4, padding: '12px 16px', borderRadius: 8,
            background: '#F6FFED', border: '1px solid #D9F7BE',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 13, color: '#595959' }}>
              匹配條件：
              {(sequences ?? []).map((s) => (
                <Tag key={s} color={POSITION_SEQUENCE_TAG_COLOR[s]} style={{ marginRight: 4 }}>{POSITION_SEQUENCE[s] ?? s}</Tag>
              ))}
              {(jobLevels ?? []).map((l) => (
                <Tag key={l} style={{ marginRight: 4 }}>{l}</Tag>
              ))}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: matchedEmployeeCount > 0 ? '#52C41A' : '#8C8C8C' }}>
              匹配 {matchedEmployeeCount} 名員工
            </span>
          </div>
        </div>

        {/* ═══ 分区 3：额度配置 ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FundOutlined style={{ fontSize: 14, color: '#E8720C' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>额度配置</span>
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>核心</Tag>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>網關在每次請求前校驗用量，按此規則限制與提醒</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          {/* 限額周期 + 限額類型 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="period" label="限額周期" rules={[{ required: true }]} extra="週期結束自動重置用量">
              <Radio.Group optionType="button" buttonStyle="solid"
                options={Object.entries(QUOTA_PERIOD_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="quotaType" label="限額類型" rules={[{ required: true }]}>
              <Select options={Object.entries(QUOTA_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </div>

          {/* 限額值 + 軟限額提醒閾值 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="quotaValue" label="限額值" rules={[{ required: true, message: '請輸入限額值' }]}>
              <InputNumber<number>
                min={1}
                style={{ width: '100%' }}
                placeholder={quotaType === 'cost' ? '如：600' : quotaType === 'request' ? '如：5000' : '如：200000000'}
                addonAfter={valueUnit}
                formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={(v) => Number(`${v ?? ''}`.replace(/,/g, ''))}
              />
            </Form.Item>
            <Form.Item
              name="softThreshold"
              label={<span>軟限額提醒閾值 <span style={{ color: '#8C8C8C', fontWeight: 400, fontSize: 12 }}>（達此比例時通知，不阻斷）</span></span>}
            >
              <Slider min={10} max={100} step={5} marks={{ 50: '50%', 80: '80%', 100: '100%' }}
                tooltip={{ formatter: (v) => `${v}%` }} />
            </Form.Item>
          </div>

          {/* 計價幣種（僅費用類型時） */}
          {quotaType === 'cost' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Form.Item name="currency" label="計價幣種" rules={[{ required: true }]}>
                <Select options={CURRENCY_OPTIONS} />
              </Form.Item>
            </div>
          )}

          {/* 超額動作 */}
          <Form.Item name="overLimitAction" label="超出限額後動作" rules={[{ required: true }]}>
            <Radio.Group>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {(['reject', 'approve', 'downgrade'] as OverLimitAction[]).map((act) => {
                  const active = overLimitAction === act
                  const desc = act === 'reject' ? '直接攔截並返回配額不足'
                    : act === 'approve' ? '轉主管審批，可臨時提額'
                    : '自動切換到更輕量 / 便宜的模型'
                  return (
                    <label key={act} style={{
                      display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
                      padding: '12px 14px', borderRadius: 8,
                      border: `1px solid ${active ? '#E8720C' : '#e8eaed'}`,
                      background: active ? '#FFF7E6' : '#fff', transition: 'all 0.2s',
                    }}>
                      <Radio value={act} style={{ marginTop: 2 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#262626' }}>{OVER_LIMIT_ACTION_LABEL[act]}</div>
                        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </Radio.Group>
          </Form.Item>

          {/* 降級目標模型 */}
          {overLimitAction === 'downgrade' && (
            <Form.Item name="downgradeModelId" label="降級目標模型" rules={[{ required: true, message: '請選擇降級目標模型' }]}
              extra="超出限額後，該職位員工請求自動路由到此模型">
              <Select showSearch optionFilterProp="label" placeholder="選擇降級後使用的模型" options={modelOptions} />
            </Form.Item>
          )}

          {/* 實時額度解讀 */}
          <div style={{
            marginTop: 4, padding: '14px 16px', borderRadius: 8,
            background: 'linear-gradient(135deg, #FFF7E6, #FFFBF0)', border: '1px solid #FFE7BA',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#E8720C', marginBottom: 8 }}>額度解讀（實時）</div>
            <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.9 }}>
              <div>· 適用序列：<strong style={{ color: '#262626' }}>{seqLabel}</strong></div>
              <div>· 適用職級：<strong style={{ color: '#262626' }}>{lvlLabel}</strong>（{matchedEmployeeCount} 人）</div>
              <div>· 額度：{quotaReadable}</div>
              <div>· 提醒：用量達 <strong style={{ color: '#FAAD14' }}>{softThreshold ?? 80}%</strong> 時通知員工與主管（不阻斷）</div>
              <div>· 超額：<strong style={{ color: '#FF4D4F' }}>{OVER_LIMIT_ACTION_LABEL[overLimitAction ?? 'reject']}</strong>
                {overLimitAction === 'downgrade' ? '到更輕量模型' : ''}</div>
            </div>
          </div>
        </div>

        {/* ═══ 分区 4：状态配置 ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PoweroffOutlined style={{ fontSize: 14, color: '#E8720C' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>状态配置</span>
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>可编辑</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ background: '#FFF7E6', padding: 16, borderRadius: 8, border: '1px solid #FFE7BA' }}>
            <Form.Item
              name="status"
              label="啟用狀態"
              valuePropName="checked"
              getValueFromEvent={(checked) => checked ? 1 : 0}
              getValueProps={(value) => ({ checked: value === 1 })}
              style={{ marginBottom: 0 }}
              extra="停用後該策略關聯的職位員工不再受此限額約束"
            >
              <Switch checkedChildren="啟用" unCheckedChildren="停用" />
            </Form.Item>
          </div>
        </div>
      </Form>

      {/* 底部操作按鈕（全局統一：取消 + 保存） */}
      <div className="form-footer">
        <Button onClick={handleBack}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
          保存
        </Button>
      </div>
    </div>
  )
}
