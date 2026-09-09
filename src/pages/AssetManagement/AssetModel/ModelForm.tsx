/**
 * 品牌型號 新增/編輯獨立表單頁
 *
 * - 選定資產分類後，按該分類的「參數模板」動態渲染參數表單
 * - 分模塊佈局：頂部標題欄 → 基本信息卡片 → 參數模板卡片 → 底部操作欄
 * - 底部「取消 + 保存」（全局表單規範）
 */
import { useState, useEffect, useMemo } from 'react'
import {
  Button, Form, Input, InputNumber, Select, Row, Col, Space, Spin, message, Alert,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, FolderOutlined, SettingOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchCategoryList, fetchModelDetail, createModel, updateModel,
  type AssetCategory, type ParamField,
} from '../../../api/eam'
import { EAM_UNITS } from '../eamUtils'

interface FormValues {
  categoryCode: string
  brand: string
  modelNo: string
  name: string
  unit: string
  refPrice: number
  supplier?: string
  params?: Record<string, string>
}

interface Props {
  id?: number
  onBack: () => void
}

/* ── 卡片統一樣式（對齊定價頁面規範） ── */
const cardShellStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #e8eaed', borderRadius: 8,
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 16,
}
const cardTitleStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '14px 20px', borderBottom: '1px solid #f0f0f0',
  fontSize: 15, fontWeight: 600, color: '#262626',
}

export default function ModelForm({ id, onBack }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const isEdit = id != null
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [categoryCode, setCategoryCode] = useState<string>('')

  /** 當前分類的參數模板（含繼承上級分類的公共參數） */
  const paramTemplate: ParamField[] = useMemo(() => {
    const cur = categories.find((c) => c.code === categoryCode)
    if (!cur) return []
    const parent = categories.find((c) => c.id === cur.parentId)
    const inherited = parent?.paramTemplate?.filter((p) => !cur.paramTemplate.some((x) => x.key === p.key)) || []
    return [...cur.paramTemplate, ...inherited]
  }, [categories, categoryCode])

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchCategoryList()
      .then(async (list) => {
        if (!alive) return
        setCategories(list)
        if (isEdit && id) {
          const model = await fetchModelDetail(id)
          if (!alive) return
          setCategoryCode(model.categoryCode)
          form.setFieldsValue({
            categoryCode: model.categoryCode,
            brand: model.brand,
            modelNo: model.modelNo,
            name: model.name,
            unit: model.unit,
            refPrice: model.refPrice,
            supplier: model.supplier,
            params: model.params,
          })
        } else {
          form.setFieldsValue({ unit: '台' })
        }
      })
      .catch((e: Error) => message.error(e.message))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [form, id, isEdit])

  const handleCategoryChange = (code: string) => {
    setCategoryCode(code)
    const cur = categories.find((c) => c.code === code)
    const keys = cur?.paramTemplate.map((p) => p.key) || []
    const params = form.getFieldValue('params') || {}
    const next: Record<string, string> = {}
    keys.forEach((k) => { if (params[k] != null) next[k] = params[k] })
    form.setFieldsValue({ params: next })
  }

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      const params: Record<string, string> = {}
      Object.entries(v.params || {}).forEach(([k, val]) => {
        if (val != null && val !== '') params[k] = String(val)
      })
      const payload = {
        categoryCode: v.categoryCode,
        brand: v.brand.trim(),
        modelNo: v.modelNo.trim(),
        name: v.name.trim(),
        unit: v.unit,
        refPrice: v.refPrice ?? 0,
        supplier: v.supplier?.trim() || undefined,
        params,
      }
      setSubmitting(true)
      if (isEdit && id) {
        await updateModel(id, payload)
        message.success(t('asset.updateSuccess'))
      } else {
        await createModel(payload)
        message.success(t('asset.createSuccess'))
      }
      onBack()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const renderParamField = (p: ParamField) => {
    if (p.type === 'select') {
      return (
        <Select
          placeholder="請選擇"
          allowClear
          options={(p.options || []).map((o) => ({ label: o, value: o }))}
        />
      )
    }
    if (p.type === 'number') {
      return <InputNumber style={{ width: '100%' }} min={0} addonAfter={p.unit} />
    }
    return <Input placeholder={p.unit ? `${p.label}(${p.unit})` : p.label} allowClear />
  }

  return (
    <Spin spinning={loading}>
      {/* ====== 頂部標題欄（橙色漸變頂條，對齊定價頁規範） ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={onBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              }}
            >{t('common.back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEdit ? t('asset.modelEditTitle') : t('asset.modelAddTitle')}
            </h2>
          </div>
        </div>
      </div>

      {/* ====== 基本信息卡片 ====== */}
      <div style={cardShellStyle}>
        <div style={cardTitleStyle}>
          <FolderOutlined style={{ color: '#1890ff', fontSize: 16 }} />
          <span>基本信息</span>
        </div>
        <div style={{ padding: '20px 24px 4px' }}>
          <Form<FormValues> form={form} layout="vertical">
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  label={t('asset.colCategoryCode')} name="categoryCode"
                  rules={[{ required: true, message: t('asset.categoryRequired') }]}
                >
                  <Select
                    placeholder="請選擇資產分類"
                    showSearch
                    optionFilterProp="label"
                    onChange={handleCategoryChange}
                    options={categories.map((c) => ({ label: c.name, value: c.code }))}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label={t('asset.colBrand')} name="brand"
                  rules={[{ required: true, message: t('asset.brandRequired') }]}
                >
                  <Input placeholder={t('asset.brandPh')} allowClear />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label={t('asset.colModelNo')} name="modelNo"
                  rules={[{ required: true, message: t('asset.modelNoRequired') }]}
                >
                  <Input placeholder="X1 Carbon Gen11" allowClear />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  label={t('asset.colModelName')} name="name"
                  rules={[{ required: true, message: t('asset.modelNameRequired') }]}
                >
                  <Input placeholder={t('asset.assetNamePh')} allowClear />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label={t('asset.colRefPrice')} name="refPrice"
                  rules={[{ required: true, message: t('asset.refPriceRequired') }]}
                >
                  <InputNumber style={{ width: '100%' }} min={0} step={100} addonBefore="MOP" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label={t('asset.colUnit')} name="unit"
                  rules={[{ required: true, message: t('asset.unitRequired') }]}
                >
                  <Select placeholder={t('asset.unitPh')} options={EAM_UNITS.map((u) => ({ label: u, value: u }))} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label={t('asset.colSupplier')} name="supplier">
                  <Input placeholder="請輸入供應商" allowClear />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </div>
      </div>

      {/* ====== 型號參數卡片 ====== */}
      <div style={cardShellStyle}>
        <div style={cardTitleStyle}>
          <SettingOutlined style={{ color: '#E8720C', fontSize: 16 }} />
          <span>{t('asset.sectionParams')}</span>
        </div>
        <div style={{ padding: '20px 24px 4px' }}>
          {paramTemplate.length ? (
            <Form form={form} layout="vertical">
              <Row gutter={16}>
                {paramTemplate.map((p) => (
                  <Col span={8} key={p.key}>
                    <Form.Item
                      label={p.unit && p.type !== 'number' ? `${p.label}(${p.unit})` : p.label}
                      name={['params', p.key]}
                    >
                      {renderParamField(p)}
                    </Form.Item>
                  </Col>
                ))}
              </Row>
            </Form>
          ) : (
            <Alert type="info" showIcon message="請先選擇資產分類，分類參數模板將自動渲染至此處" />
          )}
        </div>
      </div>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </Space>
      </div>
    </Spin>
  )
}
