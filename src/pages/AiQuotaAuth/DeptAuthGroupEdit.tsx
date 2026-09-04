import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Switch, Tag, Tree, Select, message, Spin, Tooltip } from 'antd'
import type { TreeDataNode } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftOutlined, SaveOutlined, AppstoreOutlined, TeamOutlined, EyeOutlined, PoweroffOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import {
  fetchModels,
  fetchDeptOptions,
  getDeptAuthGroupById,
  createDeptAuthGroup,
  updateDeptAuthGroup,
  type AiModel,
  type DeptOption,
  type ModelConfigItem,
  type DeptAuthGroupDetail,
} from '../../api'

/* ────────────────── 能力常量 ────────────────── */

/** 能力字段（与 AiModel / ModelAuthState 的能力键一致） */
type CapabilityKey = 'visionSupport' | 'functionCalling' | 'jsonMode' | 'streaming' | 'thinkingMode'

const CAPABILITY_FIELDS: { key: CapabilityKey; label: string; color: string; tip: string }[] = [
  { key: 'visionSupport', label: '視覺理解', color: '#722ED1', tip: '模型可理解圖片內容' },
  { key: 'functionCalling', label: '工具調用', color: '#1890FF', tip: '模型可調用外部工具/API' },
  { key: 'jsonMode', label: 'JSON 模式', color: '#13C2C2', tip: '模型可輸出結構化 JSON' },
  { key: 'streaming', label: '流式響應', color: '#52C41A', tip: '模型支持逐字輸出' },
  { key: 'thinkingMode', label: '思考模式', color: '#E8720C', tip: '模型支持深度推理' },
]

const MODEL_TYPE_TAG: Record<string, string> = {
  chat: 'processing', completion: 'blue', embedding: 'purple', token_count: 'default',
}
const MODEL_TYPE_LABEL: Record<string, string> = {
  chat: '對話', completion: '文本生成', embedding: '向量嵌入', token_count: 'Token 計數',
}

/** 模型授權配置狀態（加入列表即視為授權，包含能力開關） */
interface ModelAuthState {
  modelId: number
  visionSupport: number
  functionCalling: number
  jsonMode: number
  streaming: number
  thinkingMode: number
}

/** 部門樹節點 */
interface DeptTreeNode {
  value: number
  title: string
  deptCode: string
  deptName: string
  children?: DeptTreeNode[]
}

/** 判断模型本身是否支持某能力 */
const modelSupports = (model: AiModel, key: CapabilityKey): boolean => (model[key] ?? 0) === 1

/** 由扁平部門列表構建樹（依據 parentId），標題含編碼便於區分重名部門 */
const buildDeptTree = (list: DeptOption[]): DeptTreeNode[] => {
  const map = new Map<number, DeptTreeNode>()
  list.forEach((d) => {
    map.set(d.deptId, {
      value: d.deptId,
      title: `${d.deptName}（${d.deptCode ?? '-'}）`,
      deptCode: d.deptCode ?? '',
      deptName: d.deptName,
      children: [],
    })
  })
  const roots: DeptTreeNode[] = []
  list.forEach((d) => {
    const node = map.get(d.deptId)!
    const pid = d.parentId
    if (pid != null && map.has(pid)) map.get(pid)!.children!.push(node)
    else roots.push(node)
  })
  const prune = (n: DeptTreeNode) => {
    if (!n.children || n.children.length === 0) delete n.children
    else n.children.forEach(prune)
  }
  roots.forEach(prune)
  return roots
}

export default function DeptAuthGroupEdit() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const groupId = searchParams.get('id')
  const isEdit = !!groupId

  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  /* ── 基礎數據 ── */
  const [models, setModels] = useState<AiModel[]>([])
  const [deptOptions, setDeptOptions] = useState<DeptOption[]>([])
  const [selectedDeptIds, setSelectedDeptIds] = useState<number[]>([])
  const [deptSearchKw, setDeptSearchKw] = useState('')
  const [modelAuths, setModelAuths] = useState<ModelAuthState[]>([])
  const [detail, setDetail] = useState<DeptAuthGroupDetail | null>(null)

  /**
   * 一次性加載：模型列表 + 部門選項 +（編輯模式）策略詳情。
   * 合併為單個 effect 以避免「詳情先於模型返回」導致模型授權回填丟失的競態。
   */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchModels({ status: 1 }),
      fetchDeptOptions(),
      groupId ? getDeptAuthGroupById(Number(groupId)) : Promise.resolve(null),
    ])
      .then(([modelList, depts, detailData]) => {
        if (cancelled) return
        setModels(modelList)
        setDeptOptions(depts)

        if (detailData) {
          setDetail(detailData)
          form.setFieldsValue({
            name: detailData.name,
            dataResidency: detailData.dataResidency,
            status: detailData.status,
          })
          setSelectedDeptIds(detailData.departments.map((d) => d.deptId))
        }

        // 編輯模式回填已授權模型；新增模式為空（由用戶自行添加）
        setModelAuths((detailData?.modelConfigs ?? []).map((c) => {
          const m = modelList.find((x) => x.id === c.modelId)
          const cap = (key: CapabilityKey, saved: number): number =>
            (m && !modelSupports(m, key)) ? 0 : saved
          return {
            modelId: c.modelId,
            visionSupport: cap('visionSupport', c.visionSupport),
            functionCalling: cap('functionCalling', c.functionCalling),
            jsonMode: cap('jsonMode', c.jsonMode),
            streaming: cap('streaming', c.streaming),
            thinkingMode: cap('thinkingMode', c.thinkingMode),
          }
        }))
      })
      .catch(() => { if (!cancelled) message.error('加載數據失敗') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [groupId, form])

  /** 模型 id → 模型對象 */
  const modelMap = useMemo(() => new Map(models.map((m) => [m.id, m])), [models])

  /** 數據不出域是否開啟（開啟後僅可授權私有化部署模型） */
  const residencyOn = Form.useWatch('dataResidency', form) === 1

  /** 部門樹數據 */
  const deptTree = useMemo(() => buildDeptTree(deptOptions), [deptOptions])

  /** 部門樹默認展開鍵：僅根節點（二級部門默認折疊，避免撐高頁面） */
  const deptRootKeys = useMemo(() => deptTree.map((n) => n.value), [deptTree])

  /** 尚未添加的模型（供「添加模型」下拉；數據不出域開啟時僅私有化模型） */
  const availableModelOptions = useMemo(
    () => models
      .filter((m) => !modelAuths.some((a) => a.modelId === m.id))
      .filter((m) => !residencyOn || m.deployType === 'private')
      .map((m) => ({
        value: m.id,
        label: `${m.name}${m.type ? `（${MODEL_TYPE_LABEL[m.type] || m.type}）` : ''}`,
      })),
    [models, modelAuths, residencyOn],
  )

  /* ── 添加 / 移除模型 ── */
  const handleAddModel = (modelId: number) => {
    const m = modelMap.get(modelId)
    if (!m) return
    setModelAuths((prev) => [...prev, {
      modelId,
      visionSupport: modelSupports(m, 'visionSupport') ? 1 : 0,
      functionCalling: modelSupports(m, 'functionCalling') ? 1 : 0,
      jsonMode: modelSupports(m, 'jsonMode') ? 1 : 0,
      streaming: modelSupports(m, 'streaming') ? 1 : 0,
      thinkingMode: modelSupports(m, 'thinkingMode') ? 1 : 0,
    }])
  }

  const handleRemoveModel = (modelId: number) => {
    setModelAuths((prev) => prev.filter((a) => a.modelId !== modelId))
  }

  /** 數據不出域開關：開啟時自動移除已添加的公有云模型 */
  const handleResidencyToggle = (checked: boolean) => {
    if (!checked) return
    const removed = modelAuths.filter((a) => modelMap.get(a.modelId)?.deployType !== 'private')
    if (removed.length > 0) {
      setModelAuths((prev) => prev.filter((a) => modelMap.get(a.modelId)?.deployType === 'private'))
      message.warning(`已開啟數據不出域，自動移除 ${removed.length} 個公有云模型`)
    }
  }

  /* ── 能力開關 ── */
  const handleCapabilityToggle = (
    modelId: number,
    field: CapabilityKey,
    value: number,
  ) => {
    setModelAuths((prev) => prev.map((a) => a.modelId === modelId ? { ...a, [field]: value } : a))
  }

  /* ── 保存 ── */
  const handleSave = async () => {
    const values = await form.validateFields()

    if (selectedDeptIds.length === 0) {
      message.warning('請至少選擇一個部門')
      return
    }
    if (modelAuths.length === 0) {
      message.warning('請至少添加一個授權模型')
      return
    }

    const modelConfigs: ModelConfigItem[] = modelAuths.map((a) => {
      const model = modelMap.get(a.modelId)
      const cap = (key: CapabilityKey): number => (model && modelSupports(model, key) ? a[key] : 0)
      return {
        modelId: a.modelId,
        visionSupport: cap('visionSupport'),
        functionCalling: cap('functionCalling'),
        jsonMode: cap('jsonMode'),
        streaming: cap('streaming'),
        thinkingMode: cap('thinkingMode'),
      }
    })

    const payload = {
      name: values.name,
      dataResidency: values.dataResidency ?? 0,
      status: values.status ?? 1,
      deptIds: selectedDeptIds,
      modelConfigs,
      updatedBy: 'admin',
    }

    setSaving(true)
    try {
      if (isEdit && groupId) {
        await updateDeptAuthGroup(Number(groupId), payload)
        message.success('策略已保存')
      } else {
        await createDeptAuthGroup(payload)
        message.success('策略已創建')
      }
      navigate('/ai-dept-model-auth')
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => navigate('/ai-dept-model-auth')

  const selectedEmployeeCount = deptOptions
    .filter((d) => selectedDeptIds.includes(d.deptId))
    .reduce((s, d) => s + d.employeeCount, 0)

  if (loading && !models.length && !isEdit) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="content-area">
      {/* 頁面頭部（全局統一：橙色頂條 + 橙色返回按鈕） */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8,
                height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEdit ? '編輯模型授權-部門' : '新增模型授權-部門'}
            </h2>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical">
        {/* ═══ 分区 1：基础信息 ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基础信息</span>
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>可编辑</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="name" label="策略名稱" rules={[{ required: true, message: '請輸入策略名稱' }]}>
              <Input placeholder="如：研發通用、門店標準配置" maxLength={50} />
            </Form.Item>
          </div>
        </div>

        {/* ═══ 分区 2：适用部门（树状 + 编码 + 编码搜索） ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TeamOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>適用部門</span>
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>穿梭框 · 樹結構</Tag>
            <Tooltip title="左側按組織層級樹狀展示，勾選部門後點擊箭頭移至右側；重名部門可通過層級與編碼區分">
              <span style={{ fontSize: 12, color: '#8C8C8C', cursor: 'help' }}>穿梭框 · 含編碼</span>
            </Tooltip>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          {/* 穿梭框：左側樹結構 + 右側已選列表 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            {/* 左側：部門樹 */}
            <div style={{
              flex: 1, border: '1px solid #d9d9d9', borderRadius: 8,
              display: 'flex', flexDirection: 'column', height: 360,
            }}>
              <div style={{
                padding: '10px 16px', borderBottom: '1px solid #f0f0f0',
                background: '#fafafa', borderRadius: '8px 8px 0 0',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>
                  可選部門（{deptOptions.length}）
                </span>
                <a
                  onClick={() => setSelectedDeptIds(deptOptions.map((d) => d.deptId))}
                  style={{ fontSize: 12 }}
                >全選</a>
              </div>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
                <Input
                  placeholder="搜索部門名稱或編碼"
                  allowClear
                  size="small"
                  value={deptSearchKw}
                  onChange={(e) => setDeptSearchKw(e.target.value)}
                />
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '8px 4px' }}>
                <Tree
                  checkable
                  defaultExpandedKeys={deptRootKeys}
                  checkedKeys={selectedDeptIds}
                  onCheck={(keys) => setSelectedDeptIds(keys as number[])}
                  treeData={deptTree as unknown as TreeDataNode[]}
                  fieldNames={{ key: 'value', title: 'title', children: 'children' }}
                  filterTreeNode={(node) => {
                    if (!deptSearchKw) return false
                    const kw = deptSearchKw.toLowerCase()
                    const n = node as unknown as DeptTreeNode
                    return (n.deptCode ?? '').toLowerCase().includes(kw) || (n.deptName ?? '').toLowerCase().includes(kw)
                  }}
                />
              </div>
            </div>

            {/* 中间：操作按钮 */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
              <Button
                type="primary"
                size="small"
                icon={<span style={{ fontSize: 16 }}>›</span>}
                onClick={() => setSelectedDeptIds(deptOptions.map((d) => d.deptId))}
                disabled={selectedDeptIds.length === deptOptions.length}
                style={{ backgroundColor: '#E8720C', borderColor: '#E8720C' }}
              />
              <Button
                size="small"
                icon={<span style={{ fontSize: 16 }}>‹</span>}
                onClick={() => setSelectedDeptIds([])}
                disabled={selectedDeptIds.length === 0}
              />
            </div>

            {/* 右側：已選部門 */}
            <div style={{
              flex: 1, border: '1px solid #d9d9d9', borderRadius: 8,
              display: 'flex', flexDirection: 'column', height: 360,
            }}>
              <div style={{
                padding: '10px 16px', borderBottom: '1px solid #f0f0f0',
                background: '#fafafa', borderRadius: '8px 8px 0 0',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>
                  已選部門（{selectedDeptIds.length}）
                </span>
                <a onClick={() => setSelectedDeptIds([])} style={{ fontSize: 12 }}>清空</a>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                {selectedDeptIds.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#BFBFBF', padding: '40px 0', fontSize: 13 }}>
                    請從左側選擇部門
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selectedDeptIds.map((id) => {
                      const dept = deptOptions.find((d) => d.deptId === id)
                      if (!dept) return null
                      return (
                        <Tag
                          key={id}
                          closable
                          onClose={() => setSelectedDeptIds((prev) => prev.filter((x) => x !== id))}
                          style={{ fontSize: 12, margin: 0 }}
                        >
                          {dept.deptName}（{dept.deptCode ?? '-'}）
                        </Tag>
                      )
                    })}
                  </div>
                )}
              </div>
              <div style={{
                padding: '8px 16px', borderTop: '1px solid #f0f0f0', background: '#fafafa',
                borderRadius: '0 0 8px 8px', fontSize: 12, color: '#595959',
              }}>
                共 <strong>{selectedDeptIds.length}</strong> 個部門，<strong>{selectedEmployeeCount}</strong> 人
              </div>
            </div>
          </div>
        </div>

        {/* ═══ 分区 3：模型授权配置（用户自行添加） ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f9f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EyeOutlined style={{ fontSize: 14, color: '#722ED1' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>模型授權配置</span>
            <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>可编辑</Tag>
            <Tooltip title="模型來自「模型信息」中已啟用的真實模型；按需添加，添加一個展示一個，避免模型過多佔用空間">
              <span style={{ fontSize: 12, color: '#8C8C8C', cursor: 'help' }}>按需添加模型</span>
            </Tooltip>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          {/* 數據不出域：開啟後僅可授權私有化部署模型 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
            background: '#F9F0FF', borderRadius: 6, border: '1px solid #D3ADF7', marginBottom: 16,
          }}>
            <Form.Item name="dataResidency" noStyle valuePropName="checked"
              getValueFromEvent={(checked) => checked ? 1 : 0}
              getValueProps={(value) => ({ checked: value === 1 })}>
              <Switch size="small" onChange={handleResidencyToggle} />
            </Form.Item>
            <span style={{ fontSize: 13, color: '#722ED1', fontWeight: 500 }}>數據不出域</span>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>
              開啟後僅可選擇私有化部署模型，已添加的公有云模型將被自動移除
            </span>
          </div>

          {/* 添加模型 */}
          <div style={{ marginBottom: 16 }}>
            <Select
              showSearch
              placeholder="選擇要授權的模型（添加一個、展示一個）"
              value={undefined}
              onChange={handleAddModel}
              optionFilterProp="label"
              options={availableModelOptions}
              notFoundContent={residencyOn ? '暫無私有化部署模型可添加（請到「模型信息」將模型部署類型標記為私有化）' : '所有已啟用模型均已添加'}
              style={{ width: '100%' }}
              suffixIcon={<PlusOutlined />}
            />
          </div>

          {modelAuths.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#8C8C8C', fontSize: 13, background: '#FAFAFA', borderRadius: 8, border: '1px dashed #D9D9D9' }}>
              尚未添加任何模型，請從上方下拉框選擇模型進行授權
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              {modelAuths.map((auth) => {
                const model = modelMap.get(auth.modelId)
                if (!model) return null
                return (
                  <div key={auth.modelId} style={{
                    border: '1px solid #D3ADF7', borderRadius: 10, padding: '16px',
                    background: '#F9F0FF', transition: 'all 0.25s',
                  }}>
                    {/* 模型头部 + 移除 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: '#262626' }}>{model.name}</span>
                        {model.type && (
                          <Tag color={MODEL_TYPE_TAG[model.type]} style={{ fontSize: 11 }}>
                            {MODEL_TYPE_LABEL[model.type] || model.type}
                          </Tag>
                        )}
                        <Tag color={model.deployType === 'private' ? 'purple' : 'default'} style={{ fontSize: 11 }}>
                          {model.deployType === 'private' ? '私有化' : '公有云'}
                        </Tag>
                      </div>
                      <Button type="link" danger size="small" icon={<DeleteOutlined />}
                        onClick={() => handleRemoveModel(auth.modelId)}>移除</Button>
                    </div>

                    {/* 能力开关 */}
                    <div style={{ borderTop: '1px solid #E8D5F5', paddingTop: 12 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {CAPABILITY_FIELDS.map(({ key, label, color, tip }) => {
                          const supported = modelSupports(model, key)
                          return (
                            <Tooltip key={key} title={supported ? tip : `該模型本身不支持「${label}」，無法開放給部門用戶`}>
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '4px 10px', borderRadius: 6,
                                background: !supported ? '#FAFAFA' : (auth[key] ? `${color}0A` : '#F5F5F5'),
                                border: `1px solid ${!supported ? '#F0F0F0' : (auth[key] ? color + '30' : '#E8E8E8')}`,
                                opacity: supported ? 1 : 0.65,
                                transition: 'all 0.2s',
                              }}>
                                <span style={{ fontSize: 12, color: supported ? '#595959' : '#BFBFBF', whiteSpace: 'nowrap' }}>{label}</span>
                                <Switch
                                  size="small"
                                  disabled={!supported}
                                  checked={supported && !!auth[key]}
                                  unCheckedChildren={supported ? undefined : '不支持'}
                                  onChange={(checked) => handleCapabilityToggle(auth.modelId, key, checked ? 1 : 0)}
                                />
                              </div>
                            </Tooltip>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 12, color: '#8C8C8C' }}>
            已授權 <strong style={{ color: '#722ED1' }}>{modelAuths.length}</strong> 個模型
          </div>
        </div>

        {/* ═══ 分区 4：状态配置 ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PoweroffOutlined style={{ fontSize: 14, color: '#E8720C' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>状态配置</span>
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>可编辑</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ background: '#FFF7E6', padding: 16, borderRadius: 8, border: '1px solid #FFE7BA' }}>
            <Form.Item
              name="status"
              label="啟用狀態"
              valuePropName="checked"
              getValueFromEvent={(checked) => checked ? 1 : 0}
              getValueProps={(value) => ({ checked: value === 1 })}
              style={{ marginBottom: 0 }}
              initialValue={1}
              extra="停用後該策略關聯的部門將失去模型授權配置"
            >
              <Switch checkedChildren="啟用" unCheckedChildren="停用" />
            </Form.Item>
          </div>
        </div>
      </Form>

      {/* 底部操作按鈕 */}
      <div className="form-footer">
        <Button onClick={handleBack}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
          保存
        </Button>
      </div>
    </div>
  )
}
