import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, InputNumber, Select, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchLeaveBalances, fetchLeaveEmployeeOptions, saveLeaveBalance,
  type LeaveEmployeeOption,
} from '../../../api/hrLeave'
import { LEAVE_TYPE_LABEL_KEY, LEAVE_TYPE_ORDER } from './meta'

interface FormValues {
  userId?: number
  year?: number
  leaveType?: string
  totalDays?: number
  carriedDays?: number
  remark?: string
}

/** 假期额度设置表单页（新增/编辑；已用天数由审批回调维护，此处只读展示） */
export default function LeaveQuotaForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()

  const quotaId = Number(searchParams.get('id')) || undefined
  const presetUserId = Number(searchParams.get('userId')) || undefined
  const presetType = searchParams.get('leaveType') || undefined
  const presetYear = Number(searchParams.get('year')) || undefined
  const isEdit = quotaId != null

  const [form] = Form.useForm<FormValues>()
  const [options, setOptions] = useState<LeaveEmployeeOption[]>([])
  const [usedDays, setUsedDays] = useState<number>(0)
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const searchEmp = useCallback((kw: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        setOptions(await fetchLeaveEmployeeOptions(kw))
      } catch {
        setOptions([])
      }
    }, 300)
  }, [])

  /** 编辑：从台账取回该行（同时带出已用天数与员工下拉回显） */
  useEffect(() => {
    if (!isEdit || presetUserId == null) return
    fetchLeaveBalances({ page: 1, size: 100, year: presetYear })
      .then(res => {
        const hit = (res.records || []).find(r => r.id === quotaId)
        if (!hit) return
        setUsedDays(hit.usedDays)
        if (hit.empName) {
          setOptions(prev => (prev.some(o => o.userId === hit.userId)
            ? prev
            : [...prev, { userId: hit.userId, empId: hit.empNo ?? '', name: hit.empName ?? '', department: hit.department }]))
        }
        form.setFieldsValue({
          userId: hit.userId, year: hit.year, leaveType: hit.leaveType,
          totalDays: hit.totalDays, carriedDays: hit.carriedDays, remark: hit.remark ?? undefined,
        })
      })
      .catch(() => undefined)
  }, [isEdit, quotaId, presetUserId, presetYear, form])

  useEffect(() => {
    if (isEdit) return
    form.setFieldsValue({ year: presetYear ?? new Date().getFullYear(), leaveType: presetType ?? undefined })
    if (presetUserId) {
      form.setFieldValue('userId', presetUserId)
      searchEmp('')
    }
  }, [isEdit, presetUserId, presetType, presetYear, form, searchEmp])

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await saveLeaveBalance({
        id: quotaId, userId: values.userId as number, year: values.year as number,
        leaveType: values.leaveType as string, totalDays: values.totalDays ?? 0,
        carriedDays: values.carriedDays ?? 0, remark: values.remark,
      })
      message.success(t('hrLeave.saved'))
      navigate('/hr-leave-quota', { replace: true })
    } catch {
      // 请求层已提示
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content-area">
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB65D, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/hr-leave-quota')}>{t('common.back')}</Button>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{t(isEdit ? 'hrLeave.editQuotaTitle' : 'hrLeave.addQuotaTitle')}</div>
        </div>
      </div>

      <Card size="small" style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 16px' }}>
            <Form.Item name="userId" label={t('hrLeave.employee')}
              rules={[{ required: true, message: t('hrLeave.employeeRequired') }]}>
              <Select showSearch filterOption={false} allowClear placeholder={t('hrLeave.employeePlaceholder')}
                disabled={isEdit} onSearch={searchEmp} onFocus={() => searchEmp('')}
                options={options.map(o => ({
                  value: o.userId,
                  label: `${o.name}(${o.empId})${o.department ? ` · ${o.department}` : ''}`,
                }))} />
            </Form.Item>
            <Form.Item name="leaveType" label={t('hrLeave.leaveType')}
              rules={[{ required: true, message: t('hrLeave.leaveTypeRequired') }]}>
              <Select placeholder={t('common.pleaseSelect')} disabled={isEdit}
                options={LEAVE_TYPE_ORDER.map(c => ({ value: c, label: t(LEAVE_TYPE_LABEL_KEY[c]) }))} />
            </Form.Item>
            <Form.Item name="year" label={t('hrLeave.year')} rules={[{ required: true, message: t('hrLeave.yearRequired') }]}>
              <InputNumber min={2000} max={2100} style={{ width: '100%' }} disabled={isEdit} />
            </Form.Item>
            <Form.Item name="totalDays" label={t('hrLeave.totalDays')} rules={[{ required: true, message: t('hrLeave.totalDaysRequired') }]}>
              <InputNumber min={0} max={365} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="carriedDays" label={t('hrLeave.carriedDays')} extra={t('hrLeave.carriedDaysHint')}>
              <InputNumber min={0} max={365} step={0.5} style={{ width: '100%' }} />
            </Form.Item>
            {isEdit && (
              <Form.Item label={t('hrLeave.usedDays')}>
                <Input value={`${usedDays}`} disabled />
              </Form.Item>
            )}
          </div>
          <Form.Item name="remark" label={t('hrLeave.quotaRemark')}>
            <Input.TextArea rows={2} maxLength={255} placeholder={t('hrLeave.optional')} />
          </Form.Item>
        </Form>
      </Card>

      <div className="form-footer">
        <Button onClick={() => navigate('/hr-leave-quota')}>{t('common.cancel')}</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>{t('common.save')}</Button>
      </div>
    </div>
  )
}
