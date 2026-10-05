/**
 * 明细编辑弹窗（采购订单录入/编辑共用）
 *
 * 分类 → 品牌 → 资产名称 → 参数模板，统一采购申请风格
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  Form, Input, InputNumber, Row, Col, Modal, Select, TreeSelect,
} from 'antd'
import { useTranslation } from 'react-i18next'
import {
  fetchAllParamTypes, fetchParamValuesByType,
  type AssetModel, type AssetCategory, type AssetBrand,
  type ParamType, type ParamField,
} from '../../../../api/eam'
import { buildCategoryTree, type ItemRow } from './utils'

/* ==================== Props ==================== */

export interface ItemEditModalProps {
  open: boolean
  editing: ItemRow | null
  categories: AssetCategory[]
  brands: AssetBrand[]
  models: AssetModel[]
  /** 弹窗确认回调 */
  onOk: (row: ItemRow) => void
  onCancel: () => void
  /** 编辑模式标题，默认使用 t('asset.editAssetTitle') */
  editTitle?: string
}

/* ==================== 组件 ==================== */

export default function ItemEditModal({
  open, editing, categories, brands, models, onOk, onCancel, editTitle,
}: ItemEditModalProps) {
  const [form] = Form.useForm<ItemRow>()
  const { t } = useTranslation()

  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string | undefined>()
  const [selectedBrandId, setSelectedBrandId] = useState<number | undefined>()
  const [selectedModel, setSelectedModel] = useState<AssetModel | undefined>()
  const [paramTypes, setParamTypes] = useState<ParamType[]>([])
  const [paramValuesMap, setParamValuesMap] = useState<Record<string, string[]>>({})

  const categoryTree = useMemo(
    () => buildCategoryTree(categories.filter((c) => c.status === 'enabled')),
    [categories],
  )
  const filteredBrands = useMemo(
    () => selectedCategoryCode ? brands.filter((b) => b.categoryCode === selectedCategoryCode) : [],
    [brands, selectedCategoryCode],
  )
  const filteredModels = useMemo(
    () => models.filter((m) => {
      if (!selectedCategoryCode) return false
      const codeMatch = m.categoryCode === selectedCategoryCode || m.categoryCode.startsWith(`${selectedCategoryCode}-`)
      const brandMatch = selectedBrandId ? m.brandId === selectedBrandId : true
      return codeMatch && brandMatch
    }),
    [models, selectedCategoryCode, selectedBrandId],
  )
  // 從參數庫 API 加載參數模板（biz_eam_param_type 表）
  const paramTemplate: ParamField[] = useMemo(() => {
    if (!selectedModel) return []
    return paramTypes
      .filter((p) => p.categoryCode === selectedModel.categoryCode && p.status === 'enabled')
      .sort((a, b) => a.sort - b.sort)
      .map((p) => ({
        key: p.code,
        label: p.name,
        type: p.valueType === 'number' ? 'number' : p.valueType === 'select' ? 'select' : 'text',
        unit: p.unit || undefined,
        options: p.valueType === 'select' ? (paramValuesMap[p.code] || []) : undefined,
      }))
  }, [paramTypes, selectedModel, paramValuesMap])

  // 加載參數庫數據（弹窗打開時）
  useEffect(() => {
    if (!open) return
    let alive = true
    fetchAllParamTypes().then((list) => {
      if (alive) setParamTypes(list)
    }).catch(() => {})
    return () => { alive = false }
  }, [open])

  // select 類型參數的 code 列表（穩定字符串）：paramTemplate 的 useMemo 依賴 paramValuesMap，
  // 若直接以 paramTemplate 為依賴，本 effect 內 setParamValuesMap 會使 paramTemplate 產生新引用 →
  // effect 再次觸發 → 無限循環請求。改為依賴值穩定 code 字符串可斷環。
  const selectParamKeys = useMemo(
    () => paramTemplate.filter((p) => p.type === 'select').map((p) => p.key).join(','),
    [paramTemplate],
  )

  // 為 select 類型參數加載可選值
  useEffect(() => {
    const keys = selectParamKeys ? selectParamKeys.split(',') : []
    if (keys.length === 0) return
    let alive = true
    Promise.all(
      keys.map((key) =>
        fetchParamValuesByType(key)
          .then((vals) => ({ key, values: vals.filter((v) => v.status === 'enabled').sort((a, b) => a.sort - b.sort).map((v) => v.value) }))
          .catch(() => ({ key, values: [] })),
      ),
    ).then((results) => {
      if (!alive) return
      const map: Record<string, string[]> = {}
      results.forEach((r) => { map[r.key] = r.values })
      setParamValuesMap(map)
    })
    return () => { alive = false }
  }, [selectParamKeys])

  useEffect(() => {
    if (open && editing) {
      form.setFieldsValue(editing)
      const cat = editing.categoryName ? categories.find((c) => c.id === editing.categoryId) : undefined
      setSelectedCategoryCode(cat?.code)
      setSelectedBrandId(editing.brandId)
      setSelectedModel(editing.modelId ? models.find((m) => m.id === editing.modelId) : undefined)
    } else if (open) {
      form.resetFields()
      form.setFieldsValue({ qty: 1, price: 0 })
      setSelectedCategoryCode(undefined)
      setSelectedBrandId(undefined)
      setSelectedModel(undefined)
      setParamValuesMap({})
    }
  }, [open, editing, form, categories, models])

  const handleCategoryChange = useCallback((categoryId: number) => {
    const cat = categories.find((c) => c.id === categoryId)
    setSelectedCategoryCode(cat?.code)
    setSelectedBrandId(undefined)
    setSelectedModel(undefined)
    form.setFieldsValue({ brandId: undefined, modelId: undefined, params: {} })
  }, [categories, form])

  const handleBrandChange = useCallback((brandId: number) => {
    setSelectedBrandId(brandId)
    setSelectedModel(undefined)
    form.setFieldsValue({ modelId: undefined })
  }, [form])

  const handleModelChange = useCallback((modelId: number) => {
    const m = models.find((x) => x.id === modelId)
    setSelectedModel(m)
  }, [models])

  const handleOk = useCallback(async () => {
    try {
      const v = await form.validateFields()
      const cat = categories.find((c) => c.id === v.categoryId)
      const brand = brands.find((b) => b.id === v.brandId)
      const model = models.find((m) => m.id === v.modelId)
      onOk({
        ...v,
        key: editing?.key || `item_${Date.now()}`,
        categoryName: cat?.name,
        categoryCode: cat?.code,
        brandName: brand?.brandZh,
        modelName: model ? `${model.brandZh} ${model.name}`.trim() : undefined,
      })
    } catch { /* antd validates */ }
  }, [form, editing, categories, brands, models, onOk])

  return (
    <Modal
      title={editing ? (editTitle || t('asset.editAssetTitle')) : t('asset.addAssetTitle')}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText={t('common.confirm')}
      cancelText={t('common.cancel')}
      width={680}
      centered
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t('asset.colCategory')} name="categoryId" rules={[{ required: true, message: t('asset.warnSelectCategory') }]}>
              <TreeSelect treeData={categoryTree} placeholder={t('asset.phSelectCategory')} allowClear treeDefaultExpandAll
                showSearch treeNodeFilterProp="title" onChange={handleCategoryChange} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('asset.colBrand')} name="brandId" rules={[{ required: true, message: t('asset.warnSelectAssetBrand') }]}>
              <Select placeholder={selectedCategoryCode ? t('asset.phSelectBrand') : t('asset.phSelectCategoryFirst')} showSearch optionFilterProp="label"
                disabled={!selectedCategoryCode} onChange={handleBrandChange}
                options={filteredBrands.map((b) => ({ label: b.brandZh, value: b.id }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('asset.colAssetName')} name="modelId" rules={[{ required: true, message: t('asset.warnSelectAssetName') }]}>
              <Select placeholder={selectedBrandId ? t('asset.phSelectAsset') : t('asset.phSelectBrandFirst')} showSearch optionFilterProp="label"
                disabled={!selectedBrandId} onChange={handleModelChange}
                options={filteredModels.map((m) => ({
                  label: m.name, value: m.id,
                }))} />
            </Form.Item>
          </Col>
        </Row>

        {/* 參數信息 */}
        {selectedModel && paramTemplate.length > 0 && (
          <div style={{ background: '#fafafa', borderRadius: 8, padding: '12px 16px', marginBottom: 16, border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 10 }}>{t('asset.paramInfoTitle')}</div>
            <Row gutter={12}>
              {paramTemplate.map((p) => (
                <Col span={8} key={p.key}>
                  <Form.Item label={<span style={{ fontSize: 13 }}>{p.label}{p.unit ? ` (${p.unit})` : ''}</span>}
                    name={['params', p.key]} style={{ marginBottom: 8 }}>
                    {p.type === 'select' ? (
                      <Select placeholder={t('asset.phParamSelect', { name: p.label })} allowClear
                        options={p.options?.map((o) => ({ label: o, value: o })) || []} />
                    ) : (
                      <Input placeholder={t('asset.phParamInput', { name: p.label })} allowClear />
                    )}
                  </Form.Item>
                </Col>
              ))}
            </Row>
          </div>
        )}

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t('asset.purchaseType')} name="purchaseType" rules={[{ required: true, message: t('asset.warnSelectPurchaseType') }]}>
              <Select placeholder={t('asset.phSelect')} options={[
                { label: t('asset.purchaseTypePurchase'), value: 'purchase' }, { label: t('asset.purchaseTypeLease'), value: 'lease' },
              ]} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('asset.colQty')} name="qty" rules={[{ required: true, message: t('asset.warnInputQty') }]}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item label={t('asset.confirmedPrice')} name="confirmedPrice">
              <InputNumber style={{ width: '100%' }} min={0} precision={2}
                addonBefore="MOP" placeholder={t('asset.phConfirmedPrice')} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  )
}
