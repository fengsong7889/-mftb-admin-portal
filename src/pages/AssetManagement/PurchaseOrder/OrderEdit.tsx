/**
 * 采购执行编辑页（多供应商分组版）
 *
 * - 全局信息：采购经办人（搜索下拉）、服务部门（自动带出）、执行状态、备注
 * - 供应商分组卡片：收货方式、预计收货日期、快递单号（条件显示）
 * - 明细表格列与录入页对齐：分类、资产品牌、资产名称、参数、数量、采购形式、成交单价、小计
 * - 支持物资拆分/移动/编辑操作
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Form, Input, DatePicker, Row, Col, Table, Tag, Space, Spin, Select, message, Modal,
  Checkbox, Tooltip,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, ShoppingCartOutlined, PlusOutlined, DeleteOutlined,
  SplitCellsOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import {
  fetchPurchaseOrderDetail, updatePurchaseOrderExec, fetchSupplierContacts, syncSupplierContact,
  type PurchaseOrder, type ExecStatus, type PurchaseOrderSupplierGroup, type PurchaseOrderItem,
} from '../../../api/eam'
import { useCompanyBrand } from '../../../contexts/CompanyBrandContext'
import {
  usePurchaseOrderForm, ItemEditModal, groupSubtotal, grandTotal, showReceiveDate, showTrackingNo,
  type DeliveryMethod, type ItemRow,
} from './components'

/* ==================== 常量 ==================== */

interface Props {
  id: number
  onBack: () => void
  onSaved: () => void
}

const EXEC_STATUS_OPTIONS: { value: ExecStatus; labelKey: string; color: string }[] = [
  { value: 'pending', labelKey: 'execPending', color: 'default' },
  { value: 'purchasing', labelKey: 'execPurchasing', color: 'processing' },
  { value: 'completed', labelKey: 'execCompleted', color: 'success' },
]

interface GlobalFormValues {
  purchaser: string
  department: string
  brand: number | undefined
  execStatus: ExecStatus
  remark: string
}

/* ==================== 组件 ==================== */

/**
 * 采购订单执行信息编辑页
 *
 * @param props id=订单 ID；onBack=返回列表；onSaved=保存成功回调
 */
export default function OrderEdit({ id, onBack, onSaved }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<GlobalFormValues>()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const watchedBrand = Form.useWatch('brand', form)
  const { numericOptions, codeHint, labelMap } = useCompanyBrand()

  /* ----- 共用 Hook ----- */
  const {
    categories, brands, models,
    employees, empLoading, selectedEmp, setSelectedEmp, handleEmpSearch,
    supplierOptions, supplierLoading, handleSupplierSearch, handleSupplierChange,
    groupContacts, setGroupContacts, autoFilledContact, handleContactChange, handleContactManualInput,
    supplierGroups, setSupplierGroups, handleAddGroup, handleRemoveGroup, updateGroup,
    modalOpen, setModalOpen, editingItem, setEditingItem, handleOpenAddModal: hookOpenAddModal, handleOpenEditModal: hookOpenEditModal,
    handleModalOk, handleRemoveItem: hookRemoveItem,
    paramNameMap,
  } = usePurchaseOrderForm()

  /* ----- 物资拆分/移动状态 ----- */
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(new Set())
  const [splitModalOpen, setSplitModalOpen] = useState(false)
  const [splitModalGroupId, setSplitModalGroupId] = useState('')
  const [moveModalOpen, setMoveModalOpen] = useState(false)
  const [moveModalGroupId, setMoveModalGroupId] = useState('')
  const [moveModalRowKey, setMoveModalRowKey] = useState('')
  const [moveModalTargetId, setMoveModalTargetId] = useState('')

  /* ----- 加载订单数据 ----- */
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const o = await fetchPurchaseOrderDetail(id)
      setOrder(o)
      form.setFieldsValue({
        purchaser: o.purchaser || '',
        department: o.department || '',
        brand: o.brand,
        execStatus: o.execStatus,
        remark: o.remark || '',
      })
      // 初始化供应商分组
      if (o.supplierGroups && o.supplierGroups.length > 0) {
        setSupplierGroups(o.supplierGroups)
        // 回填每个分组的联系人
        o.supplierGroups.forEach(async (g) => {
          if (g.supplierId) {
            try {
              const contacts = await fetchSupplierContacts(g.supplierId)
              setGroupContacts((prev) => ({ ...prev, [g.id]: contacts }))
            } catch { /* 静默 */ }
          }
        })
      } else {
        setSupplierGroups([{
          id: 'sg_default',
          supplier: o.supplier || '',
          contact: o.contact || '',
          contactPhone: o.contactPhone || '',
          orderDate: o.orderDate || '',
          trackingNo: o.trackingNo || '',
          items: o.items.map((it) => ({ ...it })),
        }])
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [id, form, t, setSupplierGroups])

  useEffect(() => { loadData() }, [loadData])

  // 供应商下拉加载完成后，为缺少 supplierId 的分组按名称回填
  useEffect(() => {
    if (supplierOptions.length === 0 || supplierGroups.length === 0) return
    let changed = false
    const next = supplierGroups.map((g) => {
      if (g.supplierId) return g
      const matched = supplierOptions.find((s) => s.name === g.supplier)
      if (matched) { changed = true; return { ...g, supplierId: matched.id } }
      return g
    })
    if (changed) setSupplierGroups(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierOptions])

  /* ----- 員工選擇（需同步更新 form 中的部門字段） ----- */
  const handleEmpChange = (empId: string) => {
    const emp = employees.find((e) => e.empId === empId)
    setSelectedEmp(emp || null)
    form.setFieldsValue({ department: emp?.department || '' })
  }

  /* ----- 物资拆分/移动 ----- */
  const handleToggleSelect = (rowKey: string) => {
    setSelectedItemKeys((prev) => {
      const next = new Set(prev)
      if (next.has(rowKey)) { next.delete(rowKey) } else { next.add(rowKey) }
      return next
    })
  }

  const handleSelectAll = (groupId: string, checked: boolean) => {
    const group = supplierGroups.find((g) => g.id === groupId)
    if (!group) return
    const keys = group.items.map((it) => it.key).filter(Boolean) as string[]
    setSelectedItemKeys((prev) => {
      const next = new Set(prev)
      keys.forEach((k) => { if (checked) next.add(k); else next.delete(k) })
      return next
    })
  }

  const handleOpenSplitModal = (groupId: string) => {
    setSplitModalGroupId(groupId)
    setSplitModalOpen(true)
  }

  const handleConfirmSplit = () => {
    const keysToMove = Array.from(selectedItemKeys)
    if (keysToMove.length === 0) { message.warning(t('asset.warnSelectSplitItems')); return }

    setSupplierGroups((prev) => {
      const srcGroup = prev.find((g) => g.id === splitModalGroupId)
      if (!srcGroup) return prev
      const movingItems = srcGroup.items.filter((it) => keysToMove.includes(it.key!))
      const newGroup: PurchaseOrderSupplierGroup = {
        id: `sg_${Date.now()}`,
        supplier: '',
        items: movingItems,
      }
      return [
        ...prev.filter((g) => g.id !== splitModalGroupId),
        { ...srcGroup, items: srcGroup.items.filter((it) => !keysToMove.includes(it.key!)) },
        newGroup,
      ]
    })
    setSelectedItemKeys(new Set())
    setSplitModalOpen(false)
    message.success(t('asset.splitSuccess'))
  }

  /** 移动物资到目标分组（组件级） */
  const handleMoveToGroup = () => {
    if (!moveModalTargetId || !moveModalRowKey) return
    const targetGroup = supplierGroups.find((g) => g.id === moveModalTargetId)
    if (!targetGroup) return
    const targetNum = supplierGroups.findIndex((g) => g.id === moveModalTargetId) + 1
    setSupplierGroups((prev) => {
      const src = prev.find((g) => g.id === moveModalGroupId)
      const item = src?.items.find((it) => it.key === moveModalRowKey)
      if (!item) return prev
      return prev.map((g) => {
        if (g.id === moveModalGroupId) return { ...g, items: g.items.filter((it) => it.key !== moveModalRowKey) }
        if (g.id === moveModalTargetId) return { ...g, items: [...g.items, item] }
        return g
      })
    })
    setSelectedItemKeys((prev) => { const next = new Set(prev); next.delete(moveModalRowKey); return next })
    message.success(`已移動至分組 ${targetNum}`)
    setMoveModalOpen(false)
    setMoveModalTargetId('')
  }

  /* ----- 明细操作 ----- */
  const isReceived = order?.status === 'received'

  const handleOpenEdit = (groupId: string, item: PurchaseOrderItem) => {
    if (isReceived) {
      message.warning(t('asset.warnReceivedNoEdit'))
      return
    }
    hookOpenEditModal(groupId, item)
  }

  const handleOpenAddModal = (groupId: string) => {
    if (order?.reqId) {
      message.warning('採購申請流程生成的訂單不允許新增物資')
      return
    }
    hookOpenAddModal(groupId)
  }

  // 编辑/新增确认回调（需保留原始 price）
  const handleEditOk = (row: ItemRow) => {
    if (editingItem) {
      // 编辑模式：保留原始 price
      handleModalOk({ ...row, price: editingItem.price })
    } else {
      handleModalOk(row)
    }
  }

  const handleRemoveItem = (groupId: string, rowKey: string) => {
    hookRemoveItem(groupId, rowKey)
    setSelectedItemKeys((prev) => { const next = new Set(prev); next.delete(rowKey); return next })
  }

  const total = grandTotal(supplierGroups)

  /* ----- 明细表格列（与 OrderAdd 对齐，增加复选框和移动操作） ----- */
  const itemColumns = (groupId: string): TableColumnsType<PurchaseOrderItem> => {
    const group = supplierGroups.find((g) => g.id === groupId)
    const allKeys = (group?.items || []).map((it) => it.key).filter(Boolean) as string[]
    const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedItemKeys.has(k))
    return [
    {
      title: <Checkbox checked={allSelected} indeterminate={allKeys.some((k) => selectedItemKeys.has(k)) && !allSelected}
        onChange={(e) => handleSelectAll(groupId, e.target.checked)} />,
      key: 'selection', width: 40, align: 'center',
      render: (_: unknown, r: PurchaseOrderItem) => (
        <Checkbox checked={r.key ? selectedItemKeys.has(r.key) : false}
          onChange={() => r.key && handleToggleSelect(r.key)} />
      ),
    },
    {
      title: t('asset.colCategory'), dataIndex: 'categoryName', key: 'categoryName', width: 80, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('asset.colBrand'), dataIndex: 'brandName', key: 'brandName', width: 80, ellipsis: true,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: t('asset.colAssetName'), dataIndex: 'modelName', key: 'modelName', width: 140, ellipsis: true,
    },
    {
      title: t('asset.paramInfoTitle'), key: 'params', width: 180,
      render: (_: unknown, r: PurchaseOrderItem) => {
        if (!r.params || Object.keys(r.params).length === 0) return <span style={{ color: '#bfbfbf' }}>-</span>
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Object.entries(r.params).map(([k, v]) => {
              if (!v) return null
              const label = paramNameMap.get(k) || k
              return (
                <Tag key={k} style={{ fontSize: 11, margin: 0, lineHeight: '20px' }}>
                  {label}：{v}
                </Tag>
              )
            })}
          </div>
        )
      },
    },
    {
      title: t('asset.colQty'), dataIndex: 'qty', key: 'qty', width: 60, align: 'right',
    },
    {
      title: t('asset.purchaseType'), dataIndex: 'purchaseType', key: 'purchaseType', width: 80,
      render: (v: string | undefined) => {
        if (v === 'purchase') return <Tag color="blue">{t('asset.purchaseTypePurchase')}</Tag>
        if (v === 'lease') return <Tag color="green">{t('asset.purchaseTypeLease')}</Tag>
        return '-'
      },
    },
    {
      title: t('asset.colUnitPrice'), key: 'price', width: 100, align: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => {
        const cp = r.confirmedPrice || r.price
        return <span>MOP {cp.toLocaleString()}</span>
      },
    },
    {
      title: t('asset.colSubtotal'), key: 'subtotal', width: 100, align: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => {
        const cp = r.confirmedPrice || r.price
        return <span style={{ fontWeight: 600 }}>MOP {(cp * r.qty).toLocaleString()}</span>
      },
    },
    {
      title: t('asset.colAction'), key: 'actions', width: 150, fixed: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => {
        const rowKey = r.key || r.modelId?.toString() || ''
        const onlyOneGroup = supplierGroups.length <= 1

        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            <Button
              type="link"
              size="small"
              disabled={isReceived}
              onClick={() => handleOpenEdit(groupId, r)}
            >
              {t('common.edit')}
            </Button>
            {onlyOneGroup ? (
              <Tooltip title={t('asset.tooltipNoGroupMove')}>
                <Button type="link" size="small" disabled>{t('asset.moveBtn')}</Button>
              </Tooltip>
            ) : (
              <Button type="link" size="small" onClick={() => {
                setMoveModalGroupId(groupId)
                setMoveModalRowKey(rowKey)
                setMoveModalTargetId('')
                setMoveModalOpen(true)
              }}>{t('asset.moveBtn')}</Button>
            )}
            <Button type="link" size="small" danger onClick={() => handleRemoveItem(groupId, rowKey)}>
              {t('common.delete')}
            </Button>
          </Space>
        )
      },
    },
  ]
  }

  /* ----- 提交 ----- */
  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      setSubmitting(true)

      const purchaserName = employees.find((e) => e.empId === v.purchaser)?.name || v.purchaser.trim() || undefined

      await updatePurchaseOrderExec(id, {
        purchaser: purchaserName,
        department: v.department?.trim() || undefined,
        brand: v.brand,
        execStatus: v.execStatus,
        remark: v.remark?.trim() || undefined,
        supplierGroups: supplierGroups.map((g) => ({
          ...g,
          supplier: g.supplier.trim(),
          contact: g.contact?.trim() || undefined,
          contactPhone: g.contactPhone?.trim() || undefined,
          orderDate: g.orderDate || undefined,
          trackingNo: g.trackingNo?.trim() || undefined,
        })),
      })

      // 同步手動錄入的聯繫人到供應商管理
      const syncPromises: Promise<void>[] = []
      for (const g of supplierGroups) {
        if (!g.supplierId) continue
        const contactName = g.contact?.trim()
        const contactPhone = g.contactPhone?.trim()
        if (!contactName || !contactPhone) continue
        if (autoFilledContact[g.id] !== contactName) {
          syncPromises.push(syncSupplierContact(g.supplierId, contactName, contactPhone).catch(() => {}))
        }
      }
      await Promise.all(syncPromises)

      message.success(t('asset.saveExecSuccess'))
      onSaved()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !order) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    )
  }

  return (
    <>
      {/* ====== 页面头部 ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#E8720C' }}>{t('asset.editPoTitle')}</h2>
          <Tag color="orange" style={{ marginLeft: 4 }}>{order.poNo}</Tag>
        </div>
      </div>

      <Form<GlobalFormValues> form={form} layout="vertical">
        {/* ====== 订单信息 ====== */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShoppingCartOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.orderInfoTitle')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <Row gutter={24}>
            <Col span={8}>
              <Form.Item label={t('asset.colPurchaser')} name="purchaser" rules={[{ required: true, message: t('asset.warnSelectPurchaser') }]}>
                <Select
                  showSearch
                  placeholder={t('asset.phSearchEmp')}
                  loading={empLoading}
                  filterOption={false}
                  onSearch={handleEmpSearch}
                  onChange={handleEmpChange}
                  notFoundContent={empLoading ? <Spin size="small" /> : t('common.noData')}
                  options={employees.map((e) => ({
                    value: e.empId,
                    label: `${e.name}（${e.empId}）`,
                  }))}
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.serviceDept')} name="department">
                <Input disabled placeholder={t('asset.phDeptAutoFill')} style={{ color: '#262626' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.execStatus')} name="execStatus" rules={[{ required: true, message: t('asset.warnSelectExecStatus') }]}>
                <Select
                  disabled={order.status === 'received'}
                  options={EXEC_STATUS_OPTIONS.map((o) => ({
                    value: o.value,
                    label: <Tag color={o.color}>{t(`asset.${o.labelKey}`)}</Tag>,
                  }))}
                />
              </Form.Item>
              {order.status === 'received' && (
                <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: -18, marginBottom: 8 }}>{t('asset.receivedStatusLocked')}</div>
              )}
            </Col>
          </Row>
          <Row gutter={24}>
            <Col span={8}>
              <Form.Item label={t('asset.orderBrand')} name="brand" rules={[{ required: true, message: t('asset.warnSelectOrderBrand') }]}>
                <Select placeholder={t('asset.phSelectCompanyBrand')} options={numericOptions} />
              </Form.Item>
              {watchedBrand && codeHint[watchedBrand] && (
                <div style={{ fontSize: 12, color: '#E8720C', marginTop: -18, marginBottom: 8 }}>
                  {t('asset.brandCodeHint', { brand: labelMap[watchedBrand], code: codeHint[watchedBrand] })}
                </div>
              )}
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.orderTotal')}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#E8720C' }}>MOP {total.toLocaleString()}</div>
            </Col>
          </Row>
          <Row gutter={24}>
            <Col span={24}>
              <Form.Item label={t('asset.orderReasonLabel')} name="remark" style={{ marginBottom: 0 }}>
                <Input.TextArea rows={2} placeholder={t('asset.remarkPh')} maxLength={300} showCount style={{ resize: 'none' }} />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* ====== 采购物资分组 ====== */}
        {supplierGroups.map((group, gi) => {
          const subtotal = groupSubtotal(group)
          const dm = group.deliveryMethod as DeliveryMethod | undefined
          return (
            <div key={group.id} style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              {/* 分组标题 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #1890ff, #36cfc9)',
                    color: '#fff', fontSize: 11, fontWeight: 700,
                    boxShadow: '0 1px 4px rgba(24,144,255,0.3)',
                  }}>{gi + 1}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{t('asset.purchaseMaterials')}</span>
                  <Tag color="blue" style={{ fontSize: 11 }}>{t('asset.groupSubtotalTag', { amount: subtotal.toLocaleString() })}</Tag>
                </div>
                {supplierGroups.length > 1 && (
                  <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleRemoveGroup(group.id)}>
                    {t('asset.deleteGroupBtn')}
                  </Button>
                )}
              </div>

              {/* 供应商信息 */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Form.Item label={t('asset.labelSupplierName')} style={{ marginBottom: 0 }}>
                    <Select
                      showSearch
                      placeholder={t('asset.phSearchSupplier')}
                      value={group.supplierId || undefined}
                      onChange={(v: number) => handleSupplierChange(group.id, v)}
                      onSearch={handleSupplierSearch}
                      filterOption={false}
                      loading={supplierLoading}
                      notFoundContent={supplierLoading ? <Spin size="small" /> : t('common.noData')}
                      allowClear
                      options={supplierOptions.map((s) => ({
                        value: s.id,
                        label: `${s.name}（${s.code}）`,
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label={t('asset.labelContactName')} style={{ marginBottom: 0 }}>
                    {(groupContacts[group.id] || []).length > 1 ? (
                      <Select
                        value={group.contact || undefined}
                        onChange={(v: string) => handleContactChange(group.id, v)}
                        placeholder={t('asset.phSelectContact')}
                        allowClear
                        options={(groupContacts[group.id] || [])
                          .filter((c) => c.status !== 'disabled')
                          .map((c) => ({ value: c.contactName, label: c.contactName }))}
                      />
                    ) : (
                      <Input
                        value={group.contact}
                        onChange={(e) => handleContactManualInput(group.id, e.target.value)}
                        placeholder={(groupContacts[group.id] || []).length === 0 && group.supplierId ? t('asset.noSupplierContact') : t('asset.phInputContactName')}
                        allowClear
                      />
                    )}
                    {group.contact && group.supplierId && autoFilledContact[group.id] !== group.contact && (
                      <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4, whiteSpace: 'nowrap' }}>
                        {t('asset.contactSyncHint')}
                      </div>
                    )}
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label={t('asset.labelContactPhone')} style={{ marginBottom: 0 }}>
                    <Input value={group.contactPhone} onChange={(e) => updateGroup(group.id, { contactPhone: e.target.value })}
                      placeholder={t('asset.phInputContactPhone')} allowClear />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label={t('asset.labelOrderDate')} style={{ marginBottom: 0 }}>
                    <DatePicker value={group.orderDate ? dayjs(group.orderDate) : null}
                      onChange={(d: Dayjs | null) => updateGroup(group.id, { orderDate: d?.format('YYYY-MM-DD') || '' })}
                      disabledDate={(d: Dayjs) => d.isAfter(dayjs(), 'day')}
                      style={{ width: '100%' }} placeholder={t('asset.phSelectOrderDate')} />
                  </Form.Item>
                </Col>
              </Row>

              {/* 收货方式 + 条件字段（并排展示） */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Form.Item label={t('asset.labelDeliveryMethod')} required style={{ marginBottom: 0 }}>
                    <Select value={group.deliveryMethod}
                      onChange={(v: DeliveryMethod) => updateGroup(group.id, { deliveryMethod: v })}
                      placeholder={t('asset.phSelectDeliveryMethod')} allowClear
                      options={[
                        { label: t('asset.deliverySelfPickup'), value: 'self_pickup' },
                        { label: t('asset.deliverySupplier'), value: 'supplier_delivery' },
                        { label: t('asset.deliveryExpress'), value: 'express' },
                      ]}
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  {showReceiveDate(dm) && (
                    <Form.Item label={t('asset.labelExpectedDate')} style={{ marginBottom: 0 }}>
                      <DatePicker
                        value={group.expectedReceiveDate ? dayjs(group.expectedReceiveDate) : null}
                        onChange={(d: Dayjs | null) => updateGroup(group.id, { expectedReceiveDate: d?.format('YYYY-MM-DD') || '' })}
                        style={{ width: '100%' }} placeholder={t('asset.phSelectExpectedDate')}
                      />
                    </Form.Item>
                  )}
                </Col>
                <Col span={6}>
                  {showTrackingNo(dm) && (
                    <Form.Item label={t('asset.labelTrackingNo')} style={{ marginBottom: 0 }}>
                      <Input value={group.trackingNo}
                        onChange={(e) => updateGroup(group.id, { trackingNo: e.target.value })}
                        placeholder={t('asset.phInputTrackingNo')} allowClear style={{ fontFamily: 'monospace' }} />
                    </Form.Item>
                  )}
                </Col>
              </Row>

              {/* 选中工具栏 */}
              {selectedItemKeys.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', marginBottom: 12, background: '#e6f7ff', borderRadius: 6, border: '1px solid #91d5ff' }}>
                  <span style={{ fontSize: 13, color: '#1890ff' }}>
                    {t('asset.selectedItemsCount', { count: selectedItemKeys.size })}
                  </span>
                  <Space size={8}>
                    <Button size="small" type="primary" icon={<SplitCellsOutlined />}
                      onClick={() => handleOpenSplitModal(group.id)}>
                      {t('asset.splitToNewGroup')}
                    </Button>
                    <Button size="small" onClick={() => setSelectedItemKeys(new Set())}>
                      {t('asset.deselectAll')}
                    </Button>
                  </Space>
                </div>
              )}

              {/* 明细表格 */}
              {group.items.length > 0 ? (
                <Table<PurchaseOrderItem>
                  columns={itemColumns(group.id)}
                  dataSource={group.items}
                  rowKey={(r) => r.key || r.modelId?.toString() || Math.random().toString()}
                  size="small"
                  pagination={false}
                  scroll={{ x: 1200 }}
                />
              ) : (
                <div style={{ textAlign: 'center', color: '#bfbfbf', padding: '24px 0', fontSize: 13 }}>
                  {t('asset.noItems')}
                </div>
              )}
              {/* 新增物资按钮（仅手动创建的订单显示） */}
              {!order?.reqId && (
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => handleOpenAddModal(group.id)}
                  style={{
                    marginTop: 12,
                    borderColor: '#E8720C',
                    color: '#E8720C',
                    fontWeight: 500,
                  }}
                >
                  {t('asset.addAssetBtn')}
                </Button>
              )}
            </div>
          )
        })}

        <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddGroup} style={{ width: '100%', marginBottom: 16, height: 40 }}>
          + {t('asset.addSupplierGroup')}
        </Button>
      </Form>

      {/* ====== 拆分到新分组弹窗 ====== */}
      <Modal
        title={t('asset.splitModalTitle')}
        open={splitModalOpen}
        onOk={handleConfirmSplit}
        onCancel={() => setSplitModalOpen(false)}
        okText={t('asset.confirmSplit')}
        cancelText={t('common.cancel')}
        width={560}
        centered
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: '#595959' }}>
          {t('asset.splitConfirmDesc', { count: selectedItemKeys.size })}
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
          <Table<PurchaseOrderItem>
            columns={[
              { title: t('asset.colCategory'), dataIndex: 'categoryName', key: 'categoryName', width: 80, ellipsis: true, render: (v: string | undefined) => v || '-' },
              { title: t('asset.colBrand'), dataIndex: 'brandName', key: 'brandName', width: 80, ellipsis: true, render: (v: string | undefined) => v || '-' },
              { title: t('asset.colAssetName'), dataIndex: 'modelName', key: 'modelName', width: 140, ellipsis: true },
              { title: t('asset.colQty'), dataIndex: 'qty', key: 'qty', width: 60, align: 'right' },
              {
                title: t('asset.colSubtotal'), key: 'subtotal', width: 100, align: 'right',
                render: (_: unknown, r: PurchaseOrderItem) => {
                  const cp = r.confirmedPrice || r.price
                  return <span style={{ fontWeight: 600 }}>MOP {(cp * r.qty).toLocaleString()}</span>
                },
              },
            ]}
            dataSource={(supplierGroups.find((g) => g.id === splitModalGroupId)?.items || []).filter((it) => it.key && selectedItemKeys.has(it.key))}
            rowKey="key"
            pagination={false}
            size="small"
          />
        </div>
      </Modal>

      {/* ====== 明細編輯彈窗 ====== */}
      <ItemEditModal
        open={modalOpen}
        editing={editingItem}
        categories={categories}
        brands={brands}
        models={models}
        onOk={handleEditOk}
        onCancel={() => { setModalOpen(false); setEditingItem(null) }}
        editTitle={t('asset.editItemTitle')}
      />

      {/* ====== 移动物资弹窗 ====== */}
      <Modal
        title="选择目标分组"
        open={moveModalOpen}
        onCancel={() => { setMoveModalOpen(false); setMoveModalTargetId('') }}
        okText="确定"
        cancelText="取消"
        onOk={handleMoveToGroup}
        okButtonProps={{ disabled: !moveModalTargetId }}
        width={420}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center', padding: '8px 0' }}>
          {supplierGroups.map((g, idx) => {
            const num = idx + 1
            const isSource = g.id === moveModalGroupId
            const isSelected = g.id === moveModalTargetId
            return (
              <div
                key={g.id}
                onClick={() => !isSource && setMoveModalTargetId(g.id)}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `2px solid ${isSelected ? '#E8720C' : isSource ? '#e8eaed' : '#d9d9d9'}`,
                  background: isSelected ? 'linear-gradient(135deg, #FFF7F0, #FFE7D1)' : isSource ? '#fafafa' : '#fff',
                  color: isSelected ? '#E8720C' : isSource ? '#bfbfbf' : '#262626',
                  fontSize: 20,
                  fontWeight: 700,
                  cursor: isSource ? 'not-allowed' : 'pointer',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  opacity: isSource ? 0.4 : 1,
                  boxShadow: isSelected ? '0 4px 12px rgba(232,114,12,0.25)' : '0 2px 6px rgba(0,0,0,0.06)',
                }}
                onMouseEnter={(e) => {
                  if (!isSource && !isSelected) {
                    e.currentTarget.style.borderColor = '#E8720C'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(232,114,12,0.25)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = isSource ? '#e8eaed' : '#d9d9d9'
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = isSource ? 'none' : '0 2px 6px rgba(0,0,0,0.06)'
                  }
                }}
              >
                {num}
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: '#8C8C8C' }}>灰色圆圈为当前分组，不可选择</div>
      </Modal>

      {/* ====== 底部操作栏 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </Space>
      </div>
    </>
  )
}
