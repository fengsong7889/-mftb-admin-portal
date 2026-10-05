import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Switch, Tag, Tree, Select, message, Tooltip } from 'antd'
import type { TreeDataNode } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TeamOutlined, EyeOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
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
import { EditPageHeader, SectionCard, StatusConfigSection, FormFooter, LoadingSpinner, BasicInfoFormSection } from './components'
import { useTranslation } from 'react-i18next'

/* ────────────────── 能力常量 ────────────────── */

/** 能力字段（与 AiModel / ModelAuthState 的能力键一致） */
type CapabilityKey = 'visionSupport' | 'functionCalling' | 'jsonMode' | 'streaming' | 'thinkingMode'

const CAPABILITY_FIELDS: { key: CapabilityKey; labelKey: string; color: string; tipKey: string }[] = [
  { key: 'visionSupport', labelKey: 'capVision', color: '#722ED1', tipKey: 'capVisionTip' },
  { key: 'functionCalling', labelKey: 'capFuncCall', color: '#1890FF', tipKey: 'capFuncCallTip' },
  { key: 'jsonMode', labelKey: 'capJson', color: '#13C2C2', tipKey: 'capJsonTip' },
  { key: 'streaming', labelKey: 'capStream', color: '#52C41A', tipKey: 'capStreamTip' },
  { key: 'thinkingMode', labelKey: 'capThink', color: '#E8720C', tipKey: 'capThinkTip' },
]

const MODEL_TYPE_TAG: Record<string, string> = {
  chat: 'processing', completion: 'blue', embedding: 'purple', token_count: 'default',
}
const MODEL_TYPE_LABEL_KEYS: Record<string, string> = {
  chat: 'typeChat', completion: 'typeCompletion', embedding: 'typeEmbedding', token_count: 'typeTokenCount',
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
  disabled?: boolean
  children?: DeptTreeNode[]
}

/** 判断模型本身是否支持某能力 */
const modelSupports = (model: AiModel, key: CapabilityKey): boolean => (model[key] ?? 0) === 1

/** 由扁平部門列表構建樹（依據 parentId），標題含編碼便於區分重名部門；已選部門標記 disabled */
const buildDeptTree = (list: DeptOption[], selectedIds: number[]): DeptTreeNode[] => {
  const selectedSet = new Set(selectedIds)
  const map = new Map<number, DeptTreeNode>()
  list.forEach((d) => {
    map.set(d.deptId, {
      value: d.deptId,
      title: `${d.deptName}（${d.deptCode ?? '-'}）`,
      deptCode: d.deptCode ?? '',
      deptName: d.deptName,
      disabled: selectedSet.has(d.deptId),
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
  const { t } = useTranslation()
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
  /** 左侧树勾选的部门（待确认，点击箭头后才移入右侧） */
  const [checkedDeptIds, setCheckedDeptIds] = useState<number[]>([])
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
            description: detailData.description,
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
      .catch(() => { if (!cancelled) message.error(t('aiQuotaAuth.loadDataFailed')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [groupId, form])

  /** 模型 id → 模型對象 */
  const modelMap = useMemo(() => new Map(models.map((m) => [m.id, m])), [models])

  /** 數據不出域是否開啟（開啟後僅可授權私有化部署模型） */
  const residencyOn = Form.useWatch('dataResidency', form) === 1

  /** 部門樹數據（已選部門標記 disabled，防止重複勾選） */
  const deptTree = useMemo(() => buildDeptTree(deptOptions, selectedDeptIds), [deptOptions, selectedDeptIds])

  /** 部門樹默認展開鍵：僅根節點（二級部門默認折疊，避免撐高頁面） */
  const deptRootKeys = useMemo(() => deptTree.map((n) => n.value), [deptTree])

  /** 尚未添加的模型（供「添加模型」下拉；數據不出域開啟時僅私有化模型） */
  const availableModelOptions = useMemo(
    () => models
      .filter((m) => !modelAuths.some((a) => a.modelId === m.id))
      .filter((m) => !residencyOn || m.deployType === 'private')
      .map((m) => ({
        value: m.id,
        label: `${m.name}${m.type ? `（${t('aiQuotaAuth.' + (MODEL_TYPE_LABEL_KEYS[m.type] || '')) || m.type}）` : ''}`,
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
      message.warning(t('aiQuotaAuth.residencyAutoRemoved', { count: removed.length }))
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
      message.warning(t('aiQuotaAuth.selectDeptWarning'))
      return
    }
    if (modelAuths.length === 0) {
      message.warning(t('aiQuotaAuth.addModelWarning'))
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
      description: (values.description ?? '') as string,
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
        message.success(t('aiQuotaAuth.strategySaved'))
      } else {
        await createDeptAuthGroup(payload)
        message.success(t('aiQuotaAuth.strategyCreated'))
      }
      navigate('/ai-dept-model-auth')
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('aiQuotaAuth.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => navigate('/ai-dept-model-auth')

  const selectedEmployeeCount = deptOptions
    .filter((d) => selectedDeptIds.includes(d.deptId))
    .reduce((s, d) => s + d.employeeCount, 0)

  if (loading && !models.length && !isEdit) {
    return <LoadingSpinner />
  }

  return (
    <div className="content-area">
      {/* 頁面頭部 */}
      <EditPageHeader
        title={t(isEdit ? 'aiQuotaAuth.editModelAuthDept' : 'aiQuotaAuth.addModelAuthDept')}
        onBack={handleBack}
      />

      <Form form={form} layout="vertical">
        {/* ═══ 分区 1：基础信息 ═══ */}
        <BasicInfoFormSection namePlaceholder={t('aiQuotaAuth.strategyNamePh3')} descPlaceholder={t('aiQuotaAuth.descPh')} />

        {/* ═══ 分区 2：适用部门 ═══ */}
        <SectionCard
          header={{
            icon: <TeamOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
            iconBg: '#e6f7ff',
            title: t('aiQuotaAuth.applicableDeptSection'),
            tag: t('aiQuotaAuth.transferTreeTag'),
            tagColor: 'blue',
            note: t('aiQuotaAuth.transferWithCode'),
            tooltip: t('aiQuotaAuth.deptAuthGroupTooltip'),
          }}
        >

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
                  {t('aiQuotaAuth.availableDepts')}（{deptOptions.length}）
                </span>
                <a
                  onClick={() => {
                    // 全选：将所有未入选的部门加入勾选
                    const unchecked = deptOptions.map((d) => d.deptId).filter((id) => !selectedDeptIds.includes(id))
                    setCheckedDeptIds(unchecked)
                  }}
                  style={{ fontSize: 12 }}
                >{t('aiQuotaAuth.selectAll')}</a>
              </div>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
                <Input
                  placeholder={t('aiQuotaAuth.searchDeptPh')}
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
                  checkedKeys={checkedDeptIds}
                  onCheck={(keys) => {
                    // 過濾已選部門，避免 disabled 節點殘留在 checkedDeptIds 中
                    const raw = Array.isArray(keys) ? keys : keys.checked
                    setCheckedDeptIds((raw as number[]).filter((id) => !selectedDeptIds.includes(id)))
                  }}
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
                onClick={() => {
                  // 將勾選部門移入右側（去重 + 過濾已選）
                  const newIds = checkedDeptIds.filter((id) => !selectedDeptIds.includes(id))
                  if (newIds.length === 0) {
                    message.warning(t('aiQuotaAuth.deptAlreadyAdded'))
                    setCheckedDeptIds([])
                    return
                  }
                  const skipped = checkedDeptIds.length - newIds.length
                  setSelectedDeptIds((prev) => [...new Set([...prev, ...newIds])])
                  setCheckedDeptIds([])
                  if (skipped > 0) message.warning(t('aiQuotaAuth.deptSkipped', { count: skipped }))
                }}
                disabled={checkedDeptIds.length === 0}
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
                  {t('aiQuotaAuth.selectedDepts')}（{selectedDeptIds.length}）
                </span>
                <a onClick={() => setSelectedDeptIds([])} style={{ fontSize: 12 }}>{t('aiQuotaAuth.clearBtn')}</a>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                {selectedDeptIds.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#BFBFBF', padding: '40px 0', fontSize: 13 }}>
                    {t('aiQuotaAuth.selectDeptPlease')}
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
                                {t('aiQuotaAuth.deptsCount', {
                                  count: <strong>{selectedDeptIds.length}</strong>,
                                  empCount: <strong>{selectedEmployeeCount}</strong>,
                                })}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ═══ 分区 3：模型授权配置 ═══ */}
        <SectionCard
          header={{
            icon: <EyeOutlined style={{ fontSize: 14, color: '#722ED1' }} />,
            iconBg: '#f9f0ff',
            title: t('aiQuotaAuth.modelAuthConfig'),
            tag: t('aiQuotaAuth.editableTag'),
            tagColor: 'purple',
            note: t('aiQuotaAuth.addModelAsNeeded'),
            tooltip: t('aiQuotaAuth.modelAuthTooltip'),
          }}
        >

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
            <span style={{ fontSize: 13, color: '#722ED1', fontWeight: 500 }}>{t('aiQuotaAuth.dataResidency')}</span>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>
              {t('aiQuotaAuth.dataResidencyDesc')}
            </span>
          </div>

          {/* 添加模型 */}
          <div style={{ marginBottom: 16 }}>
            <Select
              showSearch
              placeholder={t('aiQuotaAuth.selectAuthModelPh')}
              value={undefined}
              onChange={handleAddModel}
              optionFilterProp="label"
              options={availableModelOptions}
              notFoundContent={residencyOn ? t('aiQuotaAuth.noPrivateModel') : t('aiQuotaAuth.allModelsAdded')}
              style={{ width: '100%' }}
              suffixIcon={<PlusOutlined />}
            />
          </div>

          {modelAuths.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#8C8C8C', fontSize: 13, background: '#FAFAFA', borderRadius: 8, border: '1px dashed #D9D9D9' }}>
              {t('aiQuotaAuth.noModelAdded')}
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
                            {MODEL_TYPE_LABEL_KEYS[model.type] ? t('aiQuotaAuth.' + MODEL_TYPE_LABEL_KEYS[model.type]) : model.type}
                          </Tag>
                        )}
                        <Tag color={model.deployType === 'private' ? 'purple' : 'default'} style={{ fontSize: 11 }}>
                          {model.deployType === 'private' ? t('aiQuotaAuth.privateDeploy') : t('aiQuotaAuth.publicCloud')}
                        </Tag>
                      </div>
                      <Button type="link" danger size="small" icon={<DeleteOutlined />}
                        onClick={() => handleRemoveModel(auth.modelId)}>{t('aiQuotaAuth.removeBtn')}</Button>
                    </div>

                    {/* 能力开关 */}
                    <div style={{ borderTop: '1px solid #E8D5F5', paddingTop: 12 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {CAPABILITY_FIELDS.map(({ key, labelKey, color, tipKey }) => {
                          const supported = modelSupports(model, key)
                          const label = t('aiQuotaAuth.' + labelKey)
                          const tip = t('aiQuotaAuth.' + tipKey)
                          return (
                            <Tooltip key={key} title={supported ? tip : t('aiQuotaAuth.notSupportedTip', { label })}>
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
                                  unCheckedChildren={supported ? undefined : t('aiQuotaAuth.notSupported')}
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
            {t('aiQuotaAuth.authorizedCount', { count: modelAuths.length })}
          </div>
        </SectionCard>

        {/* ═══ 分区 4：状态配置 ═══ */}
        <StatusConfigSection extra={t('aiQuotaAuth.statusExtraDept')} />
      </Form>

      {/* 底部操作按鈕 */}
      <FormFooter onCancel={handleBack} onSave={handleSave} saving={saving} />
    </div>
  )
}
