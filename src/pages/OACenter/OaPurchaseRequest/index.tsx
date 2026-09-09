/**
 * OA 採購申請表單頁
 *
 * - 基於原 AssetManagement/PurchaseRequest/RequestForm 改造
 * - 適配 OA 流程：橙色標題欄 + 模塊化卡片佈局
 * - 前端先行：暫不對接後端 OA 審批 API，使用 mock 提交
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Form, Input, InputNumber, Select, Row, Col, Space, Spin, message,
  Table, Tag, Modal, Upload,
} from 'antd'
import type { TableColumnsType, UploadFile } from 'antd'
import {
  ArrowLeftOutlined, SendOutlined, PlusOutlined, ShoppingCartOutlined,
  FileTextOutlined, EditOutlined, UploadOutlined,
  FileImageOutlined, FilePdfOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import dayjs from 'dayjs'
import {
  fetchModelList, type AssetModel,
} from '../../../api/eam'
import { EAM_DEPARTMENTS } from '../../AssetManagement/eamUtils'

/* ==================== 類型定義 ==================== */

interface ItemRow {
  key: string
  modelId?: number
  modelName?: string
  qty?: number
  estPrice?: number
  remark?: string
}

interface FormValues {
  title: string
  department: string
  reason: string
  items: ItemRow[]
  remark?: string
}

/* ==================== 明細編輯彈窗 ==================== */

interface ItemEditModalProps {
  open: boolean
  editing: ItemRow | null
  models: AssetModel[]
  onOk: (row: ItemRow) => void
  onCancel: () => void
}

function ItemEditModal({ open, editing, models, onOk, onCancel }: ItemEditModalProps) {
  const [form] = Form.useForm<ItemRow>()
  const { t } = useTranslation()

  useEffect(() => {
    if (open && editing) {
      form.setFieldsValue(editing)
    } else if (open) {
      form.resetFields()
      form.setFieldsValue({ qty: 1 })
    }
  }, [open, editing, form])

  const handleModelChange = (modelId: number) => {
    const m = models.find((x) => x.id === modelId)
    if (m) {
      form.setFieldsValue({ modelName: `${m.brand} ${m.modelNo} / ${m.name}`, estPrice: m.refPrice })
    }
  }

  const handleOk = async () => {
    try {
      const v = await form.validateFields()
      onOk({ ...v, key: editing?.key || `item_${Date.now()}` })
    } catch { /* antd 已標紅 */ }
  }

  return (
    <Modal
      title={editing ? '編輯明細' : '添加明細'}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText={t('common:confirm')}
      cancelText={t('common:cancel')}
      width={560}
      centered
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          label="品牌型號" name="modelId"
          rules={[{ required: true, message: '請選擇型號' }]}
        >
          <Select
            placeholder="請選擇品牌型號" showSearch
            optionFilterProp="label"
            onChange={handleModelChange}
            options={models.map((m) => ({
              label: `${m.brand} ${m.modelNo} / ${m.name}`,
              value: m.id,
            }))}
          />
        </Form.Item>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label="數量" name="qty"
              rules={[{ required: true, message: '請輸入數量' }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="參考單價" name="estPrice">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} disabled />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="小計">
              <InputNumber
                style={{ width: '100%' }}
                value={(form.getFieldValue('qty') || 0) * (form.getFieldValue('estPrice') || 0)}
                disabled
                formatter={(v) => `MOP ${Number(v).toLocaleString()}`}
              />
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
  const { user } = useAuth()
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [models, setModels] = useState<AssetModel[]>([])

  // 明細列表
  const [items, setItems] = useState<ItemRow[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)

  // 憑證上傳
  const [certificateFiles, setCertificateFiles] = useState<UploadFile[]>([])

  // 申請日期 & 流程編號
  const applyDate = dayjs().format('YYYY-MM-DD')

  const modelOf = (modelId?: number) => models.find((m) => m.id === modelId)

  /** 明細合計 */
  const totalAmount = items.reduce((s, it) => s + (it.qty || 0) * (it.estPrice || 0), 0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchModelList({ size: 9999 })
      .then((res) => { if (alive) setModels(res.records || []) })
      .catch((e: Error) => message.error(e.message))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // 自動填充申請部門
  useEffect(() => {
    if (user?.department && !form.getFieldValue('department')) {
      form.setFieldsValue({ department: user.department })
    }
  }, [user, form])

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

  /* ---- 提交 ---- */
  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      if (!items.length) {
        message.error('請至少添加一條採購明細')
        return
      }
      if (!certificateFiles.length) {
        message.warning('請上傳相關憑證')
        return
      }
      const payload = {
        title: v.title.trim(),
        department: v.department,
        applicant: user?.name || '',
        applicantEmpId: user?.empId || '',
        reason: v.reason.trim(),
        items: items.map((it) => ({
          modelId: it.modelId as number,
          modelName: it.modelName || modelOf(it.modelId)?.name || '',
          qty: it.qty as number,
          estPrice: it.estPrice ?? modelOf(it.modelId)?.refPrice ?? 0,
          remark: it.remark,
        })),
        remark: v.remark,
        certificateFiles: certificateFiles.map((f) => f.name),
      }
      setSubmitting(true)
      // 前端先行：暫用 mock 提交
      console.log('採購申請提交:', payload)
      message.success('採購申請已提交，請在流程事項中查看審批進度')
      navigate('/oa-requests')
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  /* ---- 明細表格列 ---- */
  const itemColumns: TableColumnsType<ItemRow> = [
    {
      title: '品牌型號', dataIndex: 'modelName', key: 'modelName',
      render: (_: unknown, row: ItemRow) => {
        if (row.modelName) return row.modelName
        const m = modelOf(row.modelId)
        return m ? `${m.brand} ${m.modelNo} / ${m.name}` : '-'
      },
    },
    { title: '數量', dataIndex: 'qty', key: 'qty', width: 80, align: 'right' },
    {
      title: '參考單價', dataIndex: 'estPrice', key: 'estPrice', width: 120, align: 'right',
      render: (v: number | undefined) => (v ? `MOP ${v.toLocaleString()}` : '-'),
    },
    {
      title: '小計', key: 'subtotal', width: 120, align: 'right',
      render: (_: unknown, row: ItemRow) => `MOP ${((row.qty || 0) * (row.estPrice || 0)).toLocaleString()}`,
    },
    {
      title: '備註', dataIndex: 'remark', key: 'remark',
      render: (v: string) => v || '-',
    },
    {
      title: '操作', key: 'action', width: 120, align: 'center',
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
              onClick={() => navigate('/process-center')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>{t('common:back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#E8720C' }}>採購申請</h2>
              <Tag color="orange" style={{ fontSize: 11 }}>行政中心</Tag>
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
                <Select
                  placeholder="請選擇部門" showSearch
                  options={EAM_DEPARTMENTS.map((d) => ({ label: d, value: d }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="申請事由" name="reason"
            rules={[{ required: true, message: '請輸入申請事由' }]}
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
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>
              合計：MOP {totalAmount.toLocaleString()}
            </Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <Table<ItemRow>
            columns={itemColumns}
            dataSource={items}
            pagination={false}
            size="small"
            locale={{ emptyText: '暫無明細，請點擊下方按鈕添加' }}
            style={{ marginBottom: 16 }}
          />
          <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddItem}>
            添加明細
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

        {/* ====== 備註信息 ====== */}
        <div style={{
          border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
          padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: '#f6ffed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <EditOutlined style={{ fontSize: 14, color: '#52c41a' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>備註信息</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <Form.Item label="備註" name="remark">
            <Input.TextArea rows={3} placeholder="其他備註信息" />
          </Form.Item>
        </div>
      </Form>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={() => navigate('/process-center')}>取消</Button>
          <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>
            提交審批
          </Button>
        </Space>
      </div>

      {/* ====== 明細編輯彈窗 ====== */}
      <ItemEditModal
        open={modalOpen}
        editing={editingItem}
        models={models}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
      />
    </Spin>
  )
}
