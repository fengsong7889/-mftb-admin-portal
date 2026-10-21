/**
 * 迭代新增/编辑 —— 独立表单页
 *
 * 产能（工时）是排期对账的分母：填 0 就等于放弃超载预警，因此页面把「产能」
 * 与「已排工时」并列展示，编辑态实时提示负载率。
 */
import { useEffect, useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select, message } from 'antd'
import { CalendarOutlined, SaveOutlined, TeamOutlined } from '@ant-design/icons'
import EmployeeSelect from '../MeetingManagement/EmployeeSelect'
import RdmFormHeader from './components/RdmFormHeader'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { countWorkdays, HOURS_PER_WORKDAY, workdayHours } from './workdays'
import {
  fetchIterations,
  fetchProjectPage,
  saveIteration,
  type RdmIterationForm as RdmIterationPayload,
  type RdmIterationItem,
  type RdmProjectListItem,
} from '../../api/rdm'
import {
  RDM_ITERATION_STATUS,
  RDM_ITERATION_STATUS_LABEL,
  RDM_ITERATION_TYPE,
  RDM_ITERATION_TYPE_LABEL,
  RDM_PROJECT_STATUS,
  type RdmIterationStatus,
  type RdmIterationType,
} from '../../constants/rdm'
import './index.css'

const { TextArea } = Input

/** 表单内部结构（日期用组件类型，提交时转字符串；编码系统发号，不在表单内） */
interface FormValues {
  name: string
  /** 所属项目：sprint/version 必选，hotfix 可空（服务端同口径二次校验） */
  projectId?: number
  iterationType: RdmIterationType
  range?: [dayjs.Dayjs, dayjs.Dayjs]
  capacityHours?: number
  owner?: number[]
  status: RdmIterationStatus
  remark?: string
}

/** 可挂迭代的项目状态：已关闭/全部交付的项目不再承接新迭代 */
const USABLE_PROJECT_STATUS: string[] = [
  RDM_PROJECT_STATUS.PREPARING,
  RDM_PROJECT_STATUS.IN_PROGRESS,
  RDM_PROJECT_STATUS.PARTIAL_DELIVERED,
]

export default function IterationForm() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const iterationId = Number(searchParams.get('id') ?? 0)

  const [form] = Form.useForm<FormValues>()
  const [iterations, setIterations] = useState<RdmIterationItem[]>([])
  /** 可挂项目候选（与提需求/排期同一口径：排除已关闭与全部交付） */
  const [projectOptions, setProjectOptions] = useState<RdmProjectListItem[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchProjectPage({ pageNo: 1, pageSize: 200 })
      .then(res => setProjectOptions((res.records ?? []).filter(p => USABLE_PROJECT_STATUS.includes(p.status))))
      .catch(() => setProjectOptions([]))
  }, [])

  useEffect(() => {
    fetchIterations().then(list => {
      setIterations(list)
      const current = list.find(i => i.id === iterationId)
      if (!current) return
      form.setFieldsValue({
        name: current.name,
        projectId: current.projectId ?? undefined,
        iterationType: (current.iterationType ?? RDM_ITERATION_TYPE.SPRINT) as RdmIterationType,
        range: current.startDate && current.endDate ? [dayjs(current.startDate), dayjs(current.endDate)] : undefined,
        capacityHours: current.capacityHours ?? 0,
        owner: current.ownerUserId ? [current.ownerUserId] : undefined,
        status: (current.status ?? RDM_ITERATION_STATUS.PLANNING) as RdmIterationStatus,
        remark: current.remark ?? undefined,
      })
    }).catch(() => message.error('迭代資訊載入失敗'))
  }, [iterationId, form])

  /** 编辑态当前迭代（负载率提示与编码展示用） */
  const currentIteration = iterations.find(i => i.id === iterationId)
  const scheduledHours = currentIteration?.taskHours ?? 0
  const capacity = Form.useWatch('capacityHours', form)
  const loadRate = capacity && capacity > 0 ? Math.round((scheduledHours / capacity) * 100) : 0
  /**
   * 产能默认由起止日期推算（工作日 × 8h）。这里只做提示派生，不写表单：
   * 写值只发生在用户主动改日期时，否则编辑态回填会静默覆盖存量产能。
   */
  const rangeValue = Form.useWatch('range', form)
  const autoWorkdays = countWorkdays(rangeValue?.[0], rangeValue?.[1])
  const autoCapacityHours = autoWorkdays * HOURS_PER_WORKDAY
  /** 手改过后提示来源，避免使用者以为系统算错了 */
  const capacityAdjusted = autoWorkdays > 0
    && typeof capacity === 'number' && capacity > 0
    && capacity !== autoCapacityHours
  const capacityExtra = autoWorkdays > 0
    ? (capacityAdjusted
        ? t('rdm.iterationForm.capacityManualHint', { days: autoWorkdays, defaultValue: '{{days}} 個工作日 × 8h，已手動調整' })
        : t('rdm.iterationForm.capacityAutoHint', { days: autoWorkdays, defaultValue: '{{days}} 個工作日 × 8h' }))
    : t('rdm.iterationForm.capacityAutoEmpty', { defaultValue: '選擇起止日期後自動計算' })
  /** 类型联动：hotfix（紧急修复）可不挂项目，sprint/version 必挂（与后端 saveIteration 同口径） */
  const iterationTypeValue = Form.useWatch('iterationType', form)
  const projectRequired = iterationTypeValue !== RDM_ITERATION_TYPE.HOTFIX
  /** 确认框里的项目文案：候选里找不到（如存量已关闭项目）降级显示 id，不编造项目名 */
  const projectLabel = (id?: number | null) => {
    if (id == null) return '-'
    const p = projectOptions.find(o => o.id === id)
    return p ? `${p.projectNo} · ${p.name}` : `項目 #${id}`
  }

  const handleSave = async () => {
    let values: Awaited<ReturnType<typeof form.validateFields>>
    try {
      values = await form.validateFields()
    } catch {
      message.warning('請先補全迭代表單帶 * 的必填項')
      return
    }
    const ownerIds = values.owner as number[] | undefined
    const payload: RdmIterationPayload = {
      id: iterationId || undefined,
      name: values.name.trim(),
      projectId: values.projectId ?? null,
      iterationType: values.iterationType,
      startDate: values.range?.[0]?.format('YYYY-MM-DD') ?? '',
      endDate: values.range?.[1]?.format('YYYY-MM-DD') ?? '',
      capacityHours: values.capacityHours,
      ownerUserId: ownerIds?.[0] ?? undefined,
      status: values.status,
      remark: values.remark,
    }
    /*
     * 迭代是排期与产能的对账基准，创建/修改会立即影响负载与逾期判定，
     * 按 §B.3 走「校验 → 二次确认 → 调接口」，确认框给出关键上下文。
     */
    const confirmed = await new Promise<boolean>(resolve => {
      Modal.confirm({
        title: iterationId ? '確認保存迭代變更？' : '確認創建迭代？',
        className: 'custom-confirm-modal',
        icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
        content: (
          <div className="confirm-info-card">
            <div className="confirm-info-row"><span>迭代編號：</span><b>{iterationId ? currentIteration?.code ?? '-' : '系統自動發號'}</b></div>
            <div className="confirm-info-row"><span>迭代名稱：</span><b>{payload.name}</b></div>
            <div className="confirm-info-row"><span>所屬項目：</span><b>{projectLabel(values.projectId)}</b></div>
            <div className="confirm-info-row"><span>起止日期：</span><b>{payload.startDate} ~ {payload.endDate}</b></div>
            <div className="confirm-info-row"><span>容納工時：</span><b>{payload.capacityHours} h</b></div>
          </div>
        ),
        okText: '確認保存',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      })
    })
    if (!confirmed) return
    setSaving(true)
    try {
      const saved = await saveIteration(payload)
      message.success(iterationId ? '迭代已更新' : `迭代已創建：${saved.code}`)
      navigate('/rdm-iteration')
    } catch {
      // request.ts 已统一弹后端失败原因，此处不再双弹（§G.4）
      console.error('迭代保存失敗', payload.code)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content-area">
      <RdmFormHeader
        title={iterationId ? '編輯迭代' : '新增迭代'}
        onBack={() => navigate(-1)}
        meta={iterationId
          ? `迭代編碼 ${currentIteration?.code ?? '-'} 由系統發號、不可修改；產能依工作日 × 8h 自動計算，可手動調整`
          : '迭代編碼保存時由系統按類型自動發號（常規 SP／版本專項 VER／緊急修復 HF）；產能依工作日 × 8h 自動計算，可手動調整'}
      />

      {iterationId > 0 && (
        <Alert
          type={loadRate > 100 ? 'error' : loadRate >= 85 ? 'warning' : 'info'}
          showIcon
          style={{ marginBottom: 16 }}
          message={`當前已排工時 ${scheduledHours.toFixed(1)} h${capacity ? `，負載率 ${loadRate}%` : '（尚未填產能，無法預警）'}`}
          description={loadRate > 100
            ? '超出產能：請在需求排期前順延低優需求、拆分任務或補充人力，否則必然逾期。'
            : '負載率 ≥85% 時建議只接小需求，預留聯調與缺陷回歸時間。'}
        />
      )}

      <Form form={form} layout="vertical" initialValues={{ iterationType: RDM_ITERATION_TYPE.SPRINT, status: RDM_ITERATION_STATUS.PLANNING }}>
        {/* 迭代信息 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#E6F7FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarOutlined style={{ fontSize: 14, color: '#1890FF' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>迭代信息</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="迭代名稱" name="name" rules={[{ required: true, message: '請填寫迭代名稱' }, { max: 64, message: '不超過 64 字' }]}>
              <Input placeholder="例：10 月上半迭代" maxLength={64} />
            </Form.Item>
            <Form.Item label="類型" name="iterationType" rules={[{ required: true, message: '請選擇類型' }]}>
              <Select options={Object.entries(RDM_ITERATION_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item
              label="所屬項目"
              name="projectId"
              rules={projectRequired ? [{ required: true, message: '請選擇所屬項目' }] : []}
              extra={projectRequired ? '常規/版本專項迭代必須掛項目' : '緊急修復可不掛（跨項目平台級熱修）'}
            >
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={projectRequired ? '選擇進行中的項目' : '可留空'}
                notFoundContent="暫無可用項目"
                options={projectOptions.map(p => ({ value: p.id, label: `${p.projectNo} · ${p.name}` }))}
              />
            </Form.Item>
            <Form.Item label="起止日期" name="range" rules={[{ required: true, message: '請選擇起止日期' }]}>
              <DatePicker.RangePicker
                style={{ width: '100%' }}
                onChange={dates => {
                  // 日期一改就按系统口径覆盖产能；随后仍可在输入框手改（extra 会标注已手改）
                  const hours = workdayHours(dates?.[0], dates?.[1])
                  if (hours > 0) form.setFieldValue('capacityHours', hours)
                }}
              />
            </Form.Item>
            <Form.Item label="狀態" name="status" rules={[{ required: true, message: '請選擇狀態' }]}>
              <Select options={Object.entries(RDM_ITERATION_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </div>
        </div>

        {/* 產能與負責人 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#FFF7E6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TeamOutlined style={{ fontSize: 14, color: '#FA8C16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>產能與負責人</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item
              label="產能（工時）" name="capacityHours" rules={[{ required: true, message: '請填寫產能' }]}
              extra={capacityExtra}
            >
              <InputNumber min={0} step={8} style={{ width: '100%' }} placeholder="選日期後自動填入" />
            </Form.Item>
            <Form.Item label="迭代負責人" name="owner">
              <EmployeeSelect single placeholder="搜尋姓名或工號" />
            </Form.Item>
          </div>
          <Form.Item label="說明" name="remark" style={{ marginTop: 16 }}>
            <TextArea rows={3} maxLength={500} showCount placeholder="例：含報表專項與移動端適配，預留 20% 處理線上問題" />
          </Form.Item>
        </div>
      </Form>

      <div className="form-footer">
        <Button onClick={() => navigate(-1)}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>保存迭代</Button>
      </div>
    </div>
  )
}
