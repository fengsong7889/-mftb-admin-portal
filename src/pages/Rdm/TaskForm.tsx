/**
 * 任务新增/编辑 —— 独立表单页（遵循「新增/编辑用独立页面，禁止弹窗」规范）
 *
 * 研发负责人/产品经理把一条需求拆成 UI设计/前端/后端/测试/数据 任务，
 * 指派到人并登记计划工时与起止日期；已受理的需求拆任务后自动进入「開發中」。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select, message } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import RdmFormHeader from './components/RdmFormHeader'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import RemoteSearchSelect from '../../components/RemoteSearchSelect'
import type { OptionItem } from '../../api/types'
import { fetchEmployees } from '../../api/employee'
import {
  checkTaskOwner,
  fetchReqTasks,
  fetchRequirementDetail,
  fetchRequirementPage,
  saveTask,
  type RdmTaskForm as RdmTaskFormValues,
  type RdmTaskOwnerCheck,
} from '../../api/rdm'
import { formatRdmReqNo, RDM_STATUS } from '../../constants/rdm'
import { useTaskTypeDict } from '../../hooks/useTaskTypeDict'
import { countWorkdays, HOURS_PER_WORKDAY, workdayHours } from './workdays'
import './index.css'

const { TextArea } = Input

/**
 * 不能挂任务的需求状态：准入前（草稿/待审批/审批驳回）、需求池未分配、已上线/已归档。
 * 与服务端 saveTask 的硬拦截同源（服务端只拒绝准入前三态 + 需求池），
 * 已经上线/归档的需求再拆任务只会变成无人认领的尾巴。
 */
const TASK_REQ_EXCLUDED_STATUS = new Set<string>([
  RDM_STATUS.DRAFT,
  RDM_STATUS.INTAKE_PENDING,
  RDM_STATUS.INTAKE_REJECTED,
  RDM_STATUS.POOL,
  RDM_STATUS.RELEASED,
  RDM_STATUS.VERIFIED,
  RDM_STATUS.CLOSED,
])

/** 表单内部结构（日期与负责人用组件类型，提交时转换） */
interface FormValues {
  taskType: string
  title: string
  content?: string
  owner?: string
  planHours?: number
  planRange?: [dayjs.Dayjs, dayjs.Dayjs]
}

export default function TaskForm() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const reqIdFromUrl = Number(searchParams.get('reqId') ?? 0)
  const taskId = Number(searchParams.get('id') ?? 0)
  /**
   * 所属需求改为可选：原先只认 URL 带来的 reqId，从研发工作台「新增任務」进入时
   * 该字段是空且不可编辑，保存时才提示「請先選擇需求」——等于根本建不了任务。
   */
  const [reqId, setReqId] = useState(reqIdFromUrl)

  const [form] = Form.useForm<FormValues>()
  // 任务类型字典（业务可配置）：选项/确认框标签都从接口来，编辑旧任务时把当前值并入选项防回显空白
  const { options: taskTypeDictOptions, labelOf: taskTypeLabelOf } = useTaskTypeDict()
  const currentTaskType = Form.useWatch('taskType', form)
  const taskTypeOptions = currentTaskType && !taskTypeDictOptions.some(o => o.value === currentTaskType)
    ? [{ value: currentTaskType, label: taskTypeLabelOf(currentTaskType) }, ...taskTypeDictOptions]
    : taskTypeDictOptions
  const [requirement, setRequirement] = useState<{ reqNo: string; title: string; status: string; iterationCode?: string | null } | null>(null)
  /** 负责人显示名：表单值只有 userId，确认框光靠 id 没法核对派给了谁 */
  const [ownerLabel, setOwnerLabel] = useState<string>()
  /** 负责人资格预检：无研发交付权限只提醒、不阻断保存 */
  const [ownerCheck, setOwnerCheck] = useState<RdmTaskOwnerCheck | null>(null)
  /** 所属部门：负责人派生字段，不入库（任务上已存工号，部门随时可反查） */
  const [ownerDept, setOwnerDept] = useState<string>()
  /** 员工 id → 部门：下拉数据带回来的，选完立刻回填，不等预检接口 */
  const deptByIdRef = useRef<Record<string, string>>({})
  /** 预检请求序号：快速换人时丢弃过期响应，避免提醒对不上当前负责人 */
  const ownerCheckSeq = useRef(0)
  const [saving, setSaving] = useState(false)

  /**
   * 计划工时默认由计划起止推算（工作日 × 8h），只在用户主动改日期时写入，
   * 编辑态回填不覆盖存量工时；手改后 extra 标注来源，避免误以为系统算错。
   */
  const planRangeValue = Form.useWatch('planRange', form)
  const planHoursValue = Form.useWatch('planHours', form)
  const autoWorkdays = countWorkdays(planRangeValue?.[0], planRangeValue?.[1])
  const autoPlanHours = autoWorkdays * HOURS_PER_WORKDAY
  const planHoursAdjusted = autoWorkdays > 0
    && typeof planHoursValue === 'number' && planHoursValue > 0
    && planHoursValue !== autoPlanHours
  const planHoursExtra = autoWorkdays > 0
    ? (planHoursAdjusted
        ? t('rdm.taskForm.planHoursManualHint', { days: autoWorkdays, defaultValue: '{{days}} 個工作日 × 8h，已手動調整' })
        : t('rdm.taskForm.planHoursAutoHint', { days: autoWorkdays, defaultValue: '{{days}} 個工作日 × 8h' }))
    : t('rdm.taskForm.planHoursAutoEmpty', { defaultValue: '選擇計劃起止後自動計算' })

  /**
   * 选完人即预检负责人资格。
   * <p>预检失败不得阻断派活：拿不到结果就当无提醒，真正的硬约束（离职/停用）
   * 仍由保存接口兜底拦截。
   */
  const checkOwner = useCallback(async (userId?: string) => {
    const seq = ++ownerCheckSeq.current
    if (!userId) {
      setOwnerCheck(null)
      setOwnerDept(undefined)
      return
    }
    try {
      const res = await checkTaskOwner(Number(userId))
      if (seq !== ownerCheckSeq.current) return
      setOwnerCheck(res)
      // 接口没回部门时保留下拉带回来的值，不把已显示的部门清空
      if (res.department) setOwnerDept(res.department)
    } catch {
      if (seq === ownerCheckSeq.current) setOwnerCheck(null)
    }
  }, [])

  /** 编辑态：从需求任务列表里取回原任务，避免再开一个详情接口 */
  useEffect(() => {
    if (!reqId) { setRequirement(null); return }
    fetchRequirementDetail(reqId)
      .then(d => d && setRequirement({ reqNo: formatRdmReqNo(d.reqNo), title: d.title, status: d.status, iterationCode: d.iterationCode }))
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
      })
      if (task.ownerName) {
        setOwnerLabel(task.ownerEmpNo ? `${task.ownerName}（${task.ownerEmpNo}）` : task.ownerName)
      }
      // 编辑态也预检：历史任务可能派给了当时有权限、后来被收权的人
      void checkOwner(task.ownerUserId ? String(task.ownerUserId) : undefined)
    }).catch(() => message.error('任務資訊載入失敗'))
  }, [reqId, taskId, form, checkOwner])

  /** 可建任务的需求候选：只列在途需求，草稿/待审批/需求池/已上线不参与拆任务 */
  const fetchRequirementOptions = useCallback(async (keyword: string): Promise<OptionItem[]> => {
    const res = await fetchRequirementPage({
      page: 1, size: 20, keyword: keyword || undefined, executionOnly: true,
    })
    return (res.records ?? [])
      .filter(r => !TASK_REQ_EXCLUDED_STATUS.has(r.status))
      .map(r => ({ value: String(r.id), label: `${formatRdmReqNo(r.reqNo)} · ${r.title}` }))
  }, [])

  /** 已选需求的回显选项：切过需求后不能回显成裸 id */
  const reqInitialOptions = useMemo<OptionItem[]>(
    () => (reqId && requirement
      ? [{ value: String(reqId), label: `${requirement.reqNo} · ${requirement.title}` }]
      : []),
    [reqId, requirement],
  )

  const fetchOwnerOptions = useCallback(async (keyword: string) => {
    const res = await fetchEmployees({ page: 1, size: 20, keyword: keyword || undefined, employmentStatus: 'active' })
    const records = res.records ?? []
    // 部门不再挤进下拉标签（一个字段只装一个语义），单独缓存供选完即时带出
    records.forEach(e => { if (e.department) deptByIdRef.current[String(e.id)] = e.department })
    return records.map(e => ({ value: String(e.id), label: `${e.name}（${e.empId}）` }))
  }, [])

  const ownerOptions = useMemo(() => {
    const owner = form.getFieldValue('owner')
    return owner ? [{ value: String(owner), label: String(owner) }] : []
  }, [form])

  const handleSave = async () => {
    if (!reqId) {
      message.warning(t('rdm.taskForm.reqRequired', { defaultValue: '請先選擇需求' }))
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
          <div className="confirm-info-row"><span>{t('rdm.taskForm.reqLabel', { defaultValue: '所屬需求' })}：</span><b>{requirement ? `${requirement.reqNo} · ${requirement.title}` : '-'}</b></div>
          <div className="confirm-info-row"><span>任務標題：</span><b>{values.title.trim()}</b></div>
          <div className="confirm-info-row"><span>任務類型：</span><b>{taskTypeLabelOf(values.taskType)}</b></div>
          <div className="confirm-info-row"><span>負責人：</span><b>{ownerText}</b></div>
          {/* 无交付权限不阻断保存，但必须在确认框里再提醒一次，否则 PM 会以为对方能直接上报进度 */}
          {ownerCheck?.warning && (
            <div className="confirm-info-row"><span>權限提醒：</span><b style={{ color: '#D46B08' }}>{ownerCheck.warning}</b></div>
          )}
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
        // 归属体系改造：任务迭代由后端从需求继承（单一真值源），前端不再上送
      }
      await saveTask(payload)
      message.success(taskId ? '任務已更新' : '任務已創建並指派')
      navigate(reqId ? `/rdm-detail?id=${reqId}` : '/rdm-delivery')
    } catch {
      // request.ts 已统一弹后端返回的失败原因（如「已離職或停用，請改派他人」），此处不再重复弹
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

      {/* 表单不再锁 720px：独立页必须撑满内容区，字段按全局规范每行 3 列铺开 */}
      <Form form={form} layout="vertical">
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">任務信息</div>
          <div className="rdm-task-fields">
            {/* 非编辑态支持选需求：从研发工作台进入时没有 URL 的 reqId，锁死字段等于建不了任务 */}
            <Form.Item label={t('rdm.taskForm.reqLabel', { defaultValue: '所屬需求' })} className="rdm-field-full" required={!taskId}>
              {taskId ? (
                <Input value={requirement ? `${requirement.reqNo} ${requirement.title}` : '-'} disabled />
              ) : (
                <RemoteSearchSelect
                  value={reqId ? String(reqId) : undefined}
                  placeholder={t('rdm.taskForm.reqPlaceholder', { defaultValue: '輸入需求編號或標題搜索（僅列在途需求）' })}
                  fetchOptions={fetchRequirementOptions}
                  initialOptions={reqInitialOptions}
                  onChange={value => setReqId(Number(value) || 0)}
                />
              )}
            </Form.Item>
            <Form.Item label="任務類型" name="taskType" rules={[{ required: true, message: '請選擇任務類型' }]}>
              <Select
                placeholder="選擇任務類型"
                options={taskTypeOptions}
              />
            </Form.Item>
            <Form.Item
              label="任務標題"
              name="title"
              className="rdm-field-span2"
              rules={[{ required: true, message: '請填寫任務標題' }, { max: 120, message: '不超過 120 字' }]}
            >
              <Input placeholder="例：報表導出支持自定義時間區間（前端）" maxLength={120} showCount />
            </Form.Item>
            <Form.Item label="任務說明 / 技術方案" name="content" className="rdm-field-full">
              <TextArea rows={4} placeholder="寫清改動點、接口/組件、依賴與驗收要點，減少來回問" />
            </Form.Item>
          </div>
        </div>

        <div className="rdm-form-section">
          <div className="rdm-form-section-title">指派與排期</div>
          <div className="rdm-task-fields">
            <Form.Item label="負責人" name="owner" rules={[{ required: true, message: '請選擇負責人' }]}>
              <RemoteSearchSelect
                placeholder="輸入姓名/工號搜索在職員工"
                fetchOptions={fetchOwnerOptions}
                initialOptions={ownerOptions}
                onChange={(value, label) => {
                  setOwnerLabel(label)
                  setOwnerDept(value ? deptByIdRef.current[value] : undefined)
                  void checkOwner(value)
                }}
              />
            </Form.Item>
            {/* 部门是负责人的派生信息，只读回显：手填会和工号反查结果不一致 */}
            <Form.Item label="所屬部門">
              <Input
                disabled
                value={ownerDept ?? ''}
                placeholder={form.getFieldValue('owner') ? '該員工未配置部門' : '選擇負責人後自動帶出'}
              />
            </Form.Item>
            <Form.Item
              label="計劃工時（小時）"
              name="planHours"
              extra={planHoursExtra}
              rules={[{
                type: 'number', min: 0, max: 999,
                message: '計劃工時必須在 0-999 人時之間',
              }]}
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="選日期後自動填入" />
            </Form.Item>
            <Form.Item label="計劃起止" name="planRange">
              <DatePicker.RangePicker
                style={{ width: '100%' }}
                onChange={dates => {
                  // 日期一改就按系统口径覆盖工时；随后仍可手改（extra 会标注已手改）
                  const hours = workdayHours(dates?.[0], dates?.[1])
                  if (hours > 0) form.setFieldValue('planHours', hours)
                }}
              />
            </Form.Item>
            {/* 归属体系改造：迭代继承需求（只读），不再让研发/测试自己选——
                他们不参与项目规划，且任务独立选迭代会与需求迭代分裂，统计对不上 */}
            <Form.Item label="所屬迭代" extra="繼承自需求排期；要換迭代請在需求詳情頁「調整迭代」">
              <Input
                disabled
                value={requirement?.iterationCode ?? ''}
                placeholder={requirement ? '需求尚未排期掛迭代' : '載入中…'}
              />
            </Form.Item>
            {ownerCheck?.warning && (
              <Alert
                type={ownerCheck.hardBlocked ? 'error' : 'warning'}
                showIcon
                style={{ gridColumn: '1 / -1' }}
                message={ownerCheck.warning}
              />
            )}
          </div>
        </div>
      </Form>

      <div className="form-footer">
        <Button onClick={() => navigate(-1)}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>保存任務</Button>
      </div>
    </div>
  )
}
