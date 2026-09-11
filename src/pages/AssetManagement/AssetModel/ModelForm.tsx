/**
 * 品牌/产品 新增/编辑独立表单页
 *
 * - type="brand"：品牌表单（所属分类 + 品牌中英文名 + LOGO）
 * - type="product"：产品表单（所属品牌 + 产品名称 + 型号编码 + 单位 + 参考单价）
 * - 无参数配置（参数从参数库读取）
 * - 底部「取消 + 保存」（全局表单规范）
 */
import { useState, useEffect } from 'react'
import {
  Button, Form, Input, Select, Row, Col, Space, Spin, message,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, ShopOutlined, AppstoreOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchCategoryList, fetchBrandList, fetchModelDetail, createModel, updateModel,
  createBrand, updateBrand,
  type AssetCategory, type AssetBrand,
} from '../../../api/eam'
import { EAM_UNITS } from '../eamUtils'

interface BrandFormValues {
  categoryCode: string
  brandZh: string
  brandEn: string
  brandLogo?: string
}

interface ProductFormValues {
  brandId: number
  categoryCode: string
  name: string
  modelNo?: string
  unit: string
  refPrice?: number
}

interface Props {
  id?: number
  categoryCode?: string
  brandId?: number
  type: 'brand' | 'product'
  onBack: () => void
}

/* ── 卡片统一样式 ── */
const cardShellStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #e8eaed', borderRadius: 8,
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 16,
}
const cardTitleStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '14px 20px', borderBottom: '1px solid #f0f0f0',
  fontSize: 15, fontWeight: 600, color: '#262626',
}

export default function ModelForm({ id, categoryCode: initialCategoryCode, brandId: initialBrandId, type, onBack }: Props) {
  const { t } = useTranslation()
  const isBrand = type === 'brand'
  const [brandForm] = Form.useForm<BrandFormValues>()
  const [productForm] = Form.useForm<ProductFormValues>()
  const isEdit = id != null
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [brands, setBrands] = useState<AssetBrand[]>([])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([fetchCategoryList(), fetchBrandList()])
      .then(async ([cats, brs]) => {
        if (!alive) return
        setCategories(cats)
        setBrands(brs)
        if (isEdit && id) {
          if (isBrand) {
            const brand = brs.find(b => b.id === id)
            if (brand) {
              brandForm.setFieldsValue({
                categoryCode: brand.categoryCode,
                brandZh: brand.brandZh,
                brandEn: brand.brandEn,
              })
            }
          } else {
            const model = await fetchModelDetail(id)
            if (!alive) return
            productForm.setFieldsValue({
              brandId: model.brandId,
              categoryCode: model.categoryCode,
              name: model.name,
              modelNo: model.modelNo,
              unit: model.unit,
              refPrice: model.refPrice,
            })
          }
        } else {
          if (isBrand && initialCategoryCode) {
            brandForm.setFieldsValue({ categoryCode: initialCategoryCode })
          }
          if (!isBrand && initialBrandId) {
            const brand = brs.find(b => b.id === initialBrandId)
            if (brand) {
              productForm.setFieldsValue({ brandId: brand.id, categoryCode: brand.categoryCode })
            }
          }
          if (!isBrand) {
            productForm.setFieldsValue({ unit: '台' })
          }
        }
      })
      .catch((e: Error) => message.error(e.message))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [brandForm, productForm, id, isEdit, isBrand]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBrandCategoryChange = (code: string) => {
    // 切换分类时清空品牌信息
    brandForm.setFieldsValue({ brandZh: '', brandEn: '', brandLogo: '' })
  }

  const handleProductBrandChange = (brandId: number) => {
    const brand = brands.find(b => b.id === brandId)
    if (brand) {
      productForm.setFieldsValue({ categoryCode: brand.categoryCode })
    }
  }

  const handleSubmit = async () => {
    try {
      if (isBrand) {
        const v = await brandForm.validateFields()
        const payload = {
          categoryCode: v.categoryCode,
          brandZh: v.brandZh.trim(),
          brandEn: v.brandEn.trim(),
          brandLogo: v.brandLogo?.trim(),
        }
        setSubmitting(true)
        if (isEdit && id) {
          await updateBrand(id, payload)
          message.success('品牌更新成功')
        } else {
          await createBrand(payload)
          message.success('品牌创建成功')
        }
      } else {
        const v = await productForm.validateFields()
        const brand = brands.find(b => b.id === v.brandId)
        const payload = {
          categoryCode: v.categoryCode,
          brandId: v.brandId,
          brandZh: brand?.brandZh || '',
          brandEn: brand?.brandEn,
          brandLogo: brand?.brandLogo,
          name: v.name.trim(),
          modelNo: v.modelNo?.trim(),
          unit: v.unit,
          refPrice: v.refPrice,
        }
        setSubmitting(true)
        if (isEdit && id) {
          await updateModel(id, payload)
          message.success(t('asset.updateSuccess'))
        } else {
          await createModel(payload)
          message.success(t('asset.createSuccess'))
        }
      }
      onBack()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const categoryName = (code: string) => categories.find(c => c.code === code)?.name || code
  const categoryOptions = categories.map(c => ({ label: `${c.name}(${c.code})`, value: c.code }))
  const brandOptions = brands.map(b => ({
    label: `${b.brandZh}（${b.brandEn}）`,
    value: b.id,
  }))

  return (
    <Spin spinning={loading}>
      {/* ====== 顶部标题栏 ====== */}
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
              {isEdit ? (isBrand ? '编辑品牌' : '编辑产品') : (isBrand ? '新增品牌' : '新增产品')}
            </h2>
          </div>
        </div>
      </div>

      {/* ====== 基本信息卡片 ====== */}
      <div style={cardShellStyle}>
        <div style={cardTitleStyle}>
          {isBrand
            ? <ShopOutlined style={{ color: '#E8720C', fontSize: 16 }} />
            : <AppstoreOutlined style={{ color: '#E8720C', fontSize: 16 }} />
          }
          <span>{isBrand ? '品牌信息' : '产品信息'}</span>
        </div>
        <div style={{ padding: '20px 24px 4px' }}>
          {isBrand ? (
            <Form<BrandFormValues> form={brandForm} layout="vertical">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    label="所属分类" name="categoryCode"
                    rules={[{ required: true, message: '请选择所属分类' }]}
                  >
                    <Select
                      placeholder="请选择资产分类"
                      showSearch
                      optionFilterProp="label"
                      onChange={handleBrandCategoryChange}
                      options={categoryOptions}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    label="品牌（中文）" name="brandZh"
                    rules={[{ required: true, message: '请输入品牌中文名称' }]}
                  >
                    <Input placeholder="例如：苹果" allowClear />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    label="品牌（英文）" name="brandEn"
                    rules={[{ required: true, message: '请输入品牌英文名称' }]}
                  >
                    <Input placeholder="例如：Apple" allowClear />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          ) : (
            <Form<ProductFormValues> form={productForm} layout="vertical">
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    label="所属品牌" name="brandId"
                    rules={[{ required: true, message: '请选择所属品牌' }]}
                  >
                    <Select
                      placeholder="请选择品牌"
                      showSearch
                      optionFilterProp="label"
                      onChange={handleProductBrandChange}
                      options={brandOptions}
                      disabled={!!initialBrandId}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="所属分类" name="categoryCode">
                    <Select placeholder="自动带入" disabled options={categoryOptions} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    label="产品名称" name="name"
                    rules={[{ required: true, message: '请输入产品名称' }]}
                  >
                    <Input placeholder="例如：MacBook Pro 16 笔记本" allowClear />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="型号编码" name="modelNo">
                    <Input placeholder="例如：MacBook Pro 16 M3" allowClear />
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
                <Col span={8}>
                  <Form.Item label="参考单价（元）" name="refPrice">
                    <Input type="number" placeholder="请输入参考单价" allowClear />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          )}
        </div>
      </div>

      {/* ====== 底部操作栏 ====== */}
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
