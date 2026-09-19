/**
 * 资产新增/编辑独立页（简化版）
 *
 * 五大模块卡片布局：
 *  1. 资产信息 — 资产编码/资产分类/资产品牌/资产名称/资产照片/资产参数信息
 *  2. 租/购信息 — 采购形式(自购/租用)/价值/日期/存放仓库
 *  3. 当前使用人 — 使用人/所在部门/领用日期
 *  4. 备注信息
 *  5. 入库信息 — 批次号/入库时间/入库数量/验收人（验收入库跳转时自动带入）
 *
 * 级联逻辑：分类 → 资产品牌 → 产品型号 → 参数模板
 * 采购形式条件：自购显示购买公司，租用显示租用公司+租借公司
 * 位置选择：平铺选择仓库位置
 *
 * URL 参数：
 *  - ?id= 编辑模式
 *  - ?inboundBatchNo=&inboundDate=&inboundQty=&inspector= 从验收入库带入
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button, Form, Input, InputNumber, Select, DatePicker, Row, Col,
  Upload, message, Spin, Tag, TreeSelect,
} from 'antd'
import type { UploadFile } from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined,
  PictureOutlined, FileImageOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import {
  createAsset, updateAsset, fetchAssetDetail, parseAssetImages,
  type AssetItem, type AssetSaveData,
} from '../../../api/asset'
import {
  fetchCategoryList, fetchBrandList, fetchModelList, fetchLocationList,
  fetchAllParamTypes, fetchParamValuesByType,
  type AssetCategory, type AssetBrand, type AssetModel, type AssetLocation,
  type ParamType,
} from '../../../api/eam'
import { fetchDepartments, type DepartmentItem } from '../../../api/department'
import AssetTagBindingSection from '../AssetTag/AssetTagBindingSection'
import { useCompanyBrand } from '../../../contexts/CompanyBrandContext'
import { assetParameterFields } from '../../../utils/assetParams'
import '../../../components/AssetParameters.css'

const { TextArea } = Input

const COMPANY_OPTIONS = ['澳觅科技', '闪蜂', 'mFood']

type AssetFormValues = Omit<AssetSaveData, 'purchaseDate' | 'usageDate' | 'rentalPeriod'> & {
  purchaseDate?: Dayjs
  usageDate?: Dayjs
  rentalPeriod?: [Dayjs, Dayjs]
  inboundBatchNo?: string
  inboundDate?: Dayjs
  inboundQty?: number
  inspector?: string
}

/* ==================== 树形部门数据构建 ==================== */
function buildDeptTree(depts: DepartmentItem[]): { title: string; value: string; children?: { title: string; value: string }[] }[] {
  const map = new Map<number, DepartmentItem>()
  depts.forEach((d) => map.set(d.id, d))
  const roots: DepartmentItem[] = []
  const childrenMap = new Map<number, DepartmentItem[]>()
  depts.forEach((d) => {
    if (d.parentId && d.parentId !== 0) {
      if (!childrenMap.has(d.parentId)) childrenMap.set(d.parentId, [])
      childrenMap.get(d.parentId)!.push(d)
    } else {
      roots.push(d)
    }
  })
  return roots.map((r) => ({
    title: r.name,
    value: r.name,
    children: (childrenMap.get(r.id) || []).map((c) => ({ title: c.name, value: c.name })),
  }))
}

/** 构建分类树（支持多级，value 为 code） */
function buildCategoryTree(cats: AssetCategory[]): { title: string; value: string; children?: { title: string; value: string; children?: { title: string; value: string }[] }[] }[] {
  const childrenMap = new Map<number, AssetCategory[]>()
  const roots: AssetCategory[] = []
  cats.forEach((c) => {
    if (c.parentId && c.parentId !== 0) {
      if (!childrenMap.has(c.parentId)) childrenMap.set(c.parentId, [])
      childrenMap.get(c.parentId)!.push(c)
    } else {
      roots.push(c)
    }
  })
  const buildNode = (cat: AssetCategory): { title: string; value: string; children?: { title: string; value: string }[] } => {
    const children = childrenMap.get(cat.id) || []
    return {
      title: `${cat.code} - ${cat.name}`,
      value: cat.code,
      children: children.length ? children.map(buildNode) : undefined,
    }
  }
  return roots.map(buildNode)
}

/* ==================== 主组件 ==================== */
export default function AssetAdd() {
  const { t } = useTranslation()
  const { numericOptions } = useCompanyBrand()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editingId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const isEdit = editingId !== null

  const [form] = Form.useForm<AssetFormValues>()
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<number | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)

  /* ----- 基础数据 ----- */
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [categoryTree, setCategoryTree] = useState<{ title: string; value: string; children?: { title: string; value: string; children?: { title: string; value: string }[] }[] }[]>([])
  const [brands, setBrands] = useState<AssetBrand[]>([])
  const [models, setModels] = useState<AssetModel[]>([])
  const [locations, setLocations] = useState<AssetLocation[]>([])
  const [deptTree, setDeptTree] = useState<{ title: string; value: string; children?: { title: string; value: string }[] }[]>([])

  /* ----- 级联状态 ----- */
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string>('')
  const [selectedBrandId, setSelectedBrandId] = useState<number | undefined>(undefined)
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [paramTypes, setParamTypes] = useState<ParamType[]>([])
  const [paramValuesForSelect, setParamValuesForSelect] = useState<Record<string, string[]>>({})

  /* ----- 图片 ----- */
  const [imageFiles, setImageFiles] = useState<UploadFile[]>([])

  /* ----- 采购形式条件显示 ----- */
  const source = Form.useWatch('source', form)

  /* ----- 存放仓库（平铺选择） ----- */
  const [selectedLocationId, setSelectedLocationId] = useState<number | undefined>(undefined)

  const locationTreeData = useMemo(() => {
    const nodeMap = new Map<number, { title: string; value: number; children?: { title: string; value: number }[] }>()
    locations.forEach(loc => {
      nodeMap.set(loc.id, { title: `${loc.name}（${loc.code}）`, value: loc.id, children: [] })
    })
    const roots: { title: string; value: number; children?: { title: string; value: number }[] }[] = []
    locations.forEach(loc => {
      const node = nodeMap.get(loc.id)!
      const parent = loc.parentId ? nodeMap.get(loc.parentId) : undefined
      if (parent) {
        parent.children = parent.children || []
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    })
    return roots
  }, [locations])

  /* ----- 加载基础数据 ----- */
  useEffect(() => {
    let alive = true
    Promise.all([
      fetchCategoryList().catch(() => []),
      fetchLocationList().catch(() => []),
      fetchDepartments().catch(() => []),
      fetchAllParamTypes().catch(() => []),
    ]).then(([catList, locList, deptList, ptList]) => {
      if (!alive) return
      setCategories(catList)
      setCategoryTree(buildCategoryTree(catList.filter((c) => c.status === 'enabled')))
      setLocations(locList)
      setDeptTree(buildDeptTree(deptList))
      setParamTypes(ptList)
    }).catch(() => { /* 基础数据加载失败不阻塞 */ })
    return () => { alive = false }
  }, [])

  /* ----- 加载编辑数据 ----- */
  useEffect(() => {
    if (!isEdit || !editingId) return
    setLoading(true)
    fetchAssetDetail(editingId)
      .then((data: AssetItem) => {
        setEditingAsset(data)
        setSelectedCategoryCode(data.categoryCode || '')
        setSelectedBrandId(data.brandId || undefined)
        setSelectedModelId(data.modelId || undefined)
        setSelectedLocationId(data.locationId || undefined)
        setParamValues(data.params || {})
        fetchBrandList().then(setBrands).catch(() => setBrands([]))
        if (data.brandId) fetchModelList({ brandId: data.brandId, size: 1000 }).then((res) => setModels(res.records)).catch(() => setModels([]))
        form.setFieldsValue({
          assetNo: data.assetNo,
          assetName: data.assetName,
          assetType: data.categoryCode || data.assetType,
          brand: data.brand,
          companyBrand: data.companyBrand ?? undefined,
          purchaseValue: data.purchaseValue,
          purchaseDate: data.purchaseDate ? dayjs(data.purchaseDate) : undefined,
          usageDate: data.usageDate ? dayjs(data.usageDate) : undefined,
          source: data.source,
          company: data.company,
          department: data.department,
          userName: data.userName,
          remark: data.remark || undefined,
          // 租用专属字段（如有）
          rentalCost: data.rentalCost ?? undefined,
          leaseCompany: data.leaseCompany || '',
          rentalPeriod: data.rentalPeriod?.length === 2
            ? [dayjs(data.rentalPeriod[0]), dayjs(data.rentalPeriod[1])]
            : undefined,
          // 入库信息（如有）
          inboundBatchNo: data.inboundBatchNo || undefined,
          inboundDate: data.inboundDate ? dayjs(data.inboundDate) : undefined,
          inboundQty: data.inboundQty || undefined,
          inspector: data.inspector || undefined,
        })
        // 回填图片
        if (data.images) {
          setImageFiles(parseAssetImages(data.images).map((url, i) => ({
            uid: String(i), name: `image-${i}`, url,
          })))
        }
      })
      .catch((err: Error) => message.error(err.message))
      .finally(() => setLoading(false))
  }, [isEdit, editingId, form])

  /* ----- 从验收入库带入入库信息（URL 参数） ----- */
  useEffect(() => {
    const batchNo = searchParams.get('inboundBatchNo')
    if (batchNo && !isEdit) {
      form.setFieldsValue({
        inboundBatchNo: batchNo,
        inboundDate: searchParams.get('inboundDate') ? dayjs(searchParams.get('inboundDate')!) : dayjs(),
        inboundQty: searchParams.get('inboundQty') ? Number(searchParams.get('inboundQty')) : 1,
        inspector: searchParams.get('inspector') || undefined,
      })
    }
  }, [searchParams, isEdit, form])

  /* ----- 分类变更 → 加载资产品牌 ----- */
  const handleCategoryChange = useCallback((code: string) => {
    setSelectedCategoryCode(code)
    setSelectedModelId(undefined)
    setSelectedBrandId(undefined)
    setParamValues({})
    setParamValuesForSelect({})
    form.setFieldsValue({ brand: undefined, assetName: undefined })
    if (!code) { setBrands([]); setModels([]); return }
    // 资产品牌前缀匹配：选择一级分类时加载其下所有子分类的资产品牌
    fetchBrandList()
      .then((list) => setBrands(list.filter((b) => b.categoryCode.startsWith(code))))
      .catch(() => setBrands([]))
    setModels([])
  }, [form])

  /* ----- 资产品牌变更 → 加载型号 ----- */
  const handleBrandChange = useCallback((brandId: number | undefined) => {
    setSelectedBrandId(brandId)
    setSelectedModelId(undefined)
    form.setFieldValue('assetName', undefined)
    if (!brandId || !selectedCategoryCode) { setModels([]); return }
    // 型号前缀匹配：选择一级分类时加载其下所有子分类的型号
    fetchModelList({ brandId })
      .then((res) => setModels((res.records || []).filter((m) => m.categoryCode.startsWith(selectedCategoryCode))))
      .catch(() => setModels([]))
  }, [selectedCategoryCode, form])

  /* ----- 型号变更 → 预填名称 + 加载参数模板 ----- */
  const handleModelChange = useCallback((modelId: number | undefined) => {
    setSelectedModelId(modelId)
    const model = models.find((m) => m.id === modelId)
    if (model) {
      form.setFieldsValue({ assetName: model.name })
      // 从参数库 API 加载参数模板（biz_eam_param_type 表）
      setParamValues({})
    } else {
      setParamValues({})
    }
  }, [models, form])

  const paramFields = useMemo(() => assetParameterFields({
    params: paramValues,
    categoryCode: models.find(model => model.id === selectedModelId)?.categoryCode || selectedCategoryCode,
  }, { categories, types: paramTypes }), [paramValues, models, selectedModelId, selectedCategoryCode, categories, paramTypes])

  /* ----- 为 select 类型参数加载可选值 ----- */
  // 依賴值穩定的 code 字符串（而非 paramFields 數組引用），避免引用變化重複觸發請求
  const selectFieldKeys = useMemo(
    () => paramFields.filter((f) => f.type === 'select').map((f) => f.key).join(','),
    [paramFields],
  )
  useEffect(() => {
    const keys = selectFieldKeys ? selectFieldKeys.split(',') : []
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
      setParamValuesForSelect(map)
    })
    return () => { alive = false }
  }, [selectFieldKeys])

  // 合并可选值到参数字段
  const paramFieldsWithOptions = useMemo(() => {
    return paramFields.map((f) => ({
      ...f,
      options: f.type === 'select' ? (paramValuesForSelect[f.key] ?? f.options ?? []) : f.options,
    }))
  }, [paramFields, paramValuesForSelect])

  /* ----- 位置选择处理 ----- */
  const handleLocationChange = (id: number | undefined) => {
    setSelectedLocationId(id)
  }

  /* ----- 图片上传 ----- */
  const handleImageUpload = useCallback((file: File) => {
    if (file.size > 2 * 1024 * 1024) { message.warning(t('asset.imageSizeLimitWarn')); return false }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImageFiles((prev) => [...prev, { uid: String(Date.now()) + Math.random(), name: file.name, url: dataUrl }])
    }
    reader.readAsDataURL(file)
    return false
  }, [t])

  /* ----- 保存 ----- */
  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()

      // 校验资产编码
      if (!v.assetNo?.trim()) { message.error(t('asset.assetCodeRequired')); return }

      // 拼接位置信息
      const loc = locations.find((l) => l.id === selectedLocationId)
      const locationParts = loc ? [loc.province, loc.city, loc.district, loc.address].filter(Boolean).join(' ') || loc.name : ''

      setSubmitting(true)
      const category = categories.find((c) => c.code === selectedCategoryCode)
      const payload: AssetSaveData = {
        assetNo: v.assetNo.trim(),
        assetName: v.assetName || '',
        assetType: category?.name || editingAsset?.assetType || v.assetType || '',
        categoryCode: selectedCategoryCode || undefined,
        categoryId: category?.id,
        brandId: selectedBrandId,
        modelId: selectedModelId,
        unit: models.find((m) => m.id === selectedModelId)?.unit || editingAsset?.unit || '',
        quantity: 1,
        brand: v.brand || '',
        purchaseValue: v.purchaseValue || 0,
        purchaseDate: v.purchaseDate ? v.purchaseDate.format('YYYY-MM-DD') : '',
        usageDate: v.usageDate ? v.usageDate.format('YYYY-MM-DD') : '',
        source: v.source || 'self',
        company: v.company || '',
        // 租用专属字段
        rentalCost: v.rentalCost ?? 0,
        leaseCompany: v.leaseCompany || '',
        rentalPeriod: v.rentalPeriod
          ? [v.rentalPeriod[0]?.format('YYYY-MM-DD'), v.rentalPeriod[1]?.format('YYYY-MM-DD')]
          : [],
        locationId: selectedLocationId,
        location: locationParts || editingAsset?.location || '',
        department: v.department || '',
        userName: v.userName || '',
        status: editingAsset?.status || 'idle',
        images: JSON.stringify(imageFiles.filter((f) => f.url).map((f) => f.url)),
        remark: v.remark || '',
        params: paramValues,
      }
      if (isEdit && editingId) {
        await updateAsset(editingId, payload)
        message.success(t('asset.assetUpdateSuccess'))
      } else {
        await createAsset(payload)
        message.success(t('asset.assetAddSuccess'))
      }
      navigate('/asset-list')
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => navigate('/asset-list')

  /* ==================== 卡片标题通用渲染 ==================== */
  const renderCardTitle = (icon: React.ReactNode, iconBg: string, title: string, tag?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {tag && <Tag color="blue" style={{ fontSize: 11 }}>{tag}</Tag>}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )

  /* ==================== 图片上传渲染 ==================== */
  const renderImageUpload = () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {imageFiles.map((file) => (
        <div key={file.uid} style={{
          width: 88, height: 88, border: '1px solid #e8e8e8', borderRadius: 8,
          overflow: 'hidden', position: 'relative', background: '#fafafa',
        }}>
          {file.url ? (
            <img src={file.url} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <FileImageOutlined style={{ fontSize: 28, color: '#1976D2', margin: '22px 0 0 28px' }} />
          )}
          <Button type="text" size="small" danger
            style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#ff4d4f', color: '#fff', fontSize: 12, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setImageFiles((prev) => prev.filter((f) => f.uid !== file.uid))}
          >×</Button>
        </div>
      ))}
      {imageFiles.length < 5 && (
        <Upload accept="image/*" showUploadList={false} beforeUpload={handleImageUpload}>
          <div style={{
            width: 88, height: 88, border: '1px dashed #d9d9d9', borderRadius: 8,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', background: '#fafafa', transition: 'border-color 0.3s',
          }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#E8720C')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#d9d9d9')}
          >
            <PictureOutlined style={{ fontSize: 20, color: '#bfbfbf' }} />
            <span style={{ fontSize: 11, color: '#bfbfbf', marginTop: 4 }}>{t('asset.uploadImage')}</span>
          </div>
        </Upload>
      )}
    </div>
  )

  /* ==================== 参数动态字段渲染 ==================== */
  const renderParamFields = () => {
    if (!paramFields.length) return <span style={{ color: '#bfbfbf', fontSize: 13 }}>{t('asset.selectAssetNameFirst')}</span>
    return (
      <div className="asset-param-editor">
        {paramFieldsWithOptions.map((field) => (
          <div className="asset-param-editor__item" key={field.key}>
            <label className="asset-param-editor__label" htmlFor={`asset-param-${field.key}`}>{field.label}{field.unit ? `（${field.unit}）` : ''}：</label>
            <div className="asset-param-editor__control">
              {field.type === 'select' ? (
                <Select
                  id={`asset-param-${field.key}`}
                  placeholder={t('asset.paramSelectPh', { label: field.label })}
                  allowClear
                  options={(field.options || []).map((o) => ({ label: o, value: o }))}
                  value={paramValues[field.key] || undefined}
                  onChange={(val) => setParamValues((prev) => ({ ...prev, [field.key]: val || '' }))}
                />
              ) : (
                <Input
                  id={`asset-param-${field.key}`}
                  placeholder={t('asset.paramInputPh', { label: `${field.label}${field.unit ? `（${field.unit}）` : ''}` })}
                  allowClear
                  value={paramValues[field.key] || undefined}
                  onChange={(e) => setParamValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {/* ====== 顶部标题栏（橙色渐变顶条） ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleCancel}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1890ff' }}>
            {isEdit ? t('asset.editAssetTitle') : t('asset.addAssetTitle')}
          </h2>
        </div>
      </div>

      <Spin spinning={loading}>
        <Form form={form} layout="vertical" disabled={loading}>

          {/* ====== 模块1：资产信息 ====== */}
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            {renderCardTitle(
              <PictureOutlined style={{ fontSize: 14, color: '#52C41A' }} />,
              '#f6ffed',
              t('asset.assetInfoTitle'),
            )}

            <Row gutter={16}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t('asset.assetNoLabel')} name="assetNo" rules={[{ required: true, message: t('asset.assetCodeRequired') }]}>
                  <Input placeholder={t('asset.assetNoPh')} allowClear disabled={!!editingAsset?.batchId} style={{ fontFamily: 'monospace' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t('asset.assetTypeLabel')} name="assetType" rules={[{ required: true, message: t('asset.assetTypeRequired') }]}>
                  <TreeSelect
                    placeholder={t('asset.assetTypeSelectPh')}
                    allowClear
                    showSearch
                    treeDefaultExpandAll
                    treeNodeFilterProp="title"
                    treeData={categoryTree}
                    onChange={(code) => handleCategoryChange(code || '')}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t('asset.assetBrandLabel')} name="brand">
                  <Select
                    placeholder={t('asset.selectBrandFirstPh')}
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    disabled={!selectedCategoryCode}
                    options={brands.map((b) => ({ label: b.brandZh, value: b.brandZh, id: b.id }))}
                    onChange={(val, opt) => handleBrandChange((opt as { id?: number })?.id)}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t('asset.assetNameLabel')} name="assetName">
                  <Select
                    placeholder={t('asset.selectBrandFirstAssetPh')}
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    disabled={!selectedBrandId}
                    options={models.map((m) => ({ label: m.name, value: m.name, id: m.id }))}
                    onChange={(val, opt) => handleModelChange((opt as { id?: number })?.id)}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t('asset.companyBrandLabel')} name="companyBrand">
                  <Select
                    placeholder={t('asset.selectCompanyBrandPh')}
                    allowClear
                    options={numericOptions}
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* 资产参数信息 */}
            <div style={{ marginTop: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 12 }}>{t('asset.paramInfoSection')}</div>
              {renderParamFields()}
            </div>

            {/* 资产照片 */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 12 }}>{t('asset.assetPhotoSection')}</div>
              {renderImageUpload()}
              <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>{t('asset.photoUploadHint')}</div>
            </div>
          </div>

          {/* ====== 模块2：租/购信息 ====== */}
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            {renderCardTitle(
              <span style={{ fontSize: 14, color: '#E8720C' }}>¥</span>,
              '#fff7e6',
              t('asset.rentPurchaseTitle'),
            )}

            <Row gutter={16}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t('asset.sourceLabel')} name="source" initialValue="self" rules={[{ required: true, message: t('asset.sourceSelectPh') }]}>
                  <Select>
                    <Select.Option value="self">{t('asset.sourceSelfOption')}</Select.Option>
                    <Select.Option value="lease">{t('asset.sourceLeaseOption')}</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              {/* 自购 → 购买公司 + 购买时价值 */}
              {source === 'self' && (
                <>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item label={t('asset.purchaseCompanyLabel')} name="company" rules={[{ required: true, message: t('asset.companyRequired') }]} initialValue="澳觅科技">
                      <Select placeholder={t('asset.selectCompanyPh')}>
                        {COMPANY_OPTIONS.map((o) => <Select.Option key={o} value={o}>{o}</Select.Option>)}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item label={t('asset.purchaseValueLabel')} name="purchaseValue">
                      <InputNumber min={0} step={100} precision={2} placeholder="MOP" style={{ width: '100%' }} addonAfter="MOP" />
                    </Form.Item>
                  </Col>
                </>
              )}
              {/* 租用 → 租用公司 + 租借公司 */}
              {source === 'lease' && (
                <>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item label={t('asset.leaseCompanyLabel')} name="company" rules={[{ required: true, message: t('asset.leaseCompanyRequired') }]}>
                      <Select placeholder={t('asset.selectCompanyPh')}>
                        {COMPANY_OPTIONS.map((o) => <Select.Option key={o} value={o}>{o}</Select.Option>)}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item label={t('asset.rentalCompanyLabel')} name="leaseCompany">
                      <Input placeholder={t('asset.rentalCompanyPh')} allowClear />
                    </Form.Item>
                  </Col>
                </>
              )}
            </Row>

            <Row gutter={16}>
              {/* 自购 → 购买日期 */}
              {source === 'self' && (
                <Col xs={24} sm={12} md={8}>
                  <Form.Item label={t('asset.purchaseDateLabel')} name="purchaseDate">
                    <DatePicker style={{ width: '100%' }} placeholder={t('asset.purchaseDatePh')} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
                  </Form.Item>
                </Col>
              )}
              {/* 租用 → 租金 + 租用周期 */}
              {source === 'lease' && (
                <>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item label={t('asset.rentalCostLabel')} name="rentalCost">
                      <InputNumber min={0} step={100} precision={2} placeholder="MOP" style={{ width: '100%' }} addonAfter="MOP" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={8}>
                    <Form.Item label={t('asset.rentalPeriodLabel')} name="rentalPeriod">
                      <DatePicker.RangePicker style={{ width: '100%' }} placeholder={[t('asset.startDatePh'), t('asset.endDatePh')]} />
                    </Form.Item>
                  </Col>
                </>
              )}
            </Row>

            {/* 存放仓库 */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 12 }}>{t('asset.storageLocationSection')}</div>
              <Row gutter={16}>
                <Col xs={24} sm={12} md={8}>
                  <Form.Item label={t('asset.warehouseLocationLabel')} style={{ marginBottom: 0 }}>
                    <TreeSelect
                      placeholder={t('asset.selectWarehousePh')}
                      allowClear
                      showSearch
                      treeNodeFilterProp="title"
                      treeData={locationTreeData}
                      treeDefaultExpandAll
                      value={selectedLocationId}
                      onChange={handleLocationChange}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </div>
          </div>

          {/* ====== 模块3：当前使用人 ====== */}
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            {renderCardTitle(
              <PictureOutlined style={{ fontSize: 14, color: '#13C2C2' }} />,
              '#E6FFFB',
              t('asset.currentUserTitle'),
            )}

            <Row gutter={16}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t('asset.currentUserLabel')} name="userName">
                  <Input placeholder={t('asset.currentUserPh')} allowClear />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t('asset.departmentLabel')} name="department">
                  <TreeSelect
                    placeholder={t('asset.selectDeptPh')}
                    allowClear
                    showSearch
                    treeDefaultExpandAll
                    treeNodeFilterProp="title"
                    treeData={deptTree}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t('asset.usageDateLabel')} name="usageDate">
                  <DatePicker style={{ width: '100%' }} placeholder={t('asset.usageDatePh')} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* ====== 模块4：备注信息 ====== */}
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            {renderCardTitle(
              <span style={{ fontSize: 14, color: '#722ED1' }}></span>,
              '#f9f0ff',
              t('asset.remarkTitle'),
            )}

            <Form.Item name="remark" style={{ marginBottom: 0 }}>
              <TextArea rows={4} maxLength={500} showCount placeholder={t('asset.remarkPlaceholder')} style={{ borderRadius: 8 }} />
            </Form.Item>
          </div>

          {/* ====== 模块5：入库信息（最底部，验收入库跳转时自动带入） ====== */}
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            {renderCardTitle(
              <PictureOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
              '#e6f7ff',
              t('asset.inboundInfoTitle'),
              searchParams.get('inboundBatchNo') ? t('asset.fromInboundTag') : undefined,
            )}

            <Row gutter={16}>
              <Col xs={24} sm={12} md={6}>
                <Form.Item label={t('asset.inboundBatchNoLabel')} name="inboundBatchNo">
                  <Input placeholder={t('asset.autoGenFromInbound')} disabled />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Form.Item label={t('asset.inboundDateLabel')} name="inboundDate">
                  <DatePicker style={{ width: '100%' }} placeholder={t('asset.autoGenFromInbound')} disabled />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Form.Item label={t('asset.inboundQtyLabel')} name="inboundQty" initialValue={1}>
                  <InputNumber min={1} max={1} style={{ width: '100%' }} disabled />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Form.Item label={t('asset.inspectorLabel')} name="inspector">
                  <Input placeholder={t('asset.autoGenFromInbound')} disabled />
                </Form.Item>
              </Col>
            </Row>
          </div>

        </Form>

        {/* ====== 模塊6：資產標籤（僅編輯模式；新增時無資產 ID，不可綁定） ====== */}
        {isEdit && editingId !== null && (
          <AssetTagBindingSection assetId={editingId} asset={editingAsset} />
        )}
      </Spin>

      {/* ====== 底部操作栏（取消+保存） ====== */}
      <div className="form-footer">
        <Button onClick={handleCancel}>{t('common.cancel')}</Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={submitting}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
