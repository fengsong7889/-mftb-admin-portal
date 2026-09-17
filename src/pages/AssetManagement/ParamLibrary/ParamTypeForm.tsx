/**
 * 參數類型 新增/編輯獨立表單頁
 *
 * - 通過 props.id 區分模式：無 id = 新增，有 id = 編輯
 * - 分模塊佈局：頂部標題欄 → 基本信息卡片 → 底部操作欄
 * - 編輯模式下提供「參數值管理」Tab，支持新增/編輯/刪除/啟用停用
 * - 對齊 AGENTS.md §C 表單頁規範
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Spin, Switch,
  Table, Tabs, TreeSelect, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, DatabaseOutlined, PlusOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchCategoryList, fetchParamTypeList, createParamType, updateParamType,
  fetchParamValuesByType, createParamValue, updateParamValue, deleteParamValue,
  type AssetCategory, type ParamType, type ParamValue,
} from '../../../api/eam'

interface FormValues {
  categoryCode: string
  code: string
  name: string
  unit?: string
  valueType: 'select' | 'text' | 'number'
  sort: number
  description?: string
}

interface Props {
  id?: number
  /** 從列表帶入的默認分類編碼 */
  defaultCategoryCode?: string
  onBack: () => void
}

/** 分類 TreeSelect 節點（value 為分類編碼 code，多級遞歸） */
interface CategoryTreeNode {
  title: string
  value: string
  children?: CategoryTreeNode[]
}

/**
 * 構建分類 TreeSelect 數據（平鋪列表 → 多級樹，value 為 code）
 * 對齊 AssetAdd.buildCategoryTree 約定：節點使用 { title, value, children }，
 * TreeSelect 才能正確渲染層級、展開與回顯（此前誤用 Select 的 { label, options }
 * 分組結構，導致只显示不可選的頂級節點、且 value 為 undefined）。
 */
function buildCategoryTreeData(list: AssetCategory[]): CategoryTreeNode[] {
  const childrenMap = new Map<number, AssetCategory[]>()
  const roots: AssetCategory[] = []
  list.forEach((c) => {
    if (c.parentId && c.parentId !== 0) {
      const arr = childrenMap.get(c.parentId) ?? []
      arr.push(c)
      childrenMap.set(c.parentId, arr)
    } else {
      roots.push(c)
    }
  })
  const buildNode = (cat: AssetCategory): CategoryTreeNode => {
    const children = childrenMap.get(cat.id) ?? []
    return {
      title: `${cat.code} - ${cat.name}`,
      value: cat.code,
      children: children.length ? children.map(buildNode) : undefined,
    }
  }
  return roots.map(buildNode)
}

export default function ParamTypeForm({ id, defaultCategoryCode, onBack }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const isEdit = id != null
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [categoryDisabled, setCategoryDisabled] = useState(false)

  // 參數值管理狀態
  const [paramValues, setParamValues] = useState<ParamValue[]>([])
  const [valuesLoading, setValuesLoading] = useState(false)
  const [valueSearch, setValueSearch] = useState<string>()
  const [addValueModalOpen, setAddValueModalOpen] = useState(false)
  const [editValueModalOpen, setEditValueModalOpen] = useState(false)
  const [editingValue, setEditingValue] = useState<ParamValue | null>(null)
  const [addValueForm] = Form.useForm<{ value: string; sort: number }>()
  const [editValueForm] = Form.useForm<{ value: string; sort: number }>()
  const [currentTypeCode, setCurrentTypeCode] = useState<string>()

  /** 監聽值類型變化，非下拉選擇時提示用戶 */
  const watchedValueType = Form.useWatch('valueType', form)

  /** 加載分類數據 & 回填表單 */
  const loadData = useCallback(async () => {
    const list = await fetchCategoryList()
    setCategories(list)
    if (isEdit && id) {
      const result = await fetchParamTypeList({ size: 9999 })
      const all = result.records || []
      const cur = all.find((t: ParamType) => t.id === id)
      if (cur) {
        form.setFieldsValue({
          categoryCode: cur.categoryCode,
          code: cur.code,
          name: cur.name,
          unit: cur.unit || undefined,
          valueType: cur.valueType || 'select',
          sort: cur.sort || 0,
          description: cur.description || undefined,
        })
        setCategoryDisabled(true)
        setCurrentTypeCode(cur.code)
        // 加載參數值
        await loadParamValues(cur.code)
      }
    } else {
      form.setFieldsValue({
        categoryCode: defaultCategoryCode || undefined,
        valueType: 'select',
        sort: 0,
      })
      if (defaultCategoryCode) setCategoryDisabled(true)
    }
  }, [form, id, isEdit, defaultCategoryCode]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 加載參數值 */
  const loadParamValues = useCallback(async (code: string) => {
    setValuesLoading(true)
    try {
      const data = await fetchParamValuesByType(code)
      setParamValues(data)
    } catch {
      setParamValues([])
    } finally {
      setValuesLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    loadData()
      .catch((e: Error) => message.error(e.message || t('asset.loadFailed')))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [loadData, t])

  /** 分類 TreeSelect 數據 */
  const categoryTreeData = useMemo(() => buildCategoryTreeData(categories), [categories])

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      const payload = {
        categoryCode: v.categoryCode.trim(),
        code: v.code.trim(),
        name: v.name.trim(),
        unit: v.unit?.trim() || undefined,
        valueType: v.valueType || 'select',
        status: 'enabled' as const,
        sort: v.sort || 0,
        description: v.description?.trim() || undefined,
        updatedBy: '',
        updatedAt: '',
      }
      setSubmitting(true)
      if (isEdit && id) {
        await updateParamType(id, payload)
        message.success(t('common.updateSuccess'))
      } else {
        await createParamType(payload)
        message.success(t('asset.addSuccess'))
      }
      onBack()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  /* ── 參數值操作 ── */

  /** 新增參數值 */
  const handleAddValue = async () => {
    try {
      const v = await addValueForm.validateFields()
      if (!currentTypeCode) {
        message.warning(t('asset.warnParamTypeCodeMissing'))
        return
      }
      await createParamValue({
        paramTypeCode: currentTypeCode,
        value: v.value.trim(),
        sort: v.sort ?? 0,
        status: 'enabled',
        updatedBy: '',
        updatedAt: '',
      })
      message.success(t('asset.addSuccess'))
      setAddValueModalOpen(false)
      addValueForm.resetFields()
      await loadParamValues(currentTypeCode)
    } catch {
      // 表單校驗失敗
    }
  }

  /** 編輯參數值 */
  const handleOpenEditValue = (record: ParamValue) => {
    setEditingValue(record)
    editValueForm.setFieldsValue({ value: record.value, sort: record.sort })
    setEditValueModalOpen(true)
  }

  const handleEditValue = async () => {
    try {
      const v = await editValueForm.validateFields()
      if (!editingValue) return
      await updateParamValue(editingValue.id, {
        value: v.value.trim(),
        sort: v.sort ?? 0,
      })
      message.success(t('asset.updateSuccess'))
      setEditValueModalOpen(false)
      editValueForm.resetFields()
      setEditingValue(null)
      if (currentTypeCode) await loadParamValues(currentTypeCode)
    } catch {
      // 表單校驗失敗
    }
  }

  /** 刪除參數值 */
  const handleDeleteValue = async (record: ParamValue) => {
    try {
      await deleteParamValue(record.id)
      message.success(t('common.deleteSuccess'))
      if (currentTypeCode) await loadParamValues(currentTypeCode)
    } catch {
      // 錯誤提示由請求層統一處理
    }
  }

  /** 啟用/停用參數值 */
  const handleToggleValueStatus = async (record: ParamValue) => {
    const newStatus = record.status === 'enabled' ? 'disabled' : 'enabled'
    try {
      await updateParamValue(record.id, { status: newStatus })
      message.success(newStatus === 'enabled' ? t('asset.enabledStatus') : t('asset.disabledStatus'))
      if (currentTypeCode) await loadParamValues(currentTypeCode)
    } catch {
      // 錯誤提示由請求層統一處理
    }
  }

  /** 參數值表格列 */
  const valueColumns: TableColumnsType<ParamValue> = [
    { title: t('asset.colIndex'), key: 'index', width: 60, render: (_: unknown, __: unknown, index: number) => index + 1 },
    { title: t('asset.colParamValue'), dataIndex: 'value', key: 'value', width: 200 },
    {
      title: t('asset.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, record: ParamValue) => (
        <Switch
          checked={status === 'enabled'}
          checkedChildren={t('asset.switchEnabled')}
          unCheckedChildren={t('asset.switchDisabled')}
          size="small"
          onChange={() => handleToggleValueStatus(record)}
        />
      ),
    },
    { title: t('asset.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { title: t('asset.colUpdatedAt'), dataIndex: 'updatedAt', key: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      title: t('asset.colAction'),
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleOpenEditValue(record)}>{t('common.edit')}</Button>
          <Popconfirm
            title={t('asset.deleteConfirmTitle')}
            description={t('asset.confirmDeleteParamValue', { value: record.value })}
            onConfirm={() => handleDeleteValue(record)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button type="link" size="small" danger>{t('common.delete')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  /** 參數值過濾 */
  const filteredValues = useMemo(() => {
    let list = paramValues
    if (valueSearch) list = list.filter(v => v.value.toLowerCase().includes(valueSearch.toLowerCase()))
    return list
  }, [paramValues, valueSearch])

  /* ── 樣式 ── */
  const cardShellStyle: React.CSSProperties = {
    border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
    padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }

  const cardTitleRow = (icon: React.ReactNode, iconBg: string, title: string, rightText?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {rightText && <span style={{ fontSize: 12, color: '#8c8c8c' }}>{rightText}</span>}
    </div>
  )

  /** Tab 配置 */
  const tabItems = useMemo(() => {
    const items: { key: string; label: string; children: React.ReactNode }[] = [
      {
        key: 'basic',
        label: t('asset.tabBasicInfo'),
        children: (
          <div style={cardShellStyle}>
            {cardTitleRow(
              <DatabaseOutlined style={{ fontSize: 14, color: '#fa8c16' }} />,
              '#FFF7E6',
              t('asset.basicInfoTitle'),
              t('asset.basicInfoSubtitle'),
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <Form.Item
                label={t('asset.labelCategory')} name="categoryCode"
                rules={[{ required: true, message: t('asset.warnSelectCategory') }]}
              >
                <TreeSelect
                  placeholder={t('asset.phSelectCategory')}
                  allowClear={!categoryDisabled}
                  disabled={categoryDisabled}
                  showSearch
                  treeDefaultExpandAll
                  treeNodeFilterProp="title"
                  listHeight={240}
                  treeData={categoryTreeData}
                />
              </Form.Item>
              <Form.Item
                label={t('asset.labelParamCode')} name="code"
                rules={[
                  { required: true, message: t('asset.warnInputParamCode') },
                  { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: t('asset.patternParamCode') },
                ]}
              >
                <Input
                  placeholder={t('asset.phParamCode')}
                  disabled={isEdit}
                  style={{ fontFamily: 'monospace' }}
                />
              </Form.Item>
              <Form.Item
                label={t('asset.labelParamName')} name="name"
                rules={[{ required: true, message: t('asset.warnInputParamName') }]}
              >
                <Input placeholder={t('asset.phParamName')} allowClear />
              </Form.Item>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <Form.Item label={t('asset.labelUnit')} name="unit">
                <Input placeholder={t('asset.phUnit')} allowClear />
              </Form.Item>
              <Form.Item
                label={
                  <span>
                    {t('asset.labelValueType')}
                    {watchedValueType && watchedValueType !== 'select' && (
                      <span style={{ fontSize: 12, color: '#fa8c16', marginLeft: 6, fontWeight: 400 }}>
                        {t('asset.valueTypeHint')}
                      </span>
                    )}
                  </span>
                }
                name="valueType"
              >
                <Select options={[
                  { value: 'select', label: t('asset.valueTypeSelect') },
                  { value: 'text', label: t('asset.valueTypeText') },
                  { value: 'number', label: t('asset.valueTypeNumber') },
                ]} />
              </Form.Item>
              <Form.Item label={t('asset.labelSort')} name="sort">
                <InputNumber style={{ width: '100%' }} placeholder={t('asset.phSort')} min={0} />
              </Form.Item>
            </div>
            <Form.Item label={t('asset.labelDescription')} name="description" style={{ marginBottom: 0 }}>
              <Input.TextArea rows={3} placeholder={t('asset.phDescription')} maxLength={300} showCount />
            </Form.Item>
          </div>
        ),
      },
    ]

    // 編輯模式下添加參數值 Tab
    if (isEdit && currentTypeCode) {
      items.push({
        key: 'values',
        label: `${t('asset.tabParamValues')} (${paramValues.length})`,
        children: (
          <div style={cardShellStyle}>
            {cardTitleRow(
              <DatabaseOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
              '#E6F7FF',
              t('asset.paramValueManagement'),
              t('asset.paramValuesSubtitle', { code: currentTypeCode }),
            )}
            {/* 搜索 + 新增 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <Input
                placeholder={t('asset.phSearchParamValue')}
                allowClear
                value={valueSearch}
                onChange={(e) => setValueSearch(e.target.value)}
                style={{ width: 240 }}
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddValueModalOpen(true)}>
                {t('asset.addParamValueBtn')}
              </Button>
            </div>
            <Table
              columns={valueColumns}
              dataSource={filteredValues}
              rowKey="id"
              loading={valuesLoading}
              size="small"
              pagination={{
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => t('asset.paginationTotal', { total }),
                pageSize: 10,
              }}
            />
          </div>
        ),
      })
    }

    return items
  }, [isEdit, currentTypeCode, paramValues.length, valueSearch, filteredValues, valuesLoading, categoryTreeData, categoryDisabled]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Spin spinning={loading}>
      {/* ====== 頂部標題欄 ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >{t('common.back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEdit ? t('asset.editParamTypeTitle') : t('asset.addParamTypeTitle')}
            </h2>
          </div>
        </div>
      </div>

      <Form<FormValues> form={form} layout="vertical">
        <Tabs items={tabItems} defaultActiveKey="basic" />
      </Form>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Button onClick={onBack}>{t('common.cancel')}</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
          {t('common.save')}
        </Button>
      </div>

      {/* ====== 新增參數值彈窗 ====== */}
      <Modal
        title={t('asset.addParamValueTitle')}
        open={addValueModalOpen}
        onOk={handleAddValue}
        onCancel={() => { setAddValueModalOpen(false); addValueForm.resetFields() }}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        width={480}
      >
        <Form form={addValueForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="value" label={t('asset.colParamValue')} rules={[{ required: true, message: t('asset.warnInputParamValue') }]}>
            <Input placeholder={t('asset.phParamValueExample')} />
          </Form.Item>
          <Form.Item name="sort" label={t('asset.labelSort')} initialValue={0}>
            <InputNumber style={{ width: '100%' }} placeholder={t('asset.phSort')} min={0} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ====== 編輯參數值彈窗 ====== */}
      <Modal
        title={t('asset.editParamValueTitle')}
        open={editValueModalOpen}
        onOk={handleEditValue}
        onCancel={() => { setEditValueModalOpen(false); editValueForm.resetFields(); setEditingValue(null) }}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        width={480}
      >
        <Form form={editValueForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="value" label={t('asset.colParamValue')} rules={[{ required: true, message: t('asset.warnInputParamValue') }]}>
            <Input placeholder={t('asset.phParamValueExample')} />
          </Form.Item>
          <Form.Item name="sort" label={t('asset.labelSort')}>
            <InputNumber style={{ width: '100%' }} placeholder={t('asset.phSort')} min={0} />
          </Form.Item>
        </Form>
      </Modal>
    </Spin>
  )
}
