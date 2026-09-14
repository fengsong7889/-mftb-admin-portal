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

/** 構建分類 ID → Code 映射 & 分組 TreeSelect 數據 */
function buildGroupedTreeData(list: AssetCategory[]) {
  const parentIds = new Set(list.filter(c => c.parentId === 0).map(c => c.id))
  const leafCats = list.filter(c => !parentIds.has(c.id))
  const groupMap = new Map<number, AssetCategory[]>()
  leafCats.forEach(cat => {
    let parentId = cat.parentId
    while (parentId) {
      const parent = list.find(c => c.id === parentId)
      if (parent && parent.parentId === 0) {
        const arr = groupMap.get(parent.id) ?? []
        arr.push(cat)
        groupMap.set(parent.id, arr)
        break
      }
      parentId = parent?.parentId ?? 0
    }
  })
  return Array.from(groupMap.entries()).map(([parentId, children]) => {
    const parent = list.find(c => c.id === parentId)!
    return {
      label: parent.name,
      options: children.map(c => ({ label: c.name, value: c.code })),
    }
  })
}

export default function ParamTypeForm({ id, defaultCategoryCode, onBack }: Props) {
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
      .catch((e: Error) => message.error(e.message || '加載失敗'))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [loadData])

  /** 分類 TreeSelect 數據 */
  const categoryTreeData = useMemo(() => buildGroupedTreeData(categories), [categories])

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
        message.success('更新成功')
      } else {
        await createParamType(payload)
        message.success('新增成功')
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
        message.warning('參數類型編碼不存在')
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
      message.success('新增成功')
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
      message.success('更新成功')
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
      message.success('刪除成功')
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
      message.success(newStatus === 'enabled' ? '已啟用' : '已停用')
      if (currentTypeCode) await loadParamValues(currentTypeCode)
    } catch {
      // 錯誤提示由請求層統一處理
    }
  }

  /** 參數值表格列 */
  const valueColumns: TableColumnsType<ParamValue> = [
    { title: '序號', key: 'index', width: 60, render: (_: unknown, __: unknown, index: number) => index + 1 },
    { title: '參數值', dataIndex: 'value', key: 'value', width: 200 },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, record: ParamValue) => (
        <Switch
          checked={status === 'enabled'}
          checkedChildren="啟用"
          unCheckedChildren="停用"
          size="small"
          onChange={() => handleToggleValueStatus(record)}
        />
      ),
    },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleOpenEditValue(record)}>編輯</Button>
          <Popconfirm
            title="確認刪除"
            description={`確認刪除參數值「${record.value}」？`}
            onConfirm={() => handleDeleteValue(record)}
            okText="確認"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>刪除</Button>
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
        label: '基本信息',
        children: (
          <div style={cardShellStyle}>
            {cardTitleRow(
              <DatabaseOutlined style={{ fontSize: 14, color: '#fa8c16' }} />,
              '#FFF7E6',
              '基本信息',
              '定義資產參數的類型與值類型',
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <Form.Item
                label="所屬分類" name="categoryCode"
                rules={[{ required: true, message: '請選擇所屬分類' }]}
              >
                <TreeSelect
                  placeholder="請選擇所屬分類"
                  allowClear={!categoryDisabled}
                  disabled={categoryDisabled}
                  treeDefaultExpandAll
                  treeNodeFilterProp="label"
                  listHeight={240}
                  treeData={categoryTreeData}
                />
              </Form.Item>
              <Form.Item
                label="參數編碼" name="code"
                rules={[
                  { required: true, message: '請輸入參數編碼' },
                  { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: '僅支持字母、數字、下劃線' },
                ]}
              >
                <Input
                  placeholder="如 chip / memory / storage"
                  disabled={isEdit}
                  style={{ fontFamily: 'monospace' }}
                />
              </Form.Item>
              <Form.Item
                label="參數名稱" name="name"
                rules={[{ required: true, message: '請輸入參數名稱' }]}
              >
                <Input placeholder="如 芯片 / 內存 / 存儲" allowClear />
              </Form.Item>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <Form.Item label="計量單位" name="unit">
                <Input placeholder="如 GB / 英寸 / W（可選）" allowClear />
              </Form.Item>
              <Form.Item
                label={
                  <span>
                    值類型
                    {watchedValueType && watchedValueType !== 'select' && (
                      <span style={{ fontSize: 12, color: '#fa8c16', marginLeft: 6, fontWeight: 400 }}>
                        （僅下拉選擇，產品信息才能選擇參數值）
                      </span>
                    )}
                  </span>
                }
                name="valueType"
              >
                <Select options={[
                  { value: 'select', label: '下拉選擇' },
                  { value: 'text', label: '文本' },
                  { value: 'number', label: '數字' },
                ]} />
              </Form.Item>
              <Form.Item label="排序" name="sort">
                <InputNumber style={{ width: '100%' }} placeholder="數字越小越靠前" min={0} />
              </Form.Item>
            </div>
            <Form.Item label="描述" name="description" style={{ marginBottom: 0 }}>
              <Input.TextArea rows={3} placeholder="參數描述（可選）" maxLength={300} showCount />
            </Form.Item>
          </div>
        ),
      },
    ]

    // 編輯模式下添加參數值 Tab
    if (isEdit && currentTypeCode) {
      items.push({
        key: 'values',
        label: `參數值 (${paramValues.length})`,
        children: (
          <div style={cardShellStyle}>
            {cardTitleRow(
              <DatabaseOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
              '#E6F7FF',
              '參數值管理',
              `${currentTypeCode} 的可選值列表`,
            )}
            {/* 搜索 + 新增 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <Input
                placeholder="搜索參數值"
                allowClear
                value={valueSearch}
                onChange={(e) => setValueSearch(e.target.value)}
                style={{ width: 240 }}
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddValueModalOpen(true)}>
                新增參數值
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
                showTotal: (total) => `共 ${total} 條`,
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
            >返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEdit ? '編輯參數類型' : '新增參數類型'}
            </h2>
          </div>
        </div>
      </div>

      <Form<FormValues> form={form} layout="vertical">
        <Tabs items={tabItems} defaultActiveKey="basic" />
      </Form>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Button onClick={onBack}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
          保存
        </Button>
      </div>

      {/* ====== 新增參數值彈窗 ====== */}
      <Modal
        title={`新增參數值`}
        open={addValueModalOpen}
        onOk={handleAddValue}
        onCancel={() => { setAddValueModalOpen(false); addValueForm.resetFields() }}
        okText="確認"
        cancelText="取消"
        width={480}
      >
        <Form form={addValueForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="value" label="參數值" rules={[{ required: true, message: '請輸入參數值' }]}>
            <Input placeholder="如 A17 Pro / 16GB / 256GB" />
          </Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}>
            <InputNumber style={{ width: '100%' }} placeholder="數字越小越靠前" min={0} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ====== 編輯參數值彈窗 ====== */}
      <Modal
        title="編輯參數值"
        open={editValueModalOpen}
        onOk={handleEditValue}
        onCancel={() => { setEditValueModalOpen(false); editValueForm.resetFields(); setEditingValue(null) }}
        okText="確認"
        cancelText="取消"
        width={480}
      >
        <Form form={editValueForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="value" label="參數值" rules={[{ required: true, message: '請輸入參數值' }]}>
            <Input placeholder="如 A17 Pro / 16GB / 256GB" />
          </Form.Item>
          <Form.Item name="sort" label="排序">
            <InputNumber style={{ width: '100%' }} placeholder="數字越小越靠前" min={0} />
          </Form.Item>
        </Form>
      </Modal>
    </Spin>
  )
}
