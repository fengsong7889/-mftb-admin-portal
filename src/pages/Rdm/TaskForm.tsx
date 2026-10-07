/**
 * 任务新增/编辑 —— 独立表单页（遵循「新增/编辑用独立页面，禁止弹窗」规范）
 *
 * 研发负责人/产品经理把一条需求拆成 UI设计/前端/后端/测试/数据 任务，
 * 指派到人并登记计划工时与起止日期；已受理的需求拆任务后自动进入「開發中」。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, message } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import RdmFormHeader from './components/RdmFormHeader'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import RemoteSearchSelect from '../../components/RemoteSearchSelect'
import { fetchEmployees } from '../../api/employee'
import {
  fetchIterations,
  fetchReqTasks,
  fetchRequirementDetail,
  saveTask,
  type RdmIterationItem,
  type RdmTaskForm as RdmTaskFormValues,
} from '../../api/rdm'
import { RDM_ITERATION_STATUS, RDM_TASK_TYPE_LABEL, type RdmTaskType } from '../../constants/rdm'
import './index.css'

const { TextArea } = Input

/** 表单内部结构（日期与负责人用组件类型，提交时转换） */
interface FormValues {
  taskType: string
  title: string
  content?: string
  owner?: string
  planHours?: number
  planRange?: [dayjs.Dayjs, dayjs.Dayjs]
  iterationCode?: string
}

export default function TaskForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const reqId = Number(searchParams.get('reqId') ?? 0)
  const taskId = Number(searchParams.get('id') ?? 0)

  const [form] = Form.useForm<FormValues>()
  const [requirement, setRequirement] = useState<{ reqNo: string; title: string; status: string } | null>(null)
  const [iterations, setIterations] = useState<RdmIterationItem[]>([])
  /** 负责人显示名：表单值只有 userId，确认框光靠 id 没法核对派给了谁 */
  const [ownerLabel, setOwnerLabel] = useState<string>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchIterations().then(setIterations).catch(() => setIterations([]))
  }, [])

  /** 编辑态：从需求任务列表里取回原任务，避免再开一个详情接口 */
  useEffect(() => {
    if (!reqId) return
    fetchRequirementDetail(reqId)
      .then(d => d && setRequirement({ reqNo: d.reqNo, title: d.title, status: d.status }))
      .catch(() => message.error('需求資訊載入失敗'))
    if (!taskId) return
    fetchReqTasks(reqId).then(tasks => {
      const task = tasks.find(t => t.id === taskId)
      if (!task) return
      form.setFieldsValue({
        taskType: task.taskType,
        title: task.title,
        content: task.content ?? undefined,
        owner: task.ownerUserId ? String(task.ownerUserId) : undefined,
        planHours: task.planHours ?? undefined,
        planRange: task.planStartDate && task.planFinishDate
          ? [dayjs(task.planStartDate), dayjs(task.planFinishDate)] : undefined,
        iterationCode: task.iterationCode ?? undefined,
      })
      if (task.ownerName) {
        setOwnerLabel(task.ownerEmpNo ? `${task.ownerName}（${task.ownerEmpNo}）` : task.ownerName)
      }
    }).catch(() => message.error('任務資訊載入失敗'))
  }, [reqId, taskId, form])

  const fetchOwnerOptions = useCallback(async (keyword: string) => {
    const res = await fetchEmployees({ page: 1, size: 20, keyword: keyword || undefined, employmentStatus: 'active' })
    return (res.records ?? []).map(e => ({ value: String(e.id), label: `${e.name}（${e.empId}${e.department ? ` · ${e.department}` : ''}）` }))
  }, [])

  const ownerOptions = useMemo(() => {
    const owner = form.getFieldValue('owner')
    return owner ? [{ value: String(owner), label: String(owner) }] : []
  }, [form])

  const handleSave = async () => {
    if (!reqId) {
      message.warning('請先選擇需求')
      return
    }
    const values = await form.validateFields()
    // 确认框不能只贴一个裸 userId：PM 看到「負责人：41」无法核对派给了谁
    const ownerText = ownerLabel ?? (values.owner ? `未匹配姓名（#${values.owner}）` : '未指派')
    Modal.confirm({
      title: taskId ? '確認保存任務？' : '確認創建並指派任務？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>任務標題：</span><b>{values.title.trim()}</b></div>
          <div className="confirm-info-row"><span>任務類型：</span><b>{RDM_TASK_TYPE_LABEL[values.taskType as RdmTaskType] ?? values.taskType}</b></div>
          <div className="confirm-info-row"><span>負責人：</span><b>{ownerText}</b></div>
          <div className="confirm-info-row"><span>計劃工時：</span><b>{values.planHours ?? '-'} h</b></div>
          {!taskId && <div className="confirm-info-row"><span>說明：</span><b>創建後負責人會收到待辦提醒</b></div>}
        </div>
      ),
      okText: '確認保存',
      cancelText: '取消',
      onOk: () => submitTask(values),
    })
  }

  /** 确认后才落库 */
  const submitTask = async (values: Awaited<ReturnType<typeof form.validateFields>>) => {
    if (!reqId) return
    setSaving(true)
    try {
      const payload: RdmTaskFormValues = {
        id: taskId || undefined,
        reqId,
        taskType: values.taskType,
        title: values.title.trim(),
        content: values.content,
        ownerUserId: values.owner ? Number(values.owner) : undefined,
        planHours: values.planHours,
        planStartDate: values.planRange?.[0]?.format('YYYY-MM-DD'),
        planFinishDate: values.planRange?.[1]?.format('YYYY-MM-DD'),
        iterationCode: values.iterationCode,
      }
      await saveTask(payload)
      message.success(taskId ? '任務已更新' : '任務已創建並指派')
      navigate(reqId ? `/rdm-detail?id=${reqId}` : '/rdm-delivery')
    } catch {
      message.error('保存失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content-area">
      {/* ── 页面头部（统一组件）── */}
      <RdmFormHeader
        title={taskId ? '編輯任務' : '新增研發任務'}
        onBack={() => navigate(-1)}
        meta={requirement ? `${requirement.reqNo} · ${requirement.title}` : '將需求拆成可執行任務並指派到人，工時用於產出量化'}
      />

      <Form form={form} layout="vertical" style={{ maxWidth: 720 }}>
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">任務信息</div>
          <Form.Item label="所屬需求">
            <Input value={requirement ? `${requirement.reqNo} ${requirement.title}` : '-'} disabled />
          </Form.Item>
          <Form.Item label="任務類型" name="taskType" rules={[{ required: true, message: '請選擇任務類型' }]}>
            <Select
              style={{ width: 220 }}
              placeholder="選擇任務類型"
              options={Object.entries(RDM_TASK_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item label="任務標題" name="title" rules={[{ required: true, message: '請填寫任務標題' }, { max: 120, message: '不超過 120 字' }]}>
            <Input placeholder="例：報表導出支持自定義時間區間（前端）" maxLength={120} showCount />
          </Form.Item>
          <Form.Item label="任務說明 / 技術方案" name="content">
            <TextArea rows={4} placeholder="寫清改動點、接口/組件、依賴與驗收要點，減少來回問" />
          </Form.Item>
        </div>

        <div className="rdm-form-section">
          <div className="rdm-form-section-title">指派與排期</div>
          <Form.Item label="負責人" name="owner" rules={[{ required: true, message: '請選擇負責人' }]}>
            <RemoteSearchSelect
              placeholder="輸入姓名/工號搜索在職員工"
              fetchOptions={fetchOwnerOptions}
              initialOptions={ownerOptions}
              onChange={(_, label) => setOwnerLabel(label)}
              style={{ width: 320 }}
            />
          </Form.Item>
          <Space size={16} wrap>
            <Form.Item
              label="計劃工時（小時）"
              name="planHours"
              rules={[{
                type: 'number', min: 0, max: 999,
                message: '計劃工時必須在 0-999 人時之間',
              }]}
            >
              <InputNumber min={0} step={1} style={{ width: 150 }} placeholder="例：16" />
            </Form.Item>
            <Form.Item label="計劃起止" name="planRange">
              <DatePicker.RangePicker style={{ width: 260 }} />
            </Form.Item>
            <Form.Item label="所屬迭代" name="iterationCode">
              <Select
                style={{ width: 220 }}
                allowClear
                placeholder="選擇迭代（可選）"
                options={iterations.filter(i => i.status !== RDM_ITERATION_STATUS.CLOSED).map(i => ({
                  value: i.code,
                  label: `${i.name}（${i.startDate ?? '-'} ~ ${i.endDate ?? '-'}）`,
                }))}
              />
            </Form.Item>
          </Space>
        </div>
      </Form>

      <div className="form-footer">
        <Button onClick={() => navigate(-1)}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>保存任務</Button>
      </div>
    </div>
  )
}
