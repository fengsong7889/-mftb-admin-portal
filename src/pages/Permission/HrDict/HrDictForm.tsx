import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, InputNumber, Select, Switch, message } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import {
  fetchHrDict, createHrDict, updateHrDict,
  HR_DICT_TYPE, type HrDictItem, type HrDictPayload,
} from '../../../api/hrDict'

/** 表单类型仅接受已登记的字典编码。 */
const DICT_TYPES = Object.values(HR_DICT_TYPE)

/** 表单值 */
interface FormValues {
  code: string
  name: string
  nameEn?: string
  parentCode?: string
  sortOrder?: number
  status: boolean
  remark?: string
}

export default function HrDictForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('hr-dict:edit')
  const [searchParams] = useSearchParams()
  const type = DICT_TYPES.find(value => value === searchParams.get('type')) ?? HR_DICT_TYPE.EMPLOYER_COMPANY
  const idParam = searchParams.get('id')
  const editId = idParam ? Number(idParam) : undefined
  const isEdit = editId != null && !Number.isNaN(editId)
  const isLocation = type === HR_DICT_TYPE.WORK_LOCATION

  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [countries, setCountries] = useState<HrDictItem[]>([])

  const typeLabel = t(`hrDict.types.${type}`)

  /** 工作地点：加载国家/顶级节点作为“上级”候选（排除自身） */
  useEffect(() => {
    if (!isLocation) return
    fetchHrDict(HR_DICT_TYPE.WORK_LOCATION).then(list => {
      setCountries(list.filter(d => !d.parentCode && d.id !== editId))
    }).catch(() => { /* 请求层已提示 */ })
  }, [isLocation, editId])

  /** 编辑模式回显 */
  useEffect(() => {
    if (!isEdit) {
      form.setFieldsValue({ status: true, sortOrder: 0 })
      return
    }
    let alive = true
    fetchHrDict(type).then(list => {
      if (!alive) return
      const item = list.find(d => d.id === editId)
      if (item) {
        form.setFieldsValue({
          code: item.code,
          name: item.name,
          nameEn: item.nameEn ?? undefined,
          parentCode: item.parentCode ?? undefined,
          sortOrder: item.sortOrder ?? 0,
          status: item.status === 1,
          remark: item.remark ?? undefined,
        })
      }
    }).catch(() => { /* 请求层已提示 */ })
    return () => { alive = false }
  }, [isEdit, type, editId, form])

  const countryOptions = useMemo(
    () => countries.map(c => ({ value: c.code, label: i18n.language.startsWith('zh') ? c.name : (c.nameEn || c.name) })),
    [countries, i18n.language],
  )

  const handleBack = () => navigate(`/hr-dict?type=${type}`)

  const handleSubmit = async () => {
    // 前端仅控制交互，写入权限仍由后端校验。
    if (!canEdit || submitting) return
    try {
      const values = await form.validateFields()
      const payload: HrDictPayload = {
        dictType: type,
        code: values.code.trim(),
        name: values.name.trim(),
        nameEn: values.nameEn?.trim() || undefined,
        parentCode: isLocation ? (values.parentCode || null) : null,
        sortOrder: values.sortOrder ?? 0,
        status: values.status ? 1 : 0,
        remark: values.remark?.trim() || undefined,
      }
      setSubmitting(true)
      if (isEdit && editId != null) {
        await updateHrDict(editId, {
          name: payload.name, nameEn: payload.nameEn, parentCode: payload.parentCode,
          sortOrder: payload.sortOrder, status: payload.status, remark: payload.remark,
        })
        message.success(t('common.saveSuccess'))
      } else {
        await createHrDict(payload)
        message.success(t('common.addSuccess'))
      }
      // 仅保存成功关闭当前表单标签；失败或普通返回时保留，其他标签不受影响。
      navigate(`/hr-dict?type=${type}`, {
        replace: true,
        state: { closeMenuTab: location.pathname + location.search },
      })
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="content-area">
      {/* 页面头部（全局统一风格） */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              }}>{t('common.back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {t(isEdit ? 'hrDict.editTitle' : 'hrDict.addTitle', { type: typeLabel })}
            </h2>
          </div>
        </div>
      </div>

      {/* 模块卡片 */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <span style={{ width: 3, height: 14, borderRadius: 2, background: '#E8720C' }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('hrDict.sectionTitle', { type: typeLabel })}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <Form form={form} layout="vertical" autoComplete="off" disabled={!canEdit || submitting}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 16px' }}>
            <Form.Item name="code" label={t('hrDict.code')}
              rules={[{ required: true, whitespace: true, message: t('hrDict.codeRequired') }]}
              extra={t(isEdit ? 'hrDict.codeImmutable' : 'hrDict.codeHint')}>
              <Input placeholder={t('hrDict.codePlaceholder')} allowClear maxLength={64} disabled={isEdit || !canEdit || submitting} />
            </Form.Item>
            <Form.Item name="name" label={t('common.colName')} rules={[{ required: true, whitespace: true, message: t('hrDict.nameRequired') }]}>
              <Input placeholder={t('hrDict.namePlaceholder')} allowClear maxLength={128} />
            </Form.Item>
            <Form.Item name="nameEn" label={t('hrDict.nameEn')}>
              <Input placeholder={t('hrDict.optional')} allowClear maxLength={128} />
            </Form.Item>
            {isLocation && (
              <Form.Item name="parentCode" label={t('hrDict.country')} extra={t('hrDict.countryHint')}>
                <Select placeholder={t('hrDict.countryPlaceholder')} allowClear options={countryOptions} />
              </Form.Item>
            )}
            <Form.Item name="sortOrder" label={t('hrDict.sort')} extra={t('hrDict.sortHint')}>
              <InputNumber min={0} max={9999} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="status" label={t('common.colStatus')} valuePropName="checked">
              <Switch checkedChildren={t('hrDict.enabled')} unCheckedChildren={t('hrDict.disabled')} />
            </Form.Item>
          </div>
          <Form.Item name="remark" label={t('common.colRemark')}>
            <Input.TextArea rows={2} placeholder={t('hrDict.optional')} maxLength={255} />
          </Form.Item>
        </Form>
      </div>

      {/* 底部操作按钮 */}
      <div className="form-footer">
        <Button onClick={handleBack}>{t('common.cancel')}</Button>
        {canEdit && <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>{t('common.save')}</Button>}
      </div>
    </div>
  )
}
