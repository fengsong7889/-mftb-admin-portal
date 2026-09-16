import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, InputNumber, Radio, Select, Slider, Switch, Tag, message, Spin } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeftOutlined, SaveOutlined, AppstoreOutlined, TeamOutlined,
  FundOutlined, PoweroffOutlined,
} from '@ant-design/icons'
import { fetchModels, type AiModel } from '../../../api'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'
import {
  QUOTA_PERIOD_LABEL,
  QUOTA_TYPE_LABEL,
  QUOTA_TYPE_UNIT,
  OVER_LIMIT_ACTION_LABEL,
  CURRENCY_SYMBOL,
  CURRENCY_OPTIONS,
} from './roleQuotaStore'
import type { QuotaPeriod, QuotaType, OverLimitAction, Currency } from './empQuotaStore'
import { fetchRoleQuotaDetail, saveRoleQuota, type RoleQuotaRequest } from '../../../api/empQuota'
import { useTranslation } from 'react-i18next'

const nowText = (): string => new Date().toISOString().slice(0, 19).replace('T', ' ')

/**
 * 角色額度 — 新增 / 編輯獨立頁（全局統一，參考部門額度 + 角色授權）
 * 分區：基础信息 → 綁定員工（穿梭框） → 額度配置 → 狀態配置
 * 路由：/ai-role-quota-edit（新增）、/ai-role-quota-edit?id=xxx（編輯）
 */
export default function RoleQuotaEdit() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const quotaId = searchParams.get('id')
  const isEdit = !!quotaId

  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [models, setModels] = useState<AiModel[]>([])
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [boundUsers, setBoundUsers] = useState<number[]>([])
  const [checkedEmpIds, setCheckedEmpIds] = useState<number[]>([])
  const [empSearchKw, setEmpSearchKw] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchModels({ status: 1 }).catch(() => [] as AiModel[]),
      fetchEmployees({ page: 1, size: 200 }).catch(() => ({ records: [] as EmployeeItem[] }) as any),
    ]).then(([modelList, empResult]) => {
      if (cancelled) return
      setModels(modelList)
      setEmployees(empResult.records || [])
      if (quotaId) {
        fetchRoleQuotaDetail(Number(quotaId)).then((policy) => {
          if (!policy) { message.error(t('aiQuotaAuth.strategyNotFound')); navigate('/ai-emp-quota#role'); return }
          form.setFieldsValue({
            roleName: policy.roleName, description: policy.description ?? '',
            period: policy.period, quotaType: policy.quotaType,
            quotaValue: policy.quotaValue, currency: policy.currency, softThreshold: policy.softThreshold,
            overLimitAction: policy.overLimitAction, downgradeModelId: policy.downgradeModelId ?? undefined, status: policy.status,
          })
          setBoundUsers(policy.userIds ?? [])
        }).catch(() => { message.error(t('aiQuotaAuth.loadDetailFailed')); navigate('/ai-emp-quota#role') })
      }
    }).catch(() => { if (!cancelled) message.error(t('aiQuotaAuth.loadDataFailed')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [quotaId, form, navigate])

  /* ── 表單聯動 ── */
  const quotaType = Form.useWatch('quotaType', form) as QuotaType | undefined
  const quotaValue = Form.useWatch('quotaValue', form) as number | undefined
  const currency = Form.useWatch('currency', form) as Currency | undefined
  const period = Form.useWatch('period', form) as QuotaPeriod | undefined
  const softThreshold = Form.useWatch('softThreshold', form) as number | undefined
  const overLimitAction = Form.useWatch('overLimitAction', form) as OverLimitAction | undefined

  const availableEmps = useMemo(() => employees.filter((emp) => {
    if (boundUsers.includes(emp.id)) return false
    if (!empSearchKw) return true
    const kw = empSearchKw.toLowerCase()
    return emp.name.toLowerCase().includes(kw) || emp.empId.toLowerCase().includes(kw) || (emp.department || '').toLowerCase().includes(kw)
  }), [employees, boundUsers, empSearchKw])

  const selectedEmpList = useMemo(() => employees.filter((emp) => boundUsers.includes(emp.id)), [employees, boundUsers])

  const valueUnit = useMemo(() => {
    if (!quotaType) return ''
    if (quotaType === 'cost') return currency === 'USD' ? 'USD' : 'CNY'
    return QUOTA_TYPE_UNIT[quotaType]
  }, [quotaType, currency])

  const fmtQuota = (val: number, qt: QuotaType, cur: Currency): string => {
    if (qt === 'cost') return `${CURRENCY_SYMBOL[cur]}${val.toLocaleString()}`
    return `${val.toLocaleString()} ${QUOTA_TYPE_UNIT[qt]}`.trim()
  }

  const modelOptions = useMemo(() => models.map((m) => ({ value: m.id, label: m.name })), [models])

  /* ── 保存 ── */
  const handleSave = async () => {
    const values = await form.validateFields()
    if (boundUsers.length === 0) { message.warning(t('aiQuotaAuth.bindEmpRequired')); return }
    if (values.overLimitAction === 'downgrade' && !values.downgradeModelId) { message.warning(t('aiQuotaAuth.downgradeWarning')); return }

    const now = nowText()
    const matchedEmps = employees.filter((e) => boundUsers.includes(e.id))
    const base = {
      roleName: String(values.roleName).trim(),
      description: (values.description ?? '') as string,
      userIds: boundUsers,
      userNames: matchedEmps.map((e) => e.name),
      totalEmployeeCount: matchedEmps.length,
      period: values.period as QuotaPeriod,
      quotaType: values.quotaType as QuotaType,
      quotaValue: Number(values.quotaValue),
      currency: (values.currency ?? 'CNY') as Currency,
      softThreshold: (values.softThreshold ?? 80) as number,
      overLimitAction: values.overLimitAction as OverLimitAction,
      downgradeModelId: values.overLimitAction === 'downgrade' ? (values.downgradeModelId ?? null) : null,
      status: (values.status ?? 1) as number,
      updatedBy: 'admin', updatedAt: now,
    }

    setSaving(true)
    try {
      const payload: RoleQuotaRequest = {
        ...(isEdit && quotaId ? { id: Number(quotaId) } : {}),
        roleName: String(values.roleName).trim(),
        description: (values.description ?? '') as string,
        userIds: boundUsers,
        userNames: matchedEmps.map((e) => e.name),
        totalEmployeeCount: matchedEmps.length,
        period: values.period as string,
        quotaType: values.quotaType as string,
        quotaValue: Number(values.quotaValue),
        currency: (values.currency ?? 'CNY') as string,
        softThreshold: (values.softThreshold ?? 80) as number,
        overLimitAction: values.overLimitAction as string,
        downgradeModelId: values.overLimitAction === 'downgrade' ? (values.downgradeModelId ?? null) : null,
        status: (values.status ?? 1) as number,
      }
      await saveRoleQuota(payload)
      message.success(isEdit ? t('aiQuotaAuth.quotaUpdated') : t('aiQuotaAuth.quotaCreated'))
      navigate('/ai-emp-quota#role')
    } finally { setSaving(false) }
  }

  const handleBack = () => navigate('/ai-emp-quota#role')

  if (loading && !models.length && !isEdit) {
    return <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}><Spin size="large" /></div>
  }

  const quotaReadable = quotaValue && quotaType && period
    ? t('aiQuotaAuth.roleQuotaPerCapita', { quota: fmtQuota(quotaValue, quotaType, currency ?? 'CNY'), period: QUOTA_PERIOD_LABEL[period], count: boundUsers.length, total: fmtQuota(quotaValue * boundUsers.length, quotaType, currency ?? 'CNY') })
    : t('aiQuotaAuth.quotaIncomplete')

  return (
    <div className="content-area">
      {/* 頁面頭部 */}
      <div style={{ position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)', backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite' }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(232,114,12,0.25)', transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)' }}>{t('common.back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{isEdit ? t('aiQuotaAuth.editRoleQuota') : t('aiQuotaAuth.addRoleQuota')}</h2>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical" initialValues={{ period: 'monthly', quotaType: 'token', currency: 'CNY', softThreshold: 80, overLimitAction: 'reject', status: 1 }}>
        {/* ═══ 分区 1：基础信息 ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} /></div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('aiQuotaAuth.basicInfoSection')}</span>
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>{t('aiQuotaAuth.editableTag')}</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="roleName" label={t('aiQuotaAuth.roleNameCol')} rules={[{ required: true, message: t('aiQuotaAuth.roleNamePh') }]}>
              <Input placeholder={t('aiQuotaAuth.roleNameExample')} maxLength={50} allowClear disabled={isEdit} />
            </Form.Item>
            <Form.Item name="description" label={t('common.description')}>
              <Input placeholder={t('aiQuotaAuth.roleDescPh')} maxLength={200} allowClear />
            </Form.Item>
          </div>
        </div>

        {/* ═══ 分区 2：绑定员工（穿梭框） ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TeamOutlined style={{ fontSize: 14, color: '#1890ff' }} /></div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('aiQuotaAuth.bindEmpLabel')}</span>
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>{t('aiQuotaAuth.transferTag')}</Tag>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('aiQuotaAuth.bindEmpHint')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            {/* 左側：可選員工 */}
            <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 8, display: 'flex', flexDirection: 'column', height: 360 }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', background: '#fafafa', borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{t('aiQuotaAuth.availableEmpTitle', { count: availableEmps.length })}</span>
                <a onClick={() => { const unchecked = availableEmps.map((e) => e.id).filter((id) => !boundUsers.includes(id)); setCheckedEmpIds(unchecked) }} style={{ fontSize: 12 }}>{t('aiQuotaAuth.selectAll')}</a>
              </div>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}><Input placeholder={t('aiQuotaAuth.empSearchPh')} allowClear size="small" value={empSearchKw} onChange={(e) => setEmpSearchKw(e.target.value)} /></div>
              <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
                {availableEmps.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#BFBFBF', padding: '40px 0', fontSize: 13 }}>{t('aiQuotaAuth.noAvailableEmp')}</div>
                ) : availableEmps.map((emp) => {
                  const checked = checkedEmpIds.includes(emp.id)
                  return (
                    <div key={emp.id} onClick={() => { setCheckedEmpIds((prev) => checked ? prev.filter((id) => id !== emp.id) : [...prev, emp.id]) }}
                      style={{ padding: '6px 8px', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, background: checked ? '#FFF7E6' : 'transparent', border: `1px solid ${checked ? '#FFE7BA' : 'transparent'}`, marginBottom: 2, transition: 'all 0.15s' }}>
                      <div style={{ width: 16, height: 16, borderRadius: 3, border: `1px solid ${checked ? '#E8720C' : '#d9d9d9'}`, background: checked ? '#E8720C' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', flexShrink: 0 }}>
                        {checked && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 13, color: '#262626' }}>{emp.name}（{emp.empId}）{emp.department && <span style={{ fontSize: 11, color: '#8C8C8C', marginLeft: 4 }}>— {emp.department}</span>}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            {/* 中间：操作按鈕 */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
              <Button type="primary" size="small" icon={<span style={{ fontSize: 16 }}>›</span>}
                onClick={() => { const newIds = checkedEmpIds.filter((id) => !boundUsers.includes(id)); if (!newIds.length) { message.warning(t('aiQuotaAuth.selectEmpFirst')); setCheckedEmpIds([]); return }; setBoundUsers((prev) => [...prev, ...newIds]); setCheckedEmpIds([]) }}
                disabled={checkedEmpIds.length === 0} style={{ backgroundColor: '#E8720C', borderColor: '#E8720C' }} />
              <Button size="small" icon={<span style={{ fontSize: 16 }}>‹</span>} onClick={() => { setBoundUsers([]); setCheckedEmpIds([]) }} disabled={boundUsers.length === 0} />
            </div>
            {/* 右側：已選員工 */}
            <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 8, display: 'flex', flexDirection: 'column', height: 360 }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', background: '#fafafa', borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{t('aiQuotaAuth.selectedEmpTitle', { count: boundUsers.length })}</span>
                <a onClick={() => { setBoundUsers([]); setCheckedEmpIds([]) }} style={{ fontSize: 12 }}>{t('aiQuotaAuth.clearAll')}</a>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                {selectedEmpList.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#BFBFBF', padding: '40px 0', fontSize: 13 }}>{t('aiQuotaAuth.selectEmpFromLeft')}</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selectedEmpList.map((emp) => (
                      <Tag key={emp.id} closable onClose={() => setBoundUsers((prev) => prev.filter((id) => id !== emp.id))} style={{ fontSize: 12, margin: 0 }}>
                        {emp.name}（{emp.empId}）{emp.department && ` — ${emp.department}`}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ padding: '8px 16px', borderTop: '1px solid #f0f0f0', background: '#fafafa', borderRadius: '0 0 8px 8px', fontSize: 12, color: '#595959' }}>
                {t('aiQuotaAuth.totalBoundEmp', { count: <strong>{boundUsers.length}</strong> })}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ 分区 3：额度配置 ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FundOutlined style={{ fontSize: 14, color: '#E8720C' }} /></div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('aiQuotaAuth.quotaConfigSection')}</span>
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>{t('aiQuotaAuth.coreTag')}</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="period" label={t('aiQuotaAuth.periodLabel')} rules={[{ required: true }]}><Radio.Group optionType="button" buttonStyle="solid" options={Object.entries(QUOTA_PERIOD_LABEL).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item name="quotaType" label={t('aiQuotaAuth.quotaTypeLabel')} rules={[{ required: true }]}><Select options={Object.entries(QUOTA_TYPE_LABEL).map(([value, label]) => ({ value, label }))} /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="quotaValue" label={t('aiQuotaAuth.quotaValueLabel')} rules={[{ required: true, message: t('aiQuotaAuth.quotaValueRequired') }]}>
              <InputNumber<number> min={1} style={{ width: '100%' }} addonAfter={valueUnit} formatter={(v) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(v) => Number(`${v ?? ''}`.replace(/,/g, ''))} />
            </Form.Item>
            <Form.Item name="softThreshold" label={<span>{t('aiQuotaAuth.softThresholdLabel')} <span style={{ color: '#8C8C8C', fontWeight: 400, fontSize: 12 }}>{t('aiQuotaAuth.softThresholdHint')}</span></span>}>
              <Slider min={10} max={100} step={5} marks={{ 50: '50%', 80: '80%', 100: '100%' }} tooltip={{ formatter: (v) => `${v}%` }} />
            </Form.Item>
          </div>
          {quotaType === 'cost' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
              <Form.Item name="currency" label={t('aiQuotaAuth.currencyLabel')} rules={[{ required: true }]}><Select options={CURRENCY_OPTIONS} /></Form.Item>
            </div>
          )}
          <Form.Item name="overLimitAction" label={t('aiQuotaAuth.overLimitActionLabel')} rules={[{ required: true }]}>
            <Radio.Group>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {(['reject', 'approve', 'downgrade'] as OverLimitAction[]).map((act) => {
                  const active = overLimitAction === act
                  return (
                    <label key={act} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', padding: '12px 14px', borderRadius: 8, border: `1px solid ${active ? '#E8720C' : '#e8eaed'}`, background: active ? '#FFF7E6' : '#fff', transition: 'all 0.2s' }}>
                      <Radio value={act} style={{ marginTop: 2 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#262626' }}>{OVER_LIMIT_ACTION_LABEL[act]}</div>
                        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>{act === 'reject' ? t('aiQuotaAuth.overLimitRejectShort') : act === 'approve' ? t('aiQuotaAuth.overLimitApproveShort') : t('aiQuotaAuth.overLimitDowngradeShort')}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </Radio.Group>
          </Form.Item>
          {overLimitAction === 'downgrade' && (
            <Form.Item name="downgradeModelId" label={t('aiQuotaAuth.downgradeTargetModel')} rules={[{ required: true, message: t('aiQuotaAuth.selectDowngradeModel') }]}><Select showSearch optionFilterProp="label" placeholder={t('aiQuotaAuth.downgradeModelPh')} options={modelOptions} /></Form.Item>
          )}
          {/* 實時額度解讀 */}
          <div style={{ marginTop: 4, padding: '14px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #FFF7E6, #FFFBF0)', border: '1px solid #FFE7BA' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#E8720C', marginBottom: 8 }}>{t('aiQuotaAuth.quotaInterpretation')}</div>
            <div style={{ fontSize: 13, color: '#595959', lineHeight: 1.9 }}>
              <div>{t('aiQuotaAuth.roleLabel')}<strong style={{ color: '#262626' }}>{form.getFieldValue('roleName') || t('aiQuotaAuth.noRoleName')}</strong>（{t('aiQuotaAuth.personCount', { count: boundUsers.length })}）</div>
              <div>· {t('aiQuotaAuth.quotaValueLabel')}：{quotaReadable}</div>
              <div>· {t('aiQuotaAuth.alertUsageReach')} <strong style={{ color: '#FAAD14' }}>{softThreshold ?? 80}%</strong>{t('aiQuotaAuth.notifyNoBlock')}</div>
              <div>· {t('aiQuotaAuth.overLimitLabel')}<strong style={{ color: '#FF4D4F' }}>{OVER_LIMIT_ACTION_LABEL[overLimitAction ?? 'reject']}</strong></div>
            </div>
          </div>
        </div>

        {/* ═══ 分区 4：状态配置 ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PoweroffOutlined style={{ fontSize: 14, color: '#E8720C' }} /></div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('aiQuotaAuth.statusConfigSection')}</span>
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>{t('aiQuotaAuth.editableTag')}</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ background: '#FFF7E6', padding: 16, borderRadius: 8, border: '1px solid #FFE7BA' }}>
            <Form.Item name="status" label={t('aiQuotaAuth.enableStatusLabel')} valuePropName="checked" getValueFromEvent={(checked) => checked ? 1 : 0} getValueProps={(value) => ({ checked: value === 1 })} style={{ marginBottom: 0 }} extra={t('aiQuotaAuth.disableStatusExtra')}>
              <Switch checkedChildren={t('aiQuotaAuth.enableText')} unCheckedChildren={t('aiQuotaAuth.disableText')} />
            </Form.Item>
          </div>
        </div>
      </Form>

      <div className="form-footer">
        <Button onClick={handleBack}>{t('common.cancel')}</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>{t('common.save')}</Button>
      </div>
    </div>
  )
}
