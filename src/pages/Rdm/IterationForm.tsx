/**
 * 迭代新增/编辑 —— 独立表单页
 *
 * 产能（工时）是排期对账的分母：填 0 就等于放弃超载预警，因此页面把「产能」
 * 与「已排工时」并列展示，编辑态实时提示负载率。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, message } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import RdmFormHeader from './components/RdmFormHeader'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import RemoteSearchSelect from '../../components/RemoteSearchSelect'
import { fetchEmployees } from '../../api/employee'
import { fetchIterations, saveIteration, type RdmIterationForm as RdmIterationPayload, type RdmIterationItem } from '../../api/rdm'
import {
  RDM_ITERATION_STATUS,
  RDM_ITERATION_STATUS_LABEL,
  RDM_ITERATION_TYPE,
  RDM_ITERATION_TYPE_LABEL,
  type RdmIterationStatus,
  type RdmIterationType,
} from '../../constants/rdm'
import './index.css'

const { TextArea } = Input

/** 表单内部结构（日期用组件类型，提交时转字符串） */
interface FormValues {
  code: string
  name: string
  iterationType: RdmIterationType
  range?: [dayjs.Dayjs, dayjs.Dayjs]
  capacityHours?: number
  owner?: string
  status: RdmIterationStatus
  remark?: string
}

export default function IterationForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const iterationId = Number(searchParams.get('id') ?? 0)

  const [form] = Form.useForm<FormValues>()
  const [iterations, setIterations] = useState<RdmIterationItem[]>([])
  const [saving, setSaving] = useState(false)
  const capacity = Form.useWatch('capacityHours', form)
  const owner = Form.useWatch('owner', form)

  useEffect(() => {
    fetchIterations().then(list => {
      setIterations(list)
      const current = list.find(i => i.id === iterationId)
      if (!current) return
      form.setFieldsValue({
        code: current.code,
        name: current.name,
        iterationType: (current.iterationType ?? RDM_ITERATION_TYPE.SPRINT) as RdmIterationType,
        range: current.startDate && current.endDate ? [dayjs(current.startDate), dayjs(current.endDate)] : undefined,
        capacityHours: current.capacityHours ?? 0,
        owner: current.ownerUserId ? String(current.ownerUserId) : undefined,
        status: (current.status ?? RDM_ITERATION_STATUS.PLANNING) as RdmIterationStatus,
        remark: current.remark ?? undefined,
      })
    }).catch(() => message.error('迭代資訊載入失敗'))
  }, [iterationId, form])

  const fetchOwnerOptions = useCallback(async (keyword: string) => {
    const res = await fetchEmployees({ page: 1, size: 20, keyword: keyword || undefined, employmentStatus: 'active' })
    return (res.records ?? []).map(e => ({ value: String(e.id), label: `${e.name}（${e.empId}${e.department ? ` · ${e.department}` : ''}）` }))
  }, [])

  const ownerOptions = useMemo(() => {
    if (!owner) return []
    const current = iterations.find(i => i.id === iterationId)
    return [{ value: String(owner), label: current?.ownerName ? `${current.ownerName}（${owner}）` : String(owner) }]
  }, [owner, iterations, iterationId])

  /** 编辑态已排工时（负载率提示用），新增态为 0 */
  const scheduledHours = iterations.find(i => i.id === iterationId)?.taskHours ?? 0
  const loadRate = capacity && capacity > 0 ? Math.round((scheduledHours / capacity) * 100) : 0

  const handleSave = async () => {
    // 校验失败要给可见提示，不能变成无人接的 rejection（点了保存什么都没发生）
    let values: Awaited<ReturnType<typeof form.validateFields>>
    try {
      values = await form.validateFields()
    } catch {
      message.warning('請先補全迭代表單帶 * 的必填項')
      return
    }
    const payload: RdmIterationPayload = {
      id: iterationId || undefined,
      code: values.code.trim(),
      name: values.name.trim(),
      iterationType: values.iterationType,
      startDate: values.range?.[0]?.format('YYYY-MM-DD') ?? '',
      endDate: values.range?.[1]?.format('YYYY-MM-DD') ?? '',
      capacityHours: values.capacityHours,
      ownerUserId: values.owner ? Number(values.owner) : undefined,
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
            <div className="confirm-info-row"><span>迭代編號：</span><b>{payload.code}</b></div>
            <div className="confirm-info-row"><span>迭代名稱：</span><b>{payload.name}</b></div>
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
    if (!confirmed) {
      return
    }
    setSaving(true)
    try {
      await saveIteration(payload)
      message.success(iterationId ? '迭代已更新' : '迭代已創建')
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
        meta="迭代編碼建議帶年份與批次，如 SP2026-10A；產能按團隊可投入工時填寫"
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

      <Form form={form} layout="vertical" style={{ maxWidth: 720 }} initialValues={{ iterationType: RDM_ITERATION_TYPE.SPRINT, status: RDM_ITERATION_STATUS.PLANNING }}>
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">迭代信息</div>
          <Space size={16} wrap>
            <Form.Item label="迭代編碼" name="code" rules={[{ required: true, message: '請填寫迭代編碼' }, { max: 32, message: '不超過 32 字' }]}>
              <Input placeholder="例：SP2026-10A" maxLength={32} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item label="迭代名稱" name="name" rules={[{ required: true, message: '請填寫迭代名稱' }, { max: 64, message: '不超過 64 字' }]}>
              <Input placeholder="例：10 月上半迭代" maxLength={64} style={{ width: 260 }} />
            </Form.Item>
          </Space>
          <Space size={16} wrap>
            <Form.Item label="類型" name="iterationType" rules={[{ required: true, message: '請選擇類型' }]}>
              <Select
                style={{ width: 160 }}
                options={Object.entries(RDM_ITERATION_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
              />
            </Form.Item>
            <Form.Item label="起止日期" name="range" rules={[{ required: true, message: '請選擇起止日期' }]}>
              <DatePicker.RangePicker style={{ width: 260 }} />
            </Form.Item>
            <Form.Item label="狀態" name="status" rules={[{ required: true, message: '請選擇狀態' }]}>
              <Select
                style={{ width: 140 }}
                options={Object.entries(RDM_ITERATION_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
              />
            </Form.Item>
          </Space>
        </div>

        <div className="rdm-form-section">
          <div className="rdm-form-section-title">產能與負責人</div>
          <Space size={16} wrap>
            <Form.Item label="產能（工時）" name="capacityHours" rules={[{ required: true, message: '請填寫產能' }]}>
              <InputNumber min={0} step={8} style={{ width: 160 }} placeholder="例：400" />
            </Form.Item>
            <Form.Item label="迭代負責人" name="owner">
              <RemoteSearchSelect
                placeholder="輸入姓名/工號搜索在職員工"
                fetchOptions={fetchOwnerOptions}
                initialOptions={ownerOptions}
                style={{ width: 300 }}
              />
            </Form.Item>
          </Space>
          <Form.Item label="說明" name="remark">
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
