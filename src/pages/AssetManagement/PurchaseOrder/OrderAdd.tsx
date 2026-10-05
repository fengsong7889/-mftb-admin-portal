/**
 * 采购订单录入页（独立页面）
 *
 * - 直接录入采购订单，不经过采购申请审批流程
 * - 全局信息：采购经办人（搜索下拉）、服务部门（自动带出）、订单总计
 * - 供应商分组卡片：收货方式、预计收货日期、快递单号（条件显示）
 * - 明细通过弹窗编辑（分类 → 资产品牌 → 资产名称 → 参数），统一采购申请风格
 */
import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Form, Input, InputNumber, DatePicker, Row, Col, Table, Space, Spin, message,
  Tag, Select,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, ShoppingCartOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import {
  createPurchaseOrder, syncSupplierContact,
  type PurchaseOrderItem,
} from '../../../api/eam'
import { useCompanyBrand } from '../../../contexts/CompanyBrandContext'
import {
  usePurchaseOrderForm, ItemEditModal, groupSubtotal, grandTotal, showReceiveDate, showTrackingNo,
  type DeliveryMethod,
} from './components'

/* ==================== 類型 ==================== */

interface GlobalFormValues {
  purchaser: string
  department: string
  brand: number | undefined
  remark: string
}

export default function OrderAdd() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form] = Form.useForm<GlobalFormValues>()
  const [submitting, setSubmitting] = useState(false)
  const watchedBrand = Form.useWatch('brand', form)
  const { numericOptions, codeHint, labelMap } = useCompanyBrand()

  /* ----- 共用 Hook ----- */
  const {
    categories, brands, models, dataLoading,
    employees, empLoading, selectedEmp, setSelectedEmp, handleEmpSearch,
    supplierOptions, supplierLoading, handleSupplierSearch, handleSupplierChange,
    groupContacts, autoFilledContact, handleContactChange, handleContactManualInput,
    supplierGroups, handleAddGroup, handleRemoveGroup, updateGroup,
    modalOpen, setModalOpen, editingItem, handleOpenAddModal, handleOpenEditModal, handleModalOk, handleRemoveItem,
    paramNameMap,
  } = usePurchaseOrderForm()

  /* ----- 員工選擇（需同步更新 form 中的部門字段） ----- */
  const handleEmpChange = (empId: string) => {
    const emp = employees.find((e) => e.empId === empId)
    setSelectedEmp(emp || null)
    form.setFieldsValue({ department: emp?.department || '' })
  }

  /* ----- 提交 ----- */
  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      if (!selectedEmp) { message.warning(t('asset.warnSelectPurchaser')); return }
      const emptyItems = supplierGroups.filter((g) => g.items.length === 0)
      if (emptyItems.length > 0) { message.warning(t('asset.warnEmptyGroupItems')); return }
      setSubmitting(true)

      const total = grandTotal(supplierGroups)

      await createPurchaseOrder({
        reqId: 0,
        supplier: supplierGroups[0]?.supplier || '',
        amount: total,
        deliveryDate: '',
        purchaser: selectedEmp?.name || v.purchaser || undefined,
        department: selectedEmp?.department || undefined,
        brand: v.brand,
        remark: v.remark?.trim() || undefined,
        items: [],
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

      message.success(t('asset.poCreateSuccess'))
      navigate('/purchase-order')
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => navigate('/purchase-order')

  /* ----- 明细展示表格列 ----- */
  const itemColumns = useCallback((groupId: string): TableColumnsType<PurchaseOrderItem> => [
    { title: t('asset.colCategory'), dataIndex: 'categoryName', key: 'categoryName', width: 100, ellipsis: true },
    { title: t('asset.colBrand'), dataIndex: 'brandName', key: 'brandName', width: 100, ellipsis: true },
    { title: t('asset.colAssetName'), dataIndex: 'modelName', key: 'modelName', width: 160, ellipsis: true },
    {
      title: t('asset.paramInfoTitle'), key: 'params', width: 200,
      render: (_: unknown, r: PurchaseOrderItem) => {
        if (!r.params || Object.keys(r.params).length === 0) return <span style={{ color: '#bfbfbf', fontSize: 12 }}>-</span>
        const entries = Object.entries(r.params).filter(([, v]) => v && v !== 'undefined')
        if (entries.length === 0) return <span style={{ color: '#bfbfbf', fontSize: 12 }}>-</span>
        return <span style={{ fontSize: 12, color: '#595959' }}>{entries.map(([k, v]) => `${paramNameMap.get(k) || k}: ${v}`).join(', ')}</span>
      },
    },
    { title: t('asset.colQty'), dataIndex: 'qty', key: 'qty', width: 60, align: 'right' },
    {
      title: t('asset.purchaseType'), key: 'purchaseType', width: 80,
      render: (_: unknown, r: PurchaseOrderItem) => r.purchaseType
        ? <Tag color={r.purchaseType === 'purchase' ? 'blue' : 'green'}>{r.purchaseType === 'purchase' ? t('asset.purchaseTypePurchase') : t('asset.purchaseTypeLease')}</Tag>
        : '-',
    },
    {
      title: t('asset.confirmedPrice'), key: 'confirmedPrice', width: 100, align: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => (
        <span style={{ color: r.confirmedPrice ? '#262626' : '#bfbfbf', fontSize: 12 }}>
          {r.confirmedPrice ? `MOP ${r.confirmedPrice.toLocaleString()}` : '-'}
        </span>
      ),
    },
    {
      title: t('asset.colSubtotal'), key: 'subtotal', width: 100, align: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => {
        const cp = r.confirmedPrice || r.price
        return <span style={{ fontWeight: 600 }}>MOP {(cp * r.qty).toLocaleString()}</span>
      },
    },
    {
      title: t('asset.colAction'), key: 'action', width: 100, align: 'center', fixed: 'right',
      render: (_: unknown, r: PurchaseOrderItem) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => handleOpenEditModal(groupId, r)}>{t('common.edit')}</Button>
          <Button type="link" size="small" danger onClick={() => handleRemoveItem(groupId, r.key!)}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ], [paramNameMap, t, handleOpenEditModal, handleRemoveItem])

  const total = grandTotal(supplierGroups)

  return (
    <Spin spinning={dataLoading}>
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
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleCancel}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#E8720C' }}>{t('asset.addPoTitle')}</h2>
          <span style={{ fontSize: 11, color: '#8c8c8c', background: '#f5f5f5', padding: '2px 8px', borderRadius: 4 }}>{t('asset.directOrderBadge')}</span>
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
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('asset.orderTotal')}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#E8720C' }}>MOP {total.toLocaleString()}</div>
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
            <Col span={16}>
              <Form.Item label={t('asset.orderReasonLabel')} name="remark" style={{ marginBottom: 0 }}>
                <Input.TextArea rows={2} placeholder={t('asset.remarkPh')} maxLength={300} showCount style={{ resize: 'none' }} />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* ====== 采购物资分组 ====== */}
        {supplierGroups.map((group, gIdx) => (
          <div key={group.id} style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #1890ff, #36cfc9)',
                  color: '#fff', fontSize: 11, fontWeight: 700,
                  boxShadow: '0 1px 4px rgba(24,144,255,0.3)',
                }}>{gIdx + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{t('asset.purchaseMaterials')}</span>
                <Tag color="blue" style={{ fontSize: 11 }}>
                  {t('asset.groupSubtotalTag', { amount: groupSubtotal(group).toLocaleString() })}
                </Tag>
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
                <Form.Item label={t('asset.labelSupplierName')}>
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
                <Form.Item label={t('asset.labelContactName')}>
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
                <Form.Item label={t('asset.labelContactPhone')}>
                  <Input value={group.contactPhone} onChange={(e) => updateGroup(group.id, { contactPhone: e.target.value })}
                    placeholder={t('asset.phInputContactPhone')} allowClear />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label={t('asset.labelOrderDate')}>
                  <DatePicker value={group.orderDate ? dayjs(group.orderDate) : undefined}
                    onChange={(d) => updateGroup(group.id, { orderDate: d ? d.format('YYYY-MM-DD') : undefined })}
                    disabledDate={(d) => d.isAfter(dayjs(), 'day')}
                    style={{ width: '100%' }} placeholder={t('asset.phSelectOrderDate')} />
                </Form.Item>
              </Col>
            </Row>

            {/* 收貨方式 + 條件字段（並排展示） */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Form.Item label={t('asset.labelDeliveryMethod')} required>
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
                {showReceiveDate(group.deliveryMethod as DeliveryMethod | undefined) && (
                  <Form.Item label={t('asset.labelExpectedDate')}>
                    <DatePicker
                      value={group.expectedReceiveDate ? dayjs(group.expectedReceiveDate) : undefined}
                      onChange={(d) => updateGroup(group.id, { expectedReceiveDate: d ? d.format('YYYY-MM-DD') : undefined })}
                      style={{ width: '100%' }} placeholder={t('asset.phSelectExpectedDate')}
                    />
                  </Form.Item>
                )}
              </Col>
              <Col span={6}>
                {showTrackingNo(group.deliveryMethod as DeliveryMethod | undefined) && (
                  <Form.Item label={t('asset.labelTrackingNo')}>
                    <Input value={group.trackingNo}
                      onChange={(e) => updateGroup(group.id, { trackingNo: e.target.value })}
                      placeholder={t('asset.phInputTrackingNo')} allowClear />
                  </Form.Item>
                )}
              </Col>
            </Row>

            {/* 明细表格 */}
            <Table<PurchaseOrderItem>
              columns={itemColumns(group.id)}
              dataSource={group.items}
              rowKey="key"
              pagination={false}
              size="small"
              scroll={{ x: 1100 }}
              locale={{ emptyText: t('asset.emptyTextWithHint') }}
              style={{ marginBottom: 12 }}
            />
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => handleOpenAddModal(group.id)}
              style={{
                borderColor: '#E8720C',
                color: '#E8720C',
                fontWeight: 500,
              }}
            >
              {t('asset.addAssetBtn')}
            </Button>
          </div>
        ))}

        <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddGroup} style={{ width: '100%', marginBottom: 16, height: 40 }}>
          + {t('asset.addSupplierGroup')}
        </Button>
      </Form>

      {/* ====== 底部操作栏 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={handleCancel}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            {t('asset.saveOrderBtn')}
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
    </Spin>
  )
}
