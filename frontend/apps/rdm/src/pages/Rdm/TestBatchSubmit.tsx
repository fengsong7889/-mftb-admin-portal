/**
 * 發起提測 —— 独立表单页（替代原提测工作台内的「發起提測」弹窗）
 *
 * 为什么是独立页而不是 Modal：AGENTS.md §9.1 明确禁止用弹窗承载新增/编辑/详情，
 * 独立页信息承载力更强、URL 可分享可刷新、支持浏览器前进后退。
 *
 * 变更影响：仅前端；接口沿用 POST /rdm/test-batch（submitTestBatch），契约零改动。
 * 安全边界：权限由后端 @RequirePermission(menu=rdm-delivery-test, action=create) 兜底，
 * 前端路由锚点归属 rdm-delivery-test 菜单（见 Permission/types.ts ROUTE_MENU_KEY_MAP）；
 * 测试负责人/执行人一律取员工下拉的 sys_user.id，不接受手填 ID（手填会传错人且无法校验）。
 * 校验顺序：validateFields → 组装 payload → 调 API（§B.3 禁止先弹后校验）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, Select, message } from 'antd'
import {
  AimOutlined, BuildOutlined, ExperimentOutlined,
  MinusCircleOutlined, PlusOutlined, ScheduleOutlined, SendOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import RdmFormHeader from './components/RdmFormHeader'
import RemoteSearchSelect from '@/components/RemoteSearchSelect'
import {
  fetchDeliveryItems,
  fetchReqTasks,
  fetchRequirementDetail,
  fetchRequirementPage,
  resolveTestBatchTaskScope,
  submitTestBatch,
  type RdmTestBatchSubmitForm,
} from '@/api/rdm'
import { fetchEmployeeIdOptions } from '@/api/employee'
import { formatRdmReqNo } from '@/constants/rdm'
/* 路由直达本页时按代码分割单独加载，不 import 就会丢卡片/网格样式（曾导致整页退化为裸文本） */
import './index.css'

/** 测试环境选项（提测页唯一消费方，故随页定义，不进全局常量） */
const TEST_ENV_OPTIONS = [
  { value: 'uat', label: 'UAT 環境' },
  { value: 'pre', label: '預發環境' },
  { value: 'prod', label: '生產環境' },
]

/** 表单值形状（planEndTime 是 dayjs，提交时才格式化成字符串） */
interface SubmitFormValues {
  reqId: number
  /** 前端辅助字段：勾任务后由服务端解析成交付项，提交时不直接上送 */
  taskIds?: number[]
  deliveryItemIds: number[]
  testEnv: string
  planEndTime?: dayjs.Dayjs
  testLeadUserId?: string
  executorUserIds?: string[]
  buildIds?: { buildId?: string }[]
  /** 测试用例草稿：受理时由服务端规范化成冻结用例集，为空会被拒绝 */
  cases?: { deliveryItemId?: number; caseTitle?: string }[]
}

/** 可提测的需求状态：V3 需求受理后主状态可能一直停在 accepted，不能只认 scope=delivery */
const TESTABLE_REQ_STATUS = new Set([
  'accepted', 'prd_designing', 'reviewing', 'review_passed',
  'scheduled', 'designing', 'developing', 'integration', 'testing', 'test_passed',
])

export default function TestBatchSubmit() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  /** 从交付项详情「提交提測」进入：预填需求与交付项，避免用户重新搜一遍 */
  const urlReqId = Number(searchParams.get('reqId') ?? 0)
  const urlDeliveryItemId = Number(searchParams.get('deliveryItemId') ?? 0)
  const prefilledRef = useRef(false)
  const [form] = Form.useForm<SubmitFormValues>()
  const [submitting, setSubmitting] = useState(false)

  const [reqOptions, setReqOptions] = useState<{ value: number; label: string }[]>([])
  /** 交付项选项只需要 id/编号/标题；按任务解析出的条目也能直接合并进来 */
  const [deliveryOptions, setDeliveryOptions] = useState<{ id: number; itemNo: string; title: string }[]>([])
  /** 当前需求下的任务（按任务交付的入口） */
  const [taskOptions, setTaskOptions] = useState<{ value: number; label: string }[]>([])
  const [resolvingScope, setResolvingScope] = useState(false)
  /** 测试负责人姓名：后端 DTO 要 userId + userName 两列，用户名从下拉 label 取，不让用户再手填 */
  const [leadName, setLeadName] = useState('')
  const [executorOptions, setExecutorOptions] = useState<{ value: string; label: string }[]>([])
  /**
   * 已选交付项：用例必须挂到本次提测范围内的交付项。
   * <p>服务端受理时会丢弃“不属于本批次交付项”的用例；前端这里先做同源过滤，
   * 避免用户添了用例、受理时却被静默丢掉，冻结集变空随后遭拒。
   */
  const selectedItemIds = Form.useWatch('deliveryItemIds', form) ?? []

  /**
   * 需求清单：取研发交付范围内前 50 条本地模糊匹配。
   * <p>必须带 flowVersion=3：提测批次是 V3 分批交付专属入口，服务端准入会直接拒
   * flow_version != 3 的需求（「該需求非新版交付流程，無法使用提測批次」）。
   * 不在候选侧同源过滤，用户会在下拉里选得到、提交时被拒，两侧口径必须一致。
   */
  const loadRequirements = useCallback(async () => {
    if (reqOptions.length) return
    try {
      /*
       * 不再用 scope=delivery：该视角只认 scheduled 之后的状态，而 V3 需求受理后
       * 主状态就停在 accepted（后续以交付项推进），导致提测「關聯需求」永远为空。
       * 改为只按 flowVersion=3 取数，再用可提测状态过滤；真正的准入仍由服务端校验。
       */
      const res = await fetchRequirementPage({ size: 50, page: 1, flowVersion: 3 })
      // reqNo 在认领前为 null（延迟发号），统一走占位文案，不渲染出 "null"
      setReqOptions((res.records ?? [])
        .filter(r => TESTABLE_REQ_STATUS.has(r.status))
        .map(r => ({ value: r.id, label: `${formatRdmReqNo(r.reqNo)} ${r.title}` })))
    } catch {
      // request.ts 已统一弹后端错误，此处不双弹（§G.4）
    }
  }, [reqOptions.length])

  /** 换需求必须清空已选交付项/任务：它们属于需求，留着就是跨需求串数据 */
  const handleReqChange = useCallback(async (reqId: number) => {
    form.setFieldValue('deliveryItemIds', [])
    form.setFieldValue('taskIds', [])
    setTaskOptions([])
    try {
      const [items, tasks] = await Promise.all([
        fetchDeliveryItems({ reqId, pageSize: 100 }),
        fetchReqTasks(reqId),
      ])
      setDeliveryOptions(items.records ?? [])
      setTaskOptions((tasks ?? []).map(task => ({
        value: task.id,
        label: `${task.taskNo} ${task.title}${task.deliveryItemId ? ' · 已掛交付項' : ''}`,
      })))
    } catch {
      setDeliveryOptions([])
      setTaskOptions([])
    }
  }, [form])

  /** URL 预填（仅首次）：候选里没有目标需求/交付项时补一条，避免回显成裸 ID */
  useEffect(() => {
    if (prefilledRef.current || !urlReqId) return
    prefilledRef.current = true
    void (async () => {
      await loadRequirements()
      try {
        const detail = await fetchRequirementDetail(urlReqId)
        if (detail) {
          setReqOptions(prev => prev.some(o => o.value === urlReqId)
            ? prev
            : [{ value: urlReqId, label: `${formatRdmReqNo(detail.reqNo)} ${detail.title}` }, ...prev])
        }
      } catch { /* 选项补不上不阻断，提交时后端仍会校验 */ }
      form.setFieldValue('reqId', urlReqId)
      await handleReqChange(urlReqId)
      if (urlDeliveryItemId) {
        form.setFieldValue('deliveryItemIds', [urlDeliveryItemId])
        setDeliveryOptions(prev => prev.some(o => o.id === urlDeliveryItemId)
          ? prev
          : [...prev, { id: urlDeliveryItemId, itemNo: `#${urlDeliveryItemId}`, title: '' }])
      }
    })()
  }, [urlReqId, urlDeliveryItemId, loadRequirements, handleReqChange, form])

  /**
   * 按任务交付：勾选任务后由服务端解析成交付项（已挂则复用，未挂归入默认交付项并回填任务）。
   * <p>解析结果回填到「交付項」多选，仍可手工增减：事实层仍是交付项，不改测试快照口径。
   */
  const handleTaskChange = async (taskIds: number[]) => {
    const reqId = form.getFieldValue('reqId') as number | undefined
    if (!reqId || !taskIds?.length) return
    setResolvingScope(true)
    try {
      const items = await resolveTestBatchTaskScope(reqId, taskIds)
      form.setFieldValue('deliveryItemIds', items.map(item => item.id))
      setDeliveryOptions(prev => {
        const merged = new Map(prev.map(item => [item.id, item]))
        items.forEach(item => merged.set(item.id, { id: item.id, itemNo: item.itemNo, title: item.title }))
        return [...merged.values()]
      })
      message.success(`已按任務歸入 ${items.length} 個交付項`)
    } catch {
      // request.ts 已统一弹后端失败原因（如任务不属于該需求），这里不双弹
    } finally {
      setResolvingScope(false)
    }
  }

  const searchExecutors = async (keyword: string) => {
    try {
      setExecutorOptions(await fetchEmployeeIdOptions(keyword))
    } catch { /* 下拉搜索失敗保持原選項，不打斷填寫 */ }
  }

  /**
   * 选定交付项后自动带一行空白用例，避免用户漏填。
   * <p>只在“完全没有用例”时补：用户已手工删改过的行不覆盖；换交付项时也不自动添加，
   * 避免下拉切来切去把已写好的标题冲掉。
   */
  const selectedKey = selectedItemIds.join(',')
  useEffect(() => {
    if (!selectedItemIds.length) return
    const current = form.getFieldValue('cases') as SubmitFormValues['cases']
    if (current && current.length > 0) return
    form.setFieldValue('cases', selectedItemIds.map((id: number) => ({ deliveryItemId: id })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey])

  const handleSubmit = async () => {
    let values: SubmitFormValues
    try {
      values = await form.validateFields()
    } catch {
      message.warning('請先補全提測表單帶 * 的必填項')
      return
    }
    if (!values.testLeadUserId) {
      message.warning('請選擇測試負責人')
      return
    }
    /*
     * 用例集不能为空：服务端受理时会拒绝空冻结用例集（受理即冻结，fail-closed）。
     * 前端先拦一道，避免用户一路填完提交、到受理才被拒，交付项已置 testing 后还得退回重来。
     */
    const cases = (values.cases ?? [])
      .filter(c => c && c.deliveryItemId && (c.caseTitle ?? '').trim())
      .map(c => ({ deliveryItemId: Number(c.deliveryItemId), caseTitle: (c.caseTitle ?? '').trim() }))
    if (!cases.length) {
      message.warning('請至少添加一條測試用例（受理時將凍結為必測用例集）')
      return
    }
    const payload: RdmTestBatchSubmitForm = {
      reqId: values.reqId,
      deliveryItemIds: values.deliveryItemIds,
      testEnv: values.testEnv,
      testLeadUserId: Number(values.testLeadUserId),
      testLeadUserName: leadName,
      executorUserIds: (values.executorUserIds ?? []).map(Number),
      planEndTime: values.planEndTime ? values.planEndTime.format('YYYY-MM-DD HH:mm:ss') : undefined,
      buildIds: (values.buildIds ?? []).map(b => (b.buildId ?? '').trim()).filter(Boolean),
      caseSnapshotJson: JSON.stringify(cases),
    }
    setSubmitting(true)
    try {
      await submitTestBatch(payload)
      message.success('提測批次已建立')
      navigate('/rdm-test')
    } catch {
      // request.ts 已统一弹后端返回的失败原因，这里再弹一次就是双弹（§G.4）
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="content-area">
      <RdmFormHeader
        title="發起提測"
        onBack={() => navigate('/rdm-test')}
        backText="返回工作台"
        meta="選擇需求與交付項、指派測試負責人與執行人、登記構建標識；提交後批次進入待接收，由 QA 受理並凍結用例集"
      />

      <Form
        form={form}
        layout="vertical"
        disabled={submitting}
        /* 構建標識默认给一行空行，避免用户先点「新增構建」才能填 */
        initialValues={{ buildIds: [{ buildId: '' }] }}
      >
        {/* ── 提測範圍 ── */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><AimOutlined /></span>
            提測範圍
            <span className="rdm-card-title-split" />
            <span className="rdm-todo-hint">{t('rdm.testBatchSubmit.scopeHint', { defaultValue: '勾選任務後自動帶出交付項；未拆交付項的任務歸入默認交付項' })}</span>
          </div>
          <div className="rdm-task-fields">
            <Form.Item
              label="關聯需求"
              name="reqId"
              rules={[{ required: true, message: '請選擇需求' }]}
            >
              <Select
                placeholder="搜索並選擇需求"
                showSearch
                optionFilterProp="label"
                onFocus={() => { void loadRequirements() }}
                onChange={value => { void handleReqChange(value as number) }}
                options={reqOptions}
                notFoundContent="輸入關鍵字可匹配需求"
              />
            </Form.Item>
            <Form.Item
              label="按任務交付（可選）"
              name="taskIds"
            >
              <Select
                mode="multiple"
                allowClear
                loading={resolvingScope}
                placeholder={reqOptions.length ? '先選需求，再勾要交付的任務' : '請先選擇關聯需求'}
                optionFilterProp="label"
                options={taskOptions}
                onChange={handleTaskChange}
              />
            </Form.Item>
            <Form.Item
              label="交付項（可多選）"
              name="deliveryItemIds"
              rules={[{ required: true, message: '請選擇交付項' }]}
            >
              <Select
                mode="multiple"
                placeholder={reqOptions.length ? '先選需求，再選本次要驗的交付項' : '請先選擇關聯需求'}
                optionFilterProp="label"
                options={deliveryOptions.map(d => ({ value: d.id, label: `${d.itemNo} ${d.title}` }))}
              />
            </Form.Item>
          </div>
        </div>

        {/* ── 測試安排 ── */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#FA8C16' }}><ScheduleOutlined /></span>
            測試安排
            <span className="rdm-card-title-split" />
            <span className="rdm-todo-hint">{t('rdm.testBatchSubmit.arrangeHint', { defaultValue: '負責人與執行人均從在職員工中搜索選擇' })}</span>
          </div>
          <div className="rdm-task-fields">
            <Form.Item label="測試環境" name="testEnv" rules={[{ required: true, message: '請選擇環境' }]}>
              <Select placeholder="選擇環境" options={TEST_ENV_OPTIONS} />
            </Form.Item>
            <Form.Item label="計劃結束時間" name="planEndTime">
              <DatePicker showTime style={{ width: '100%' }} placeholder="選擇日期時間" />
            </Form.Item>
            <Form.Item
              label="測試負責人"
              name="testLeadUserId"
              rules={[{ required: true, message: '請選擇測試負責人' }]}
            >
              <RemoteSearchSelect
                placeholder="輸入姓名/工號搜索在職員工"
                fetchOptions={fetchEmployeeIdOptions}
                onChange={(value, label) => { setLeadName(label?.split('(')[0] ?? '') }}
              />
            </Form.Item>
            {/* 全局表单规范 §C.4：常规字段一律占网格 1 列，与上方「測試環境」同宽对齐；
                多选人员不需要整行承载力，撑两列会与同排字段失衡（span2 只留给任务标题这类长文本） */}
            <Form.Item label="執行人員（可多選）" name="executorUserIds">
              <Select
                mode="multiple"
                placeholder="輸入姓名/工號搜索在職員工"
                showSearch
                filterOption={false}
                onSearch={searchExecutors}
                onFocus={() => { if (!executorOptions.length) void searchExecutors('') }}
                options={executorOptions}
              />
            </Form.Item>
          </div>
        </div>

        {/* ── 測試用例（受理時凍結為必測用例集，不可為空）── */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#F6FFED', color: '#52C41A' }}><ExperimentOutlined /></span>
            測試用例
            <span className="rdm-card-title-split" />
            <span className="rdm-todo-hint">{t('rdm.testBatchSubmit.casesHint', { defaultValue: '受理時凍結為必測用例集，逐條錄入結果' })}</span>
          </div>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="受理提測時本清單會凍結為必測用例集，測試負責人逐條錄入結果；提交後不可修改"
          />
          <Form.List name="cases">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  /* 与 §C.4 三列网格同宽：交付项占 1 列、用例标题长文本占 2 列、移除钮贴右 */
                  <div
                    key={key}
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', columnGap: 16, alignItems: 'start', marginBottom: 12 }}
                  >
                    <Form.Item
                      {...restField}
                      name={[name, 'deliveryItemId']}
                      style={{ marginBottom: 0 }}
                      rules={[{ required: true, message: '請選擇所屬交付項' }]}
                    >
                      <Select
                        placeholder="所屬交付項"
                        options={deliveryOptions
                          .filter(d => selectedItemIds.includes(d.id))
                          .map(d => ({ value: d.id, label: `${d.itemNo} ${d.title}` }))}
                      />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, 'caseTitle']}
                      style={{ marginBottom: 0, gridColumn: 'span 2' }}
                      rules={[{ required: true, message: '請輸入用例標題' }]}
                    >
                      <Input placeholder="用例標題，如：保存後列表即時刷新" maxLength={120} />
                    </Form.Item>
                    {fields.length > 1 && (
                      <Button
                        type="link"
                        size="small"
                        danger
                        icon={<MinusCircleOutlined />}
                        style={{ alignSelf: 'center' }}
                        onClick={() => remove(name)}
                      >
                        移除
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add({ deliveryItemId: selectedItemIds[0] })}
                  block
                >
                  新增用例
                </Button>
              </>
            )}
          </Form.List>
        </div>

        {/* ── 構建標識 ── */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><BuildOutlined /></span>
            構建標識
            <span className="rdm-card-title-split" />
            <span className="rdm-todo-hint">{t('rdm.testBatchSubmit.buildHint', { defaultValue: '選填；登記 CI/CD 構建產物標識便於回溯' })}</span>
          </div>
          <Form.List name="buildIds">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <div
                    key={key}
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', columnGap: 16, alignItems: 'start', marginBottom: 12 }}
                  >
                    <Form.Item {...restField} name={[name, 'buildId']} style={{ marginBottom: 0 }}>
                      <Input placeholder={`構建 ID ${name + 1}`} maxLength={64} />
                    </Form.Item>
                    {fields.length > 1 && (
                      <Button
                        type="link"
                        size="small"
                        danger
                        icon={<MinusCircleOutlined />}
                        style={{ alignSelf: 'center' }}
                        onClick={() => remove(name)}
                      >
                        移除
                      </Button>
                    )}
                  </div>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add({ buildId: '' })} block icon={<PlusOutlined />}>
                    新增構建
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </div>
      </Form>

      <div className="form-footer">
        <Button onClick={() => navigate('/rdm-test')}>取消</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>
          提交提測
        </Button>
      </div>
    </div>
  )
}
