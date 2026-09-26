import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons'
import { Button, Card, DatePicker, Form, Input, Modal, Select, message } from 'antd'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import {
  fetchLeaveDetail, fetchLeaveEmployeeOptions, fetchLeaveQuota, saveAndSubmitLeave, saveLeaveDraft,
  updateLeaveRequest, type LeaveEmployeeOption, type LeaveQuotaInfo,
} from '../../../api/hrLeave'
import {
  HR_LEAVE_SCOPE, LEAVE_TYPE_LABEL_KEY, LEAVE_TYPE_ORDER, leaveDetailPath, type LeaveScope,
} from './meta'

interface FormValues {
  userId?: number
  leaveType?: string
  range?: [Dayjs, Dayjs]
  reason?: string
}

/** 请假申请表单页（新增/编辑草稿；提交走 OA 审批 + 二次确认）。人事端与自助端共用 */
export default function LeaveForm({ scope = HR_LEAVE_SCOPE }: { scope?: LeaveScope } = {}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission(`${scope.permKey}:edit`)
  const editId = Number(searchParams.get('id')) || undefined

  const [form] = Form.useForm<FormValues>()
  const [options, setOptions] = useState<LeaveEmployeeOption[]>([])
  const [searching, setSearching] = useState(false)
  const [quota, setQuota] = useState<LeaveQuotaInfo | null>(null)
  /** 无人事授权时后端只返回本人，选人框自动选中并锁定 */
  const [selfOnly, setSelfOnly] = useState(false)
  const [readonly, setReadonly] = useState(false)
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const searchEmp = useCallback((kw: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSearching(true)
      try {
        setOptions(await fetchLeaveEmployeeOptions(kw))
      } catch {
        setOptions([])
      } finally {
        setSearching(false)
      }
    }, 300)
  }, [])

  /**
   * 自助请假场景（非人事角色）后端只会返回本人一个候选，直接选中并锁住选人框，
   * 避免员工在只有一项的下拉里还要手点一次。
   */
  useEffect(() => {
    if (editId != null) return
    fetchLeaveEmployeeOptions('')
      .then(list => {
        setOptions(list || [])
        // 后端按数据范围只回本人时才锁定选人；搜索结果恰好 1 人不在此列
        if (list?.length === 1) {
          setSelfOnly(true)
          form.setFieldValue('userId', list[0].userId)
        }
      })
      .catch(() => undefined)
  }, [editId, form])

  /** 编辑回填 */
  useEffect(() => {
    if (editId == null) return
    fetchLeaveDetail(editId)
      .then(item => {
        if (item.status === 'pending' || item.status === 'approved' || item.status === 'completed') {
          setReadonly(true)
        }
        form.setFieldsValue({
          userId: item.userId,
          leaveType: item.leaveType,
          range: [dayjs(item.startDate), dayjs(item.endDate)],
          reason: item.reason ?? undefined,
        })
      })
      .catch(() => undefined)
  }, [editId, form])

  /** 剩余额度提示：按所选员工 + 假别 + 年度精确查后端（额度行数会超过任何分页尺寸） */
  const userId = Form.useWatch('userId', form)
  const leaveType = Form.useWatch('leaveType', form)
  const range = Form.useWatch('range', form)
  /** 年度口径与后端一致：按开始日期所属年度 */
  const quotaYear = range?.[0]?.year() ?? dayjs().year()
  const days = useMemo(() => {
    const [s, e] = range ?? []
    return s && e ? e.diff(s, 'day') + 1 : 0
  }, [range])

  useEffect(() => {
    if (!userId || !leaveType) { setQuota(null); return }
    fetchLeaveQuota({ userId, leaveType, year: quotaYear })
      .then(setQuota)
      .catch(() => setQuota(null))
  }, [userId, leaveType, quotaYear])

  /** 本次申请天数是否超过剩余额度（草稿允许，但需即时警示） */
  const overQuota = !!quota && quota.granted && days > 0 && days > (quota.remainingDays ?? 0)

  const buildValues = (values: FormValues) => ({
    userId: values.userId as number,
    leaveType: values.leaveType as string,
    startDate: values.range?.[0]?.format('YYYY-MM-DD') as string,
    endDate: values.range?.[1]?.format('YYYY-MM-DD') as string,
    reason: values.reason?.trim(),
  })

  const handleSaveDraft = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const payload = buildValues(values)
      const saved = editId == null ? await saveLeaveDraft(payload) : await updateLeaveRequest(editId, payload)
      message.success(t('hrLeave.saved'))
      navigate(leaveDetailPath(scope, saved.id), { replace: true })
    } catch {
      // 请求层已提示
    } finally {
      setSaving(false)
    }
  }

  /** 提交申请：校验 → 二次确认 → 保存并提交 OA 审批 */
  const handleSubmit = async () => {
    const values = await form.validateFields()
    Modal.confirm({
      title: t('hrLeave.confirmSubmitTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hrLeave.employee')}：</span><b>{options.find(o => o.userId === values.userId)?.name ?? '-'}</b></div>
          <div className="confirm-info-row"><span>{t('hrLeave.leaveType')}：</span><b>{values.leaveType ? t(LEAVE_TYPE_LABEL_KEY[values.leaveType]) : '-'}</b></div>
          <div className="confirm-info-row"><span>{t('hrLeave.period')}：</span><b>{values.range?.[0]?.format('YYYY-MM-DD')} ~ {values.range?.[1]?.format('YYYY-MM-DD')}</b></div>
          <div className="confirm-info-row"><span>{t('hrLeave.days')}：</span><b>{days} {t('hrLeave.dayUnit')}</b></div>
          {quota?.granted && (
            <div className="confirm-info-row"><span>{t('hrLeave.remaining')}：</span><b>{quota.remainingDays}</b></div>
          )}
        </div>
      ),
      okText: t('hrLeave.confirmSubmit'), cancelText: t('common.cancel'),
      onOk: async () => {
        const result = await saveAndSubmitLeave(editId, buildValues(values))
        message.success(t('hrLeave.submitted', { flowNo: result.flowNo }))
        navigate(leaveDetailPath(scope, result.id), { replace: true })
      },
    })
  }

  const headerStyle: CSSProperties = {
    position: 'relative', background: '#fff', marginBottom: 16,
    borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
  }

  return (
    <div className="content-area">
      <div style={headerStyle}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB65D, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(scope.basePath)}>{t('common.back')}</Button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{t('hrLeave.formTitle')}</div>
            {readonly && <div style={{ fontSize: 12, color: '#FF4D4F' }}>{t('hrLeave.readonlyTip')}</div>}
          </div>
        </div>
      </div>

      <Card size="small" style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <Form form={form} layout="vertical" disabled={readonly}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 16px' }}>
            <Form.Item name="userId" label={t('hrLeave.employee')}
              rules={[{ required: true, message: t('hrLeave.employeeRequired') }]}>
              <Select showSearch filterOption={false} allowClear placeholder={t('hrLeave.employeePlaceholder')}
                disabled={readonly || editId != null || selfOnly}
                onSearch={searchEmp} onFocus={() => searchEmp('')} loading={searching}
                notFoundContent={searching ? undefined : t('common.noData')}
                options={options.map(o => ({
                  value: o.userId,
                  label: `${o.name}(${o.empId})${o.department ? ` · ${o.department}` : ''}`,
                }))} />
            </Form.Item>
            <Form.Item name="leaveType" label={t('hrLeave.leaveType')}
              rules={[{ required: true, message: t('hrLeave.leaveTypeRequired') }]}
              /* 额度未回前不给任何提示：旧写法在请求期间会闪「尚未設置額度」，误导用户 */
              extra={quota
                ? (quota.granted
                    ? t('hrLeave.remainingTip', { days: quota.remainingDays ?? 0 })
                    : t('hrLeave.noQuotaTip'))
                : undefined}>
              <Select placeholder={t('common.pleaseSelect')}
                options={LEAVE_TYPE_ORDER.map(code => ({ value: code, label: t(LEAVE_TYPE_LABEL_KEY[code]) }))} />
            </Form.Item>
          </div>
          <Form.Item name="range" label={t('hrLeave.period')}
            rules={[{ required: true, message: t('hrLeave.periodRequired') }]}
            extra={days > 0 && (
              <span style={{ color: overQuota ? '#FF4D4F' : '#8C8C8C', fontSize: 12 }}>
                {t('hrLeave.daysComputed', { days })}
                {overQuota && ` · ${t('hrLeave.overQuotaTip', { remaining: quota?.remainingDays ?? 0 })}`}
              </span>
            )}>
            <DatePicker.RangePicker style={{ width: 380 }} />
          </Form.Item>
          <Form.Item name="reason" label={t('hrLeave.reason')}
            rules={[{ required: true, message: t('hrLeave.reasonRequired') }]}>
            <Input.TextArea rows={2} maxLength={500} showCount placeholder={t('hrLeave.reasonPlaceholder')} />
          </Form.Item>
        </Form>
      </Card>

      {!readonly && canEdit && (
        <div className="form-footer">
          <Button onClick={() => navigate(editId != null ? leaveDetailPath(scope, editId) : scope.basePath)}>
            {t('common.cancel')}
          </Button>
          <Button icon={<SaveOutlined />} loading={saving} onClick={handleSaveDraft}>{t('hrLeave.saveDraft')}</Button>
          <Button type="primary" icon={<SendOutlined />} loading={saving} onClick={handleSubmit}>
            {t('hrLeave.submitApproval')}
          </Button>
        </div>
      )}
    </div>
  )
}
