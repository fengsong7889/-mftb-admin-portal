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
import { useCallback, useState } from 'react'
import { Button, DatePicker, Form, Input, Select, Space, message } from 'antd'
import {
  MinusCircleOutlined, PlusOutlined, SendOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import RdmFormHeader from './components/RdmFormHeader'
import RemoteSearchSelect from '../../components/RemoteSearchSelect'
import {
  fetchDeliveryItems,
  fetchReqTasks,
  fetchRequirementPage,
  resolveTestBatchTaskScope,
  submitTestBatch,
  type RdmTestBatchSubmitForm,
} from '../../api/rdm'
import { fetchEmployeeIdOptions } from '../../api/employee'
import { formatRdmReqNo } from '../../constants/rdm'

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
}

export default function TestBatchSubmit() {
  const navigate = useNavigate()
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
   * 需求清单：取研发交付范围内前 50 条本地模糊匹配。
   * <p>必须带 flowVersion=3：提测批次是 V3 分批交付专属入口，服务端准入会直接拒
   * flow_version != 3 的需求（「該需求非新版交付流程，無法使用提測批次」）。
   * 不在候选侧同源过滤，用户会在下拉里选得到、提交时被拒，两侧口径必须一致。
   */
  const loadRequirements = useCallback(async () => {
    if (reqOptions.length) return
    try {
      const res = await fetchRequirementPage({ size: 50, page: 1, scope: 'delivery', flowVersion: 3 })
      // reqNo 在认领前为 null（延迟发号），统一走占位文案，不渲染出 "null"
      setReqOptions((res.records ?? []).map(r => ({ value: r.id, label: `${formatRdmReqNo(r.reqNo)} ${r.title}` })))
    } catch {
      // request.ts 已统一弹后端错误，此处不双弹（§G.4）
    }
  }, [reqOptions.length])

  /** 换需求必须清空已选交付项/任务：它们属于需求，留着就是跨需求串数据 */
  const handleReqChange = async (reqId: number) => {
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
  }

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
    const payload: RdmTestBatchSubmitForm = {
      reqId: values.reqId,
      deliveryItemIds: values.deliveryItemIds,
      testEnv: values.testEnv,
      testLeadUserId: Number(values.testLeadUserId),
      testLeadUserName: leadName,
      executorUserIds: (values.executorUserIds ?? []).map(Number),
      planEndTime: values.planEndTime ? values.planEndTime.format('YYYY-MM-DD HH:mm:ss') : undefined,
      buildIds: (values.buildIds ?? []).map(b => (b.buildId ?? '').trim()).filter(Boolean),
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
          <div className="rdm-form-section-title">提測範圍</div>
          <div className="rdm-task-fields">
            <Form.Item
              label="關聯需求"
              name="reqId"
              className="rdm-field-full"
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
              className="rdm-field-full"
              extra="勾選任務後自動帶出交付項；未拆交付項的任務會歸入該需求的默認交付項"
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
              className="rdm-field-full"
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
          <div className="rdm-form-section-title">測試安排</div>
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

        {/* ── 構建標識 ── */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">構建標識</div>
          <Form.List name="buildIds">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item {...restField} name={[name, 'buildId']} style={{ marginBottom: 0 }}>
                      <Input placeholder={`構建 ID ${fields.length ? name + 1 : 1}`} style={{ width: 320 }} />
                    </Form.Item>
                    {fields.length > 1 && (
                      <Button
                        type="link"
                        size="small"
                        danger
                        icon={<MinusCircleOutlined />}
                        onClick={() => remove(name)}
                      >
                        移除
                      </Button>
                    )}
                  </Space>
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
