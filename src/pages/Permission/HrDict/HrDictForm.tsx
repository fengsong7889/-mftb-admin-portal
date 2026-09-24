import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, InputNumber, Select, Switch, message } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchHrDict, createHrDict, updateHrDict,
  HR_DICT_TYPE, type HrDictItem, type HrDictType, type HrDictPayload,
} from '../../../api/hrDict'

/** 类型显示名 */
const TYPE_LABEL: Record<string, string> = {
  [HR_DICT_TYPE.EMPLOYER_COMPANY]: '僱主法人',
  [HR_DICT_TYPE.WORK_LOCATION]: '工作地点',
  [HR_DICT_TYPE.EMPLOYEE_CATEGORY]: '人員類別',
  [HR_DICT_TYPE.CONTRACT_TYPE]: '合同类型',
  [HR_DICT_TYPE.WORK_SYSTEM]: '工时制',
}

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
  const [searchParams] = useSearchParams()
  const type = (searchParams.get('type') || HR_DICT_TYPE.EMPLOYER_COMPANY) as HrDictType
  const idParam = searchParams.get('id')
  const editId = idParam ? Number(idParam) : undefined
  const isEdit = editId != null && !Number.isNaN(editId)
  const isLocation = type === HR_DICT_TYPE.WORK_LOCATION

  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [countries, setCountries] = useState<HrDictItem[]>([])

  const typeLabel = TYPE_LABEL[type] ?? '字典項'

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
    () => countries.map(c => ({ value: c.code, label: c.name })),
    [countries],
  )

  const handleBack = () => navigate('/hr-dict')

  const handleSubmit = async () => {
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
    try {
      if (isEdit && editId != null) {
        await updateHrDict(editId, {
          name: payload.name, nameEn: payload.nameEn, parentCode: payload.parentCode,
          sortOrder: payload.sortOrder, status: payload.status, remark: payload.remark,
        })
        message.success('保存成功')
      } else {
        await createHrDict(payload)
        message.success('新增成功')
      }
      navigate('/hr-dict')
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
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEdit ? `編輯${typeLabel}` : `新增${typeLabel}`}
            </h2>
          </div>
        </div>
      </div>

      {/* 模块卡片 */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <span style={{ width: 3, height: 14, borderRadius: 2, background: '#E8720C' }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{typeLabel}信息</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <Form form={form} layout="vertical" autoComplete="off">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 16px' }}>
            <Form.Item name="code" label="編碼"
              rules={[{ required: true, message: '請輸入編碼' }]}
              extra={isEdit ? '編碼為身份標識，創建後不可修改' : '同一類型內唯一，建議大寫字母/連字符'}>
              <Input placeholder="如 SF-TECH / CN-SHENZHEN" allowClear maxLength={64} disabled={isEdit} />
            </Form.Item>
            <Form.Item name="name" label="名稱" rules={[{ required: true, message: '請輸入名稱' }]}>
              <Input placeholder="中文名稱" allowClear maxLength={128} />
            </Form.Item>
            <Form.Item name="nameEn" label="英文名稱">
              <Input placeholder="選填" allowClear maxLength={128} />
            </Form.Item>
            {isLocation && (
              <Form.Item name="parentCode" label="所屬國家/地區" extra="留空表示該項本身為國家/頂級">
                <Select placeholder="選擇國家/地區（可留空）" allowClear options={countryOptions} />
              </Form.Item>
            )}
            <Form.Item name="sortOrder" label="排序" extra="數值越小越靠前">
              <InputNumber min={0} max={9999} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="status" label="狀態" valuePropName="checked">
              <Switch checkedChildren="啟用" unCheckedChildren="停用" />
            </Form.Item>
          </div>
          <Form.Item name="remark" label="備註">
            <Input.TextArea rows={2} placeholder="選填" maxLength={255} />
          </Form.Item>
        </Form>
      </div>

      {/* 底部操作按钮 */}
      <div className="form-footer">
        <Button onClick={handleBack}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>保存</Button>
      </div>
    </div>
  )
}
