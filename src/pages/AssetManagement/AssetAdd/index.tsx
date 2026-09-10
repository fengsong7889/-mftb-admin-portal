/**
 * 资产新增/编辑独立页（重构版）
 *
 * 四大模块卡片布局：
 *  1. 入库信息 — 批次号/入库时间/入库数量/验收人
 *  2. 资产信息 — 共享模板(分类/品牌/名称) + 动态资产列表(每行独立编码+部门)
 *  3. 租/购信息 — 来源(自购/租用)/价值/日期/存放位置
 *  4. 备注信息
 *
 * 级联逻辑：分类 → 品牌 → 产品型号 → 参数模板
 * 来源条件：自购显示购买公司，租用显示租用公司+租借公司
 * 位置级联：仓库 → 楼层 → 办公室
 * 动态列表：入库数量决定资产条目数，每行有独立资产编码
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button, Form, Input, InputNumber, Select, DatePicker, Row, Col,
  Upload, message, Spin, Tag, TreeSelect,
} from 'antd'
import type { UploadFile } from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, UploadOutlined, PlusOutlined, MinusCircleOutlined,
  PictureOutlined, FileImageOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import {
  createAsset, updateAsset, fetchAssetDetail,
  type AssetItem, type AssetSource,
} from '../../../api/asset'
import {
  fetchCategoryList, fetchBrandList, fetchModelList, fetchLocationList,
  type AssetCategory, type AssetBrand, type AssetModel, type AssetLocation,
  type ParamField,
} from '../../../api/eam'
import { fetchDepartments, type DepartmentItem } from '../../../api/department'

const { TextArea } = Input

const COMPANY_OPTIONS = ['澳觅科技', '闪蜂', 'mFood']

/* ==================== 树形部门数据构建 ==================== */
function buildDeptTree(depts: DepartmentItem[]): { title: string; value: number; children?: { title: string; value: number }[] }[] {
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
    value: r.id,
    children: (childrenMap.get(r.id) || []).map((c) => ({ title: c.name, value: c.id })),
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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editingId = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const isEdit = editingId !== null

  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)

  /* ----- 动态资产列表 ----- */
  const [assetRows, setAssetRows] = useState<{ assetNo: string; department: string | number }[]>([])

  /* ----- 基础数据 ----- */
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [categoryTree, setCategoryTree] = useState<{ title: string; value: string; children?: { title: string; value: string; children?: { title: string; value: string }[] }[] }[]>([])
  const [brands, setBrands] = useState<AssetBrand[]>([])
  const [models, setModels] = useState<AssetModel[]>([])
  const [locations, setLocations] = useState<AssetLocation[]>([])
  const [deptTree, setDeptTree] = useState<{ title: string; value: number; children?: { title: string; value: number }[] }[]>([])

  /* ----- 级联状态 ----- */
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string>('')
  const [selectedBrandId, setSelectedBrandId] = useState<number | undefined>(undefined)
  const [paramFields, setParamFields] = useState<ParamField[]>([])
  const [paramValues, setParamValues] = useState<Record<string, string>>({})

  /* ----- 图片 ----- */
  const [imageFiles, setImageFiles] = useState<UploadFile[]>([])

  /* ----- 来源条件显示 ----- */
  const source = Form.useWatch('source', form)

  /* ----- 位置级联 ----- */
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | undefined>(undefined)
  const [selectedFloorId, setSelectedFloorId] = useState<number | undefined>(undefined)

  const warehouses = useMemo(() => locations.filter((l) => l.type === 'warehouse'), [locations])
  const floors = useMemo(
    () => locations.filter((l) => l.type === 'floor' && l.parentId === selectedWarehouseId),
    [locations, selectedWarehouseId],
  )
  const rooms = useMemo(
    () => locations.filter((l) => l.type === 'room' && l.parentId === selectedFloorId),
    [locations, selectedFloorId],
  )

  /* ----- 加载基础数据 ----- */
  useEffect(() => {
    let alive = true
    Promise.all([
      fetchCategoryList(),
      fetchLocationList(),
      fetchDepartments(),
    ]).then(([catList, locList, deptList]) => {
      if (!alive) return
      setCategories(catList.filter((c) => c.status === 'enabled'))
      setCategoryTree(buildCategoryTree(catList.filter((c) => c.status === 'enabled')))
      setLocations(locList)
      setDeptTree(buildDeptTree(deptList))
    }).catch(() => { /* 基础数据加载失败不阻塞 */ })
    return () => { alive = false }
  }, [])

  /* ----- 加载编辑数据 ----- */
  useEffect(() => {
    if (!isEdit || !editingId) return
    setLoading(true)
    fetchAssetDetail(editingId)
      .then((data: AssetItem) => {
        form.setFieldsValue({
          assetNo: data.assetNo,
          assetName: data.assetName,
          assetType: data.assetType,
          brand: data.brand,
          purchaseValue: data.purchaseValue,
          purchaseDate: data.purchaseDate ? dayjs(data.purchaseDate) : undefined,
          usageDate: data.usageDate ? dayjs(data.usageDate) : undefined,
          source: data.source,
          company: data.company,
          department: data.department,
          userName: data.userName,
          remark: data.remark || undefined,
        })
      })
      .catch((err: Error) => message.error(err.message))
      .finally(() => setLoading(false))
  }, [isEdit, editingId, form])

  /* ----- 分类变更 → 加载品牌 ----- */
  const handleCategoryChange = useCallback((code: string) => {
    setSelectedCategoryCode(code)
    setSelectedBrandId(undefined)
    setParamFields([])
    setParamValues({})
    form.setFieldsValue({ brand: undefined, assetName: undefined })
    if (!code) { setBrands([]); setModels([]); return }
    const cat = categories.find((c) => c.code === code)
    if (cat?.paramTemplate) setParamFields(cat.paramTemplate)
    // 品牌前缀匹配：选择一级分类时加载其下所有子分类的品牌
    fetchBrandList()
      .then((list) => setBrands(list.filter((b) => b.categoryCode.startsWith(code))))
      .catch(() => setBrands([]))
    setModels([])
  }, [categories, form])

  /* ----- 品牌变更 → 加载型号 ----- */
  const handleBrandChange = useCallback((brandId: number | undefined) => {
    setSelectedBrandId(brandId)
    form.setFieldValue('assetName', undefined)
    if (!brandId || !selectedCategoryCode) { setModels([]); return }
    // 型号前缀匹配：选择一级分类时加载其下所有子分类的型号
    fetchModelList({ brandId })
      .then((res) => setModels((res.records || []).filter((m) => m.categoryCode.startsWith(selectedCategoryCode))))
      .catch(() => setModels([]))
  }, [selectedCategoryCode, form])

  /* ----- 型号变更 → 预填名称 ----- */
  const handleModelChange = useCallback((modelId: number | undefined) => {
    const model = models.find((m) => m.id === modelId)
    if (model) {
      form.setFieldsValue({ assetName: model.name })
    }
  }, [models, form])

  /* ----- 位置级联处理 ----- */
  const handleWarehouseChange = (id: number | undefined) => {
    setSelectedWarehouseId(id)
    setSelectedFloorId(undefined)
    form.setFieldValue('locationFloor', undefined)
    form.setFieldValue('locationRoom', undefined)
  }
  const handleFloorChange = (id: number | undefined) => {
    setSelectedFloorId(id)
    form.setFieldValue('locationRoom', undefined)
  }

  /* ----- 生成资产条目 ----- */
  const handleGenerateRows = () => {
    const qty = form.getFieldValue('inboundQty') || 0
    if (qty < 1) { message.warning('请先填写入库数量'); return }
    if (qty > 100) { message.warning('单次入库数量不能超过 100'); return }
    const newRows = Array.from({ length: qty }, (_, i) => ({
      assetNo: '',
      department: assetRows[0]?.department || '',
    }))
    setAssetRows(newRows)
  }

  /* ----- 更新资产条目 ----- */
  const handleAssetRowChange = (index: number, field: 'assetNo' | 'department', value: string | number) => {
    setAssetRows((prev) => prev.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }

  /* ----- 删除资产条目 ----- */
  const handleRemoveRow = (index: number) => {
    setAssetRows((prev) => prev.filter((_, i) => i !== index))
  }

  /* ----- 图片上传 ----- */
  const handleImageUpload = useCallback((file: File) => {
    if (file.size > 2 * 1024 * 1024) { message.warning('图片不能超过 2MB'); return false }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImageFiles((prev) => [...prev, { uid: String(Date.now()) + Math.random(), name: file.name, url: dataUrl }])
    }
    reader.readAsDataURL(file)
    return false
  }, [])

  /* ----- 保存 ----- */
  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()

      // 校验资产条目
      const emptyRows = assetRows.filter((r) => !r.assetNo.trim())
      if (emptyRows.length > 0) { message.error(`第 ${emptyRows.map((r) => assetRows.indexOf(r) + 1).join(', ')} 行资产编码未填写`); return }

      // 拼接位置信息
      const wh = warehouses.find((w) => w.id === selectedWarehouseId)
      const fl = floors.find((f) => f.id === selectedFloorId)
      const rm = rooms.find((r) => r.id === v.locationRoom)
      const locationParts = [wh?.name, fl?.name, rm?.name].filter(Boolean).join('-')

      setSubmitting(true)
      const payload = {
        inboundBatchNo: v.inboundBatchNo || '',
        inboundDate: v.inboundDate ? v.inboundDate.format('YYYY-MM-DD') : null,
        inboundQty: v.inboundQty || assetRows.length,
        inspector: v.inspector || '',
        assets: assetRows.map((row) => ({
          assetNo: row.assetNo,
          assetName: v.assetName || '',
          assetType: v.assetType || '',
          brand: v.brand || '',
          department: row.department || '',
        })),
        purchaseValue: v.purchaseValue || 0,
        purchaseDate: v.purchaseDate ? v.purchaseDate.format('YYYY-MM-DD') : null,
        usageDate: v.usageDate ? v.usageDate.format('YYYY-MM-DD') : null,
        source: v.source || 'self' as AssetSource,
        company: v.company || '',
        location: locationParts,
        department: v.department || '',
        userName: v.userName || '',
        status: 'idle' as const,
        images: imageFiles.filter((f) => f.url).map((f) => f.url).join(',') || null,
        remark: v.remark || null,
        applicant: '当前用户',
        scrapTime: null,
        params: Object.keys(paramValues).length ? paramValues : undefined,
      }
      if (isEdit && editingId) {
        await updateAsset(editingId, payload as any)
        message.success('更新成功')
      } else {
        await createAsset(payload as any)
        message.success('新增成功')
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
            <span style={{ fontSize: 11, color: '#bfbfbf', marginTop: 4 }}>上传图片</span>
          </div>
        </Upload>
      )}
    </div>
  )

  /* ==================== 参数动态字段渲染 ==================== */
  const renderParamFields = () => {
    if (!paramFields.length) return <span style={{ color: '#bfbfbf', fontSize: 13 }}>请先选择资产分类</span>
    return (
      <Row gutter={16}>
        {paramFields.map((field) => (
          <Col span={8} key={field.key}>
            <Form.Item label={field.label} style={{ marginBottom: 0 }}>
              {field.type === 'select' ? (
                <Select
                  placeholder={`请选择${field.label}`}
                  allowClear
                  options={(field.options || []).map((o) => ({ label: o, value: o }))}
                  value={paramValues[field.key] || undefined}
                  onChange={(val) => setParamValues((prev) => ({ ...prev, [field.key]: val || '' }))}
                />
              ) : (
                <Input
                  placeholder={`请输入${field.label}${field.unit ? `（${field.unit}）` : ''}`}
                  allowClear
                  value={paramValues[field.key] || undefined}
                  onChange={(e) => setParamValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
              )}
            </Form.Item>
          </Col>
        ))}
      </Row>
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
            {isEdit ? '编辑资产' : '新增资产'}
          </h2>
        </div>
      </div>

      <Spin spinning={loading}>
        <Form form={form} layout="vertical" disabled={loading}>

          {/* ====== 模块1：入库信息 ====== */}
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            {renderCardTitle(
              <PictureOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
              '#e6f7ff',
              '入库信息',
            )}

            <Row gutter={16}>
              <Col span={6}>
                <Form.Item label="入库批次号" name="inboundBatchNo" rules={[{ required: true, message: '请输入入库批次号' }]}>
                  <Input placeholder="如 RK-2024-0001" allowClear disabled={isEdit} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="入库时间" name="inboundDate" rules={[{ required: true, message: '请选择入库时间' }]}>
                  <DatePicker style={{ width: '100%' }} placeholder="请选择入库时间" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="入库数量" name="inboundQty" rules={[{ required: true, message: '请输入入库数量' }]} initialValue={1}>
                  <InputNumber min={1} max={100} step={1} placeholder="请输入数量" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="验收人" name="inspector" rules={[{ required: true, message: '请输入验收人' }]}>
                  <Input placeholder="请输入验收人" allowClear />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* ====== 模块2：资产信息 ====== */}
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            {renderCardTitle(
              <PictureOutlined style={{ fontSize: 14, color: '#52C41A' }} />,
              '#f6ffed',
              '资产信息',
            )}

            {/* 共享模板：分类/品牌/名称 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 12 }}>资产模板（所有条目共享）</div>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="资产分类" name="assetType" rules={[{ required: true, message: '请选择资产分类' }]}>
                    <TreeSelect
                      placeholder="请选择分类"
                      allowClear
                      showSearch
                      treeDefaultExpandAll
                      treeNodeFilterProp="title"
                      treeData={categoryTree}
                      onChange={(code) => handleCategoryChange(code || '')}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="品牌" name="brand">
                    <Select
                      placeholder="请先选择分类"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      disabled={!selectedCategoryCode}
                      options={brands.map((b) => ({ label: b.brandZh, value: b.brandZh, id: b.id }))}
                      onChange={(val, opt) => handleBrandChange((opt as { id?: number })?.id)}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="资产名称" name="assetName">
                    <Select
                      placeholder="请先选择品牌"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      disabled={!selectedBrandId}
                      options={models.map((m) => ({ label: m.name, value: m.name, id: m.id }))}
                      onChange={(val, opt) => handleModelChange((opt as { id?: number })?.id)}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </div>

            {/* 动态资产列表 */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>资产条目列表（共 {assetRows.length} 条）</div>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleGenerateRows} style={{ height: 28, fontSize: 12 }}>
                  根据数量生成
                </Button>
              </div>

              {assetRows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#bfbfbf', fontSize: 13, background: '#fafafa', borderRadius: 8 }}>
                  请先填写入库数量，然后点击「根据数量生成」创建资产条目
                </div>
              ) : (
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {assetRows.map((row, index) => (
                    <div key={index} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                      background: index % 2 === 0 ? '#fafafa' : '#fff',
                      borderRadius: 6, marginBottom: 6, border: '1px solid #f0f0f0',
                    }}>
                      <span style={{ fontSize: 12, color: '#8c8c8c', minWidth: 28, textAlign: 'center' }}>{index + 1}</span>
                      <div style={{ flex: 1 }}>
                        <Input
                          placeholder="请输入资产编码"
                          allowClear
                          value={row.assetNo}
                          onChange={(e) => handleAssetRowChange(index, 'assetNo', e.target.value)}
                          style={{ fontFamily: 'monospace' }}
                        />
                      </div>
                      <div style={{ width: 200 }}>
                        <TreeSelect
                          placeholder="请选择归属部门"
                          allowClear
                          showSearch
                          treeDefaultExpandAll
                          treeNodeFilterProp="title"
                          treeData={deptTree}
                          value={row.department || undefined}
                          onChange={(val) => handleAssetRowChange(index, 'department', val || '')}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <Button
                        type="text" danger size="small" icon={<MinusCircleOutlined />}
                        onClick={() => handleRemoveRow(index)}
                        style={{ color: '#ff4d4f' }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 参数信息 */}
            <div style={{ marginTop: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 12 }}>参数信息</div>
              {renderParamFields()}
            </div>

            {/* 资产图片 */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 12 }}>资产图片</div>
              {renderImageUpload()}
              <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>支持 jpg/png，每张不超过 2MB，可上传多张</div>
            </div>
          </div>

          {/* ====== 模块2：租/购信息 ====== */}
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            {renderCardTitle(
              <span style={{ fontSize: 14, color: '#E8720C' }}>¥</span>,
              '#fff7e6',
              '租/购信息',
            )}

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="来源" name="source" initialValue="self" rules={[{ required: true, message: '请选择来源' }]}>
                  <Select>
                    <Select.Option value="self">自购</Select.Option>
                    <Select.Option value="lease">租用</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              {/* 自购 → 购买公司 */}
              {source === 'self' && (
                <Col span={8}>
                  <Form.Item label="购买公司" name="company" rules={[{ required: true, message: '请选择购买公司' }]} initialValue="澳觅科技">
                    <Select placeholder="请选择公司">
                      {COMPANY_OPTIONS.map((o) => <Select.Option key={o} value={o}>{o}</Select.Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              )}
              {/* 租用 → 租用公司 + 租借公司 */}
              {source === 'lease' && (
                <>
                  <Col span={8}>
                    <Form.Item label="租用公司" name="company" rules={[{ required: true, message: '请选择租用公司' }]}>
                      <Select placeholder="请选择公司">
                        {COMPANY_OPTIONS.map((o) => <Select.Option key={o} value={o}>{o}</Select.Option>)}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="租借公司" name="leaseCompany">
                      <Input placeholder="请输入租借公司" allowClear />
                    </Form.Item>
                  </Col>
                </>
              )}
              <Col span={source === 'self' ? 8 : 8}>
                <Form.Item label="购买时价值" name="purchaseValue">
                  <InputNumber min={0} step={100} precision={2} placeholder="MOP" style={{ width: '100%' }} addonAfter="MOP" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="入库日期" name="inboundDate">
                  <DatePicker style={{ width: '100%' }} placeholder="请选择入库日期" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="购买日期" name="purchaseDate">
                  <DatePicker style={{ width: '100%' }} placeholder="请选择购买日期" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="使用日期" name="usageDate">
                  <DatePicker style={{ width: '100%' }} placeholder="首次领用日期（自动获取）" />
                </Form.Item>
                <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: -12, marginBottom: 8 }}>系统自动校验，获取首次被人领用的日期</div>
              </Col>
            </Row>

            {/* 存放位置 */}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 12 }}>存放位置</div>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="仓库" style={{ marginBottom: 0 }}>
                    <Select
                      placeholder="请选择仓库"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={warehouses.map((w) => ({ label: `${w.name}（${w.code}）`, value: w.id }))}
                      value={selectedWarehouseId}
                      onChange={handleWarehouseChange}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="楼层" style={{ marginBottom: 0 }}>
                    <Select
                      placeholder="请选择楼层"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      disabled={!selectedWarehouseId}
                      options={floors.map((f) => ({ label: `${f.name}（${f.code}）`, value: f.id }))}
                      value={selectedFloorId}
                      onChange={handleFloorChange}
                    />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="locationRoom" label="办公室" style={{ marginBottom: 0 }}>
                    <Select
                      placeholder="请选择办公室"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      disabled={!selectedFloorId}
                      options={rooms.map((r) => ({ label: `${r.name}（${r.code}）`, value: r.id }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </div>
          </div>

          {/* ====== 模块3：备注信息 ====== */}
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            {renderCardTitle(
              <span style={{ fontSize: 14, color: '#722ED1' }}></span>,
              '#f9f0ff',
              '备注信息',
            )}

            <Form.Item name="remark" style={{ marginBottom: 0 }}>
              <TextArea rows={4} maxLength={500} showCount placeholder="可填写备注信息" style={{ borderRadius: 8 }} />
            </Form.Item>
          </div>

        </Form>
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
