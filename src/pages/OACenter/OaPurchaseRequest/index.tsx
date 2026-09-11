/**
 * OA 採購申請表單頁
 *
 * - 基於原 AssetManagement/PurchaseRequest/RequestForm 改造
 * - 適配 OA 流程：橙色標題欄 + 模塊化卡片佈局
 * - P0-1: 對接 OA 審批 API，提交時調用 submitOaRequest
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button, Form, Input, InputNumber, Select, Row, Col, Space, Spin, message,
  Table, Tag, Modal, Upload, TreeSelect,
} from 'antd'
import type { TableColumnsType, UploadFile } from 'antd'
import {
  ArrowLeftOutlined, SendOutlined, SaveOutlined, PlusOutlined, ShoppingCartOutlined,
  FileTextOutlined, UploadOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
  FileImageOutlined, FilePdfOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import dayjs from 'dayjs'
import {
  fetchModelList, fetchCategoryList, fetchBrandList,
  type AssetModel, type AssetCategory, type AssetBrand,
} from '../../../api/eam'
import { fetchDepartments, DEPT_STATUS, type DepartmentItem } from '../../../api/department'
import { submitOaRequest } from '../../../api/oaRequest'
import { useWorkflowConfig } from '../../../hooks/useWorkflowConfig'

/** 流程標籤 → 顏色映射（與 WorkflowConfig 保持一致） */
const FLOW_TAG_COLOR: Record<string, string> = {
  oa_purchase: '#FA8C16',
}
/** 流程標籤 → 文字映射 */
const FLOW_TAG_LABEL: Record<string, string> = {
  oa_purchase: '採購',
}

/* ==================== 部門樹數據 ==================== */

interface DeptTreeOption {
  value: number
  title: string
  disabled?: boolean
  children?: DeptTreeOption[]
}

function buildDeptTreeData(list: DepartmentItem[]): DeptTreeOption[] {
  const nodeMap = new Map<number, DeptTreeOption>()
  list.forEach(dept => {
    nodeMap.set(dept.id, {
      value: dept.id,
      title: dept.name,
      disabled: dept.status !== DEPT_STATUS.ENABLED,
      children: [],
    })
  })
  const roots: DeptTreeOption[] = []
  list.forEach(dept => {
    const node = nodeMap.get(dept.id)!
    const parent = dept.parentId ? nodeMap.get(dept.parentId) : undefined
    if (parent) {
      parent.children!.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

/* ==================== 類型定義 ==================== */

interface ItemRow {
  key: string
  categoryId?: number
  categoryName?: string
  brandId?: number
  brandName?: string
  modelId?: number
  modelName?: string
  params?: Record<string, string>
  qty?: number
  remark?: string
}

interface FormValues {
  title: string
  department: number | undefined
  reason: string
  items: ItemRow[]
}

/* ==================== 分類樹（TreeSelect） ==================== */

interface CategoryTreeNode {
  value: number
  title: string
  code: string
  children?: CategoryTreeNode[]
}

function buildCategoryTree(list: AssetCategory[]): CategoryTreeNode[] {
  const nodeMap = new Map<number, CategoryTreeNode>()
  list.forEach((c) => {
    nodeMap.set(c.id, { value: c.id, title: c.name, code: c.code, children: [] })
  })
  const roots: CategoryTreeNode[] = []
  list.forEach((c) => {
    const node = nodeMap.get(c.id)!
    if (c.parentId && nodeMap.has(c.parentId)) {
      nodeMap.get(c.parentId)!.children!.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

/* ==================== 明細編輯彈窗 ==================== */

interface ItemEditModalProps {
  open: boolean
  editing: ItemRow | null
  categories: AssetCategory[]
  brands: AssetBrand[]
  models: AssetModel[]
  onOk: (row: ItemRow) => void
  onCancel: () => void
}

function ItemEditModal({ open, editing, categories, brands, models, onOk, onCancel }: ItemEditModalProps) {
  const [form] = Form.useForm<ItemRow>()
  const { t } = useTranslation()

  // 級聯狀態
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string | undefined>()
  const [selectedBrandId, setSelectedBrandId] = useState<number | undefined>()
  const [selectedModel, setSelectedModel] = useState<AssetModel | undefined>()

  // 分類樹
  const categoryTree = useMemo(() => buildCategoryTree(categories.filter((c) => c.status === 'enabled')), [categories])

  // 根據分類篩選品牌
  const filteredBrands = useMemo(
    () => selectedCategoryCode ? brands.filter((b) => b.categoryCode === selectedCategoryCode) : [],
    [brands, selectedCategoryCode],
  )

  // 根據分類+品牌篩選型號
  const filteredModels = useMemo(
    () => models.filter((m) => {
      if (!selectedCategoryCode) return false
      const codeMatch = m.categoryCode === selectedCategoryCode || m.categoryCode.startsWith(`${selectedCategoryCode}-`)
      const brandMatch = selectedBrandId ? m.brandId === selectedBrandId : true
      return codeMatch && brandMatch
    }),
    [models, selectedCategoryCode, selectedBrandId],
  )

  // 當前分類的參數模板
  const paramTemplate = useMemo(() => {
    if (!selectedCategoryCode) return []
    const cat = categories.find((c) => c.code === selectedCategoryCode)
    return cat?.paramTemplate || []
  }, [categories, selectedCategoryCode])

  useEffect(() => {
    if (open && editing) {
      form.setFieldsValue(editing)
      // 還原級聯狀態
      const cat = editing.categoryName ? categories.find((c) => c.id === editing.categoryId) : undefined
      setSelectedCategoryCode(cat?.code)
      setSelectedBrandId(editing.brandId)
      setSelectedModel(editing.modelId ? models.find((m) => m.id === editing.modelId) : undefined)
    } else if (open) {
      form.resetFields()
      form.setFieldsValue({ qty: 1 })
      setSelectedCategoryCode(undefined)
      setSelectedBrandId(undefined)
      setSelectedModel(undefined)
    }
  }, [open, editing, form, categories, models])

  const handleCategoryChange = (categoryId: number) => {
    const cat = categories.find((c) => c.id === categoryId)
    const code = cat?.code
    setSelectedCategoryCode(code)
    setSelectedBrandId(undefined)
    setSelectedModel(undefined)
    form.setFieldsValue({ brandId: undefined, modelId: undefined, params: {} })
  }

  const handleBrandChange = (brandId: number) => {
    setSelectedBrandId(brandId)
    setSelectedModel(undefined)
    form.setFieldsValue({ modelId: undefined })
  }

  const handleModelChange = (modelId: number) => {
    const m = models.find((x) => x.id === modelId)
    setSelectedModel(m)
  }

  const handleOk = async () => {
    try {
      const v = await form.validateFields()
      const cat = categories.find((c) => c.id === v.categoryId)
      const brand = brands.find((b) => b.id === v.brandId)
      const model = models.find((m) => m.id === v.modelId)
      onOk({
        ...v,
        key: editing?.key || `item_${Date.now()}`,
        categoryName: cat?.name,
        brandName: brand?.brandZh,
        modelName: model?.name,
      })
    } catch { /* antd 已標紅 */ }
  }

  return (
    <Modal
      title={editing ? '編輯物資' : '添加物資'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText={t('common:confirm')}
      cancelText={t('common:cancel')}
      width={640}
      centered
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label="資產分類" name="categoryId"
              rules={[{ required: true, message: '請選擇資產分類' }]}
            >
              <TreeSelect
                treeData={categoryTree}
                placeholder="請選擇分類"
                allowClear
                treeDefaultExpandAll
                showSearch
                treeNodeFilterProp="title"
                onChange={handleCategoryChange}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="品牌" name="brandId"
              rules={[{ required: true, message: '請選擇品牌' }]}
            >
              <Select
                placeholder={selectedCategoryCode ? '請選擇品牌' : '請先選擇分類'}
                showSearch
                optionFilterProp="label"
                disabled={!selectedCategoryCode}
                onChange={handleBrandChange}
                options={filteredBrands.map((b) => ({
                  label: b.brandZh,
                  value: b.id,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="資產名稱" name="modelId"
              rules={[{ required: true, message: '請選擇資產名稱' }]}
            >
              <Select
                placeholder={selectedBrandId ? '請選擇資產' : '請先選擇品牌'}
                showSearch
                optionFilterProp="label"
                disabled={!selectedBrandId}
                onChange={handleModelChange}
                options={filteredModels.map((m) => ({
                  label: m.modelNo ? `${m.modelNo} / ${m.name}` : m.name,
                  value: m.id,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* 參數信息（選擇資產名稱後顯示） */}
        {selectedModel && paramTemplate.length > 0 && (
          <div style={{
            background: '#fafafa', borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            border: '1px solid #f0f0f0',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 10 }}>參數信息</div>
            <Row gutter={12}>
              {paramTemplate.map((p) => (
                <Col span={8} key={p.key}>
                  <Form.Item
                    label={<span style={{ fontSize: 12 }}>{p.label}{p.unit ? ` (${p.unit})` : ''}</span>}
                    name={['params', p.key]}
                    style={{ marginBottom: 8 }}
                  >
                    {p.type === 'select' ? (
                      <Select
                        placeholder={`請選擇${p.label}`}
                        allowClear
                        size="small"
                        options={p.options?.map((o) => ({ label: o, value: o })) || []}
                      />
                    ) : (
                      <Input placeholder={`請輸入${p.label}`} allowClear size="small" />
                    )}
                  </Form.Item>
                </Col>
              ))}
            </Row>
          </div>
        )}

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label="數量" name="qty"
              rules={[{ required: true, message: '請輸入數量' }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="備註" name="remark">
          <Input placeholder="備註（可選）" allowClear />
        </Form.Item>
      </Form>
    </Modal>
  )
}

/* ==================== 主頁面 ==================== */

export default function OaPurchaseRequest() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromPage = searchParams.get('from')
  const { user } = useAuth()
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  /** 提交成功彈窗（與充值/扣款/轉賬/合併/贈送/AI申請等流程保持一致） */
  const [successVisible, setSuccessVisible] = useState(false)
  const [submittedFlowNo, setSubmittedFlowNo] = useState('')
  const [countdown, setCountdown] = useState(5)

  // 從流程配置獲取採購申請的流程名稱、標籤、審批節點
  const { getWorkflowByKey } = useWorkflowConfig()
  const workflowDef = getWorkflowByKey('oa_purchase')
  const flowName = workflowDef?.name || '採購申請'
  const flowTag = workflowDef?.tag || FLOW_TAG_LABEL['oa_purchase'] || '採購'
  const flowTagColor = workflowDef?.tagColor || FLOW_TAG_COLOR['oa_purchase'] || '#FA8C16'
  const [models, setModels] = useState<AssetModel[]>([])
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [brands, setBrands] = useState<AssetBrand[]>([])

  // 部門樹數據
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const deptTreeData = useMemo(
    () => buildDeptTreeData(departments),
    [departments],
  )
  // 部門 ID → 名稱映射（提交時使用）
  const deptNameMap = useMemo(() => {
    const map = new Map<number, string>()
    departments.forEach((d) => map.set(d.id, d.name))
    return map
  }, [departments])

  // 提交成功彈窗倒計時
  useEffect(() => {
    if (!successVisible) return
    if (countdown <= 0) {
      setSuccessVisible(false)
      navigate('/oa-requests')
      return
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [successVisible, countdown, navigate])

  // 明細列表
  const [items, setItems] = useState<ItemRow[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)

  // 憑證上傳
  const [certificateFiles, setCertificateFiles] = useState<UploadFile[]>([])

  // 申請日期 & 流程編號
  const applyDate = dayjs().format('YYYY-MM-DD')

  const modelOf = (modelId?: number) => models.find((m) => m.id === modelId)

  useEffect(() => {
    let alive = true
    setLoading(true)

    const safeFetch = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
      p.catch(() => fallback)

    Promise.allSettled([
      safeFetch(fetchModelList({ size: 9999 }), { records: [], total: 0 }),
      safeFetch(fetchCategoryList(), []),
      safeFetch(fetchBrandList(), []),
      safeFetch(fetchDepartments(), []),
    ])
      .then(([modelRes, catRes, brandRes, deptRes]) => {
        if (!alive) return
        const modelData = modelRes.status === 'fulfilled' ? modelRes.value : { records: [], total: 0 }
        const catData = catRes.status === 'fulfilled' ? catRes.value : []
        const brandData = brandRes.status === 'fulfilled' ? brandRes.value : []
        const deptData = deptRes.status === 'fulfilled' ? deptRes.value : []
        setModels(modelData.records || [])
        setCategories(catData)
        setBrands(brandData)
        setDepartments(deptData)
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // 自動填充申請部門（按部門名稱匹配 ID）
  useEffect(() => {
    if (user?.department && departments.length && !form.getFieldValue('department')) {
      const matched = departments.find((d) => d.name === user.department)
      if (matched) {
        form.setFieldsValue({ department: matched.id })
      }
    }
  }, [user, departments, form])

  /* ---- 明細操作 ---- */
  const handleAddItem = () => {
    setEditingItem(null)
    setModalOpen(true)
  }

  const handleEditItem = (row: ItemRow) => {
    setEditingItem(row)
    setModalOpen(true)
  }

  const handleModalOk = (row: ItemRow) => {
    setItems((prev) => {
      const idx = prev.findIndex((r) => r.key === row.key)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = row
        return next
      }
      return [...prev, row]
    })
    setModalOpen(false)
  }

  const handleDeleteItem = (key: string) => {
    setItems((prev) => prev.filter((r) => r.key !== key))
  }

  /* ---- 文件上傳 ---- */
  const beforeUpload = useCallback((file: File) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
    if (!validTypes.includes(file.type)) {
      message.error('僅支持 JPG、PNG、PDF 格式')
      return Upload.LIST_IGNORE
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('文件大小不能超過 5MB')
      return Upload.LIST_IGNORE
    }
    return false
  }, [])

  /* ---- 保存草稿（二次確認） ---- */
  const handleSaveDraft = () => {
    form.validateFields().then((v) => {
      if (!items.length) {
        message.error('請至少添加一條採購明細')
        return
      }
      Modal.confirm({
        title: '確認保存',
        icon: <ExclamationCircleOutlined />,
        content: '確認保存當前採購申請為草稿？保存後可在「我的申請」中查看。',
        okText: '確認保存',
        cancelText: '取消',
        centered: true,
        onOk: async () => {
          const payload = {
            department: v.department ? (deptNameMap.get(v.department) || '') : '',
            departmentId: v.department,
            applicant: user?.name || '',
            applicantEmpId: user?.empId || '',
            reason: v.reason.trim(),
            items: items.map((it) => ({
              modelId: it.modelId as number,
              modelName: it.modelName || modelOf(it.modelId)?.name || '',
              qty: it.qty as number,
              remark: it.remark,
            })),
            certificateFiles: certificateFiles.map((f) => f.name),
          }
          setSubmitting(true)
          try {
            const title = `採購申請-${user?.name || ''}-${dayjs().format('YYYYMMDD')}`
            await submitOaRequest({
              processCode: 'oa_purchase',
              title,
              formData: JSON.stringify(payload),
              flowStatus: 'draft',
            })
          } catch {
            message.error('保存失敗，請重試')
            setSubmitting(false)
            return
          } finally {
            setSubmitting(false)
          }
          message.success('草稿已保存')
          navigate('/oa-requests')
        },
      })
    }).catch(() => { /* antd 已標紅必填字段 */ })
  }

  /* ---- 提交 ---- */
  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      if (!items.length) {
        message.error('請至少添加一條採購明細')
        return
      }
      const payload = {
        department: v.department ? (deptNameMap.get(v.department) || '') : '',
        departmentId: v.department,
        applicant: user?.name || '',
        applicantEmpId: user?.empId || '',
        reason: v.reason.trim(),
        items: items.map((it) => ({
          modelId: it.modelId as number,
          modelName: it.modelName || modelOf(it.modelId)?.name || '',
          qty: it.qty as number,
          remark: it.remark,
        })),
        certificateFiles: certificateFiles.map((f) => f.name),
      }
      setSubmitting(true)
      // P0-1: 對接 OA 審批 API
      const title = `採購申請-${user?.name || ''}-${dayjs().format('YYYYMMDD')}`
      const flowNo = await submitOaRequest({
        processCode: 'oa_purchase',
        title,
        formData: JSON.stringify(payload),
      })
      setSubmittedFlowNo(flowNo || '')
      setCountdown(5)
      setSuccessVisible(true)
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  /* ---- 明細表格列 ---- */
  const itemColumns: TableColumnsType<ItemRow> = [
    {
      title: '資產分類', dataIndex: 'categoryName', key: 'categoryName', width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '品牌', dataIndex: 'brandName', key: 'brandName', width: 80,
      render: (v: string) => v || '-',
    },
    {
      title: '資產名稱', dataIndex: 'modelName', key: 'modelName', width: 140,
      render: (v: string) => v || '-',
    },
    {
      title: '參數信息', dataIndex: 'params', key: 'params', width: 160,
      render: (v: Record<string, string> | undefined) => {
        if (!v || Object.keys(v).length === 0) return '-'
        return Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(', ')
      },
    },
    { title: '數量', dataIndex: 'qty', key: 'qty', width: 70, align: 'right' },
    {
      title: '備註', dataIndex: 'remark', key: 'remark', width: 140,
      render: (v: string) => v || '-',
    },
    {
      title: '操作', key: 'action', width: 120, align: 'center', fixed: 'right',
      render: (_: unknown, row: ItemRow) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => handleEditItem(row)}>編輯</Button>
          <Button type="link" size="small" danger onClick={() => handleDeleteItem(row.key)}>刪除</Button>
        </Space>
      ),
    },
  ]

  /* ---- 渲染憑證列表 ---- */
  const renderFileList = () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {certificateFiles.map((file) => (
        <div key={file.uid} style={{
          width: 88, height: 88, border: '1px solid #e8e8e8', borderRadius: 8,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          position: 'relative', background: '#fafafa',
        }}>
          {file.name?.endsWith('.pdf')
            ? <FilePdfOutlined style={{ fontSize: 28, color: '#E53935' }} />
            : <FileImageOutlined style={{ fontSize: 28, color: '#1976D2' }} />
          }
          <span style={{
            fontSize: 10, color: '#999', marginTop: 4, maxWidth: 76,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{file.name}</span>
          <Button type="text" size="small" danger
            style={{
              position: 'absolute', top: -6, right: -6, width: 20, height: 20,
              borderRadius: '50%', background: '#ff4d4f', color: '#fff',
              fontSize: 12, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => setCertificateFiles(certificateFiles.filter((f) => f.uid !== file.uid))}
          >×</Button>
        </div>
      ))}
      {certificateFiles.length < 5 && (
        <Upload
          accept=".png,.jpg,.jpeg,.pdf"
          showUploadList={false}
          beforeUpload={beforeUpload}
          onChange={(info) => {
            if (info.file.status !== 'removed') {
              setCertificateFiles([...certificateFiles, { uid: info.file.uid, name: info.file.name }])
            }
          }}
        >
          <div style={{
            width: 88, height: 88, border: '1px dashed #d9d9d9', borderRadius: 8,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#999', fontSize: 12, background: '#fafafa',
            transition: 'all 0.3s',
          }}
            onMouseEnter={(e) => {
              const el = e.currentTarget
              el.style.borderColor = '#E8720C'
              el.style.background = '#fff7e6'
              el.style.color = '#E8720C'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget
              el.style.borderColor = '#d9d9d9'
              el.style.background = '#fafafa'
              el.style.color = '#999'
            }}
          >
            <UploadOutlined style={{ fontSize: 22, marginBottom: 4, color: 'inherit' }} />
            <span>上傳憑證</span>
          </div>
        </Upload>
      )}
    </div>
  )

  return (
    <Spin spinning={loading}>
      {/* ====== 頂部標題欄（橙色） ====== */}
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
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />}
              onClick={() => navigate(fromPage === 'purchase-order' ? '/purchase-order' : '/process-center')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>{t('common:back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{flowName}</h2>
              <Tag color={flowTagColor} style={{ fontSize: 11 }}>{flowTag}</Tag>
            </div>
          </div>
        </div>
      </div>

      <Form<FormValues> form={form} layout="vertical">
        {/* ====== 基本信息（自動填充） ====== */}
        <div style={{
          border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
          padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: '#fff7e6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileTextOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基本信息</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          {/* 申請人信息行 */}
          <Row gutter={24} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>申請人</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>
                {user ? `${user.name}(${user.empId})` : '-'}
              </div>
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>申請日期</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{applyDate}</div>
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>流程編號</div>
              <div style={{ fontSize: 13, color: '#BFBFBF' }}>提交後系統自動生成</div>
            </Col>
          </Row>

          {/* 部門 / 職位 / 公司 */}
          <Row gutter={24} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>服務部門</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{user?.department || '-'}</div>
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>職位</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{user?.position || '-'}</div>
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>所屬公司</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>閃蜂科技有限公司</div>
            </Col>
          </Row>

          {/* 表單字段：部門選擇、事由 */}
          <Row gutter={24}>
            <Col span={8}>
              <Form.Item
                label="申請部門" name="department"
                rules={[{ required: true, message: '請選擇申請部門' }]}
              >
                <TreeSelect
                  treeData={deptTreeData}
                  placeholder="請選擇部門"
                  allowClear
                  treeDefaultExpandAll
                  showSearch
                  treeNodeFilterProp="title"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="採購事由" name="reason"
            rules={[{ required: true, message: '請輸入採購事由' }]}
          >
            <Input.TextArea rows={2} placeholder="請說明採購原因及用途" />
          </Form.Item>
        </div>

        {/* ====== 採購明細（彈窗編輯） ====== */}
        <div style={{
          border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
          padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: '#f0f5ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShoppingCartOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>採購明細</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <Table<ItemRow>
            columns={itemColumns}
            dataSource={items}
            pagination={false}
            size="small"
            scroll={{ x: 1100 }}
            locale={{ emptyText: '暫無明細，請點擊下方按鈕添加' }}
            style={{ marginBottom: 16 }}
          />
          <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddItem}>
            添加物資
          </Button>
        </div>

        {/* ====== 相關憑證 ====== */}
        <div style={{
          border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
          padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: '#e6f7ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <UploadOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>相關憑證</span>
            <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>支持 JPG、PNG、PDF，單文件不超過 5MB</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          {renderFileList()}
        </div>
      </Form>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={() => navigate('/process-center')}>取消</Button>
          <Button icon={<SaveOutlined />} loading={submitting} onClick={handleSaveDraft}>
            保存
          </Button>
          <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>
            提交審批
          </Button>
        </Space>
      </div>

      {/* ====== 明細編輯彈窗 ====== */}
      <ItemEditModal
        open={modalOpen}
        editing={editingItem}
        categories={categories}
        brands={brands}
        models={models}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
      />

      {/* ====== 提交成功彈窗（與充值/扣款/轉賬/合併/贈送/AI申請等流程統一規範） ====== */}
      {successVisible && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '32px 28px',
            width: 400, textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          }}>
            <div style={{
              width: 64, height: 64, margin: '0 auto 20px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #52C41A, #73D13D)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(82,196,26,0.3)',
            }}>
              <CheckCircleOutlined style={{ fontSize: 32, color: '#fff' }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#262626', marginBottom: 12 }}>
              提交成功
            </h3>
            <p style={{ fontSize: 14, color: '#595959', lineHeight: 1.8, marginBottom: 24 }}>
              {submittedFlowNo && (
                <>
                  流程編號：<span style={{ color: '#E8720C', fontWeight: 500 }}>{submittedFlowNo}</span>
                  <br />
                </>
              )}
              採購申請已提交，請在流程事項中查看審批進度
            </p>
            <Button
              type="primary"
              size="large"
              onClick={() => { setSuccessVisible(false); navigate('/oa-requests') }}
              style={{ minWidth: 120, height: 40, borderRadius: 8, backgroundColor: '#E8720C', borderColor: '#E8720C' }}
            >
              前往流程事項（{countdown}s）
            </Button>
          </div>
        </div>
      )}
    </Spin>
  )
}
