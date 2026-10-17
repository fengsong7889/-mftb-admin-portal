/**
 * 創建發布批次 —— 独立表单页（替代原发布中心内的「創建發布批次」弹窗）
 *
 * 为什么是独立页而不是 Modal：AGENTS.md §9.1 明确禁止用弹窗承载新增/编辑/详情；
 * 本表单还带「部署系统清单」动态子表，弹窗 780px 宽度下已经挤到需要横向滚动。
 *
 * 变更影响：仅前端；接口沿用 POST /rdm/release-batch（createReleaseBatch），契约零改动。
 * 安全边界：权限由后端 @RequirePermission(menu=rdm-delivery-release, action=create) 兜底；
 * 发布负责人取员工下拉的 sys_user.id（不接受手填 ID）；创建只是建立批次，
 * 真正的发布放行仍必须过测试/验收/缺陷/依赖/范围全部硬门禁与四眼（§6.3），本页不做任何门禁判断。
 * 校验顺序：validateFields → 组装 payload → 调 API（§B.3 禁止先弹后校验）。
 */
import { useCallback, useState } from 'react'
import { Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, message } from 'antd'
import {
  MinusCircleOutlined, PlusOutlined, SendOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import RdmFormHeader from './components/RdmFormHeader'
import RemoteSearchSelect from '../../components/RemoteSearchSelect'
import {
  createReleaseBatch,
  fetchDeliveryItems,
  fetchProjectPage,
  type RdmDeliveryItemListItem,
  type RdmProjectListItem,
  type RdmReleaseBatchCreateForm,
} from '../../api/rdm'
import { fetchEmployeeIdOptions } from '../../api/employee'

/** 表单值形状 */
interface CreateFormValues {
  versionTag: string
  projectId?: number
  releaseOwnerUserId?: string
  planTime?: dayjs.Dayjs
  deliveryItemIds?: number[]
  deployments?: { systemCode?: string; systemName?: string; buildId?: string; deployOrder?: number }[]
}

export default function ReleaseBatchCreate() {
  const navigate = useNavigate()
  const [form] = Form.useForm<CreateFormValues>()
  const [saving, setSaving] = useState(false)

  const [projects, setProjects] = useState<RdmProjectListItem[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [deliveryItems, setDeliveryItems] = useState<RdmDeliveryItemListItem[]>([])
  /** 发布负责人姓名：DTO 要 userId + userName 两列，用户名从下拉 label 取，不让用户手填 */
  const [ownerName, setOwnerName] = useState('')

  /** 项目清单懒加载：进入页面不一定立刻选项目，但下拉展开即要能看到候选 */
  const loadProjects = useCallback(async () => {
    if (projectsLoaded) return
    try {
      const res = await fetchProjectPage({ pageSize: 200 })
      setProjects(res.records ?? [])
      setProjectsLoaded(true)
    } catch {
      // request.ts 已统一弹后端错误，此处不双弹（§G.4）
    }
  }, [projectsLoaded])

  /** 换项目必须清空已选交付项：交付项属于项目，留着就是跨项目串数据 */
  const handleProjectChange = async (projectId: number | undefined) => {
    form.setFieldValue('deliveryItemIds', [])
    if (!projectId) {
      setDeliveryItems([])
      return
    }
    try {
      const res = await fetchDeliveryItems({ projectId, pageSize: 200 })
      setDeliveryItems(res.records ?? [])
    } catch {
      setDeliveryItems([])
    }
  }

  const handleSubmit = async () => {
    let values: CreateFormValues
    try {
      values = await form.validateFields()
    } catch {
      message.warning('請先補全發布批次帶 * 的必填項')
      return
    }
    if (!values.releaseOwnerUserId) {
      message.warning('請選擇發布負責人')
      return
    }
    const data: RdmReleaseBatchCreateForm = {
      versionTag: values.versionTag.trim(),
      projectId: values.projectId,
      releaseOwnerUserId: Number(values.releaseOwnerUserId),
      releaseOwnerUserName: ownerName,
      planTime: values.planTime ? values.planTime.format('YYYY-MM-DDTHH:mm:ss') : undefined,
      deliveryItemIds: values.deliveryItemIds,
      deployments: (values.deployments ?? []).map((d, i) => ({
        systemCode: (d.systemCode ?? '').trim(),
        systemName: d.systemName,
        buildId: d.buildId,
        deployOrder: d.deployOrder ?? i + 1,
      })).filter(d => d.systemCode),
    }
    /*
     * 发布批次一旦创建就会进入放行门禁与四眼裁决链路，按 §B.3 必须二次确认；
     * 顺序固定为「校验 → 弹确认框 → 调接口」，确认框里把范围与部署清单数量摊开给人看。
     */
    const confirmed = await new Promise<boolean>(resolve => {
      Modal.confirm({
        title: '確認創建發布批次？',
        className: 'custom-confirm-modal',
        icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
        content: (
          <div className="confirm-info-card">
            <div className="confirm-info-row"><span>版本標識：</span><b>{data.versionTag}</b></div>
            <div className="confirm-info-row"><span>發布負責人：</span><b>{data.releaseOwnerUserName || data.releaseOwnerUserId}</b></div>
            <div className="confirm-info-row"><span>交付項數：</span><b>{(data.deliveryItemIds ?? []).length}</b></div>
            <div className="confirm-info-row"><span>部署系統數：</span><b>{data.deployments.length}</b></div>
            <div className="confirm-info-row"><span>計劃發布：</span><b>{data.planTime ?? '未填'}</b></div>
          </div>
        ),
        okText: '確認創建',
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
      await createReleaseBatch(data)
      message.success('發布批次創建成功')
      navigate('/rdm-release')
    } catch {
      // request.ts 已统一弹后端返回的失败原因，这里再弹一次就是双弹（§G.4）
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content-area">
      <RdmFormHeader
        title="創建發布批次"
        onBack={() => navigate('/rdm-release')}
        backText="返回發布中心"
        meta="登記版本標識、發布負責人與部署系統清單；創建只建立批次容器，能否發布一律由發布詳情頁的硬門禁與四眼複核決定"
      />

      <Form
        form={form}
        layout="vertical"
        disabled={saving}
        /* 默认给一行空行，避免用户先点「添加部署系統」才能填 */
        initialValues={{ deployments: [{}] }}
      >
        {/* ── 基本信息 ── */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">基本信息</div>
          <div className="rdm-task-fields">
            <Form.Item
              label="版本標識"
              name="versionTag"
              rules={[
                { required: true, message: '請輸入版本標識' },
                { max: 64, message: '不超過 64 字' },
              ]}
            >
              <Input placeholder="例如 v2.1.0" maxLength={64} allowClear />
            </Form.Item>
            <Form.Item label="關聯項目" name="projectId">
              <Select
                placeholder="選擇項目（選後帶出交付項）"
                allowClear
                showSearch
                optionFilterProp="label"
                onFocus={() => { void loadProjects() }}
                onChange={value => { void handleProjectChange(value as number | undefined) }}
                options={projects.map(p => ({ value: p.id, label: `${p.projectNo} - ${p.name}` }))}
              />
            </Form.Item>
            <Form.Item
              label="發布負責人"
              name="releaseOwnerUserId"
              rules={[{ required: true, message: '請選擇發布負責人' }]}
            >
              <RemoteSearchSelect
                placeholder="輸入姓名/工號搜索在職員工"
                fetchOptions={fetchEmployeeIdOptions}
                onChange={(value, label) => { setOwnerName(label?.split('(')[0] ?? '') }}
              />
            </Form.Item>
            <Form.Item label="計劃發布時間" name="planTime">
              <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} placeholder="選擇計劃時間" />
            </Form.Item>
            <Form.Item label="交付項（可多選）" name="deliveryItemIds" className="rdm-field-span2">
              <Select
                mode="multiple"
                placeholder={projects.length ? '選擇本次要隨版本發布的交付項' : '可先選擇關聯項目再挑交付項'}
                allowClear
                optionFilterProp="label"
                options={deliveryItems.map(d => ({ value: d.id, label: `${d.itemNo} - ${d.title}` }))}
              />
            </Form.Item>
          </div>
        </div>

        {/* ── 部署系統清單（动态子表） ── */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">部署系統清單</div>
          <Form.List name="deployments">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item
                      {...restField}
                      name={[name, 'systemCode']}
                      rules={[{ required: true, message: '系統編碼必填' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input placeholder="系統編碼" style={{ width: 160 }} />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'systemName']} style={{ marginBottom: 0 }}>
                      <Input placeholder="系統名稱" style={{ width: 160 }} />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'buildId']} style={{ marginBottom: 0 }}>
                      <Input placeholder="構建標識" style={{ width: 160 }} />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'deployOrder']} style={{ marginBottom: 0 }}>
                      <InputNumber placeholder="順序" min={1} style={{ width: 90 }} />
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
                  <Button type="dashed" onClick={() => add({})} block icon={<PlusOutlined />}>
                    添加部署系統
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </div>
      </Form>

      <div className="form-footer">
        <Button onClick={() => navigate('/rdm-release')}>取消</Button>
        <Button type="primary" icon={<SendOutlined />} loading={saving} onClick={handleSubmit}>
          創建批次
        </Button>
      </div>
    </div>
  )
}
