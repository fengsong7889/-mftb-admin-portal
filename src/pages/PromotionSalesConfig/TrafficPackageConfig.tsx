import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, Table, Button, Modal, Form, Input, InputNumber, Switch, Tag, Popconfirm, message } from 'antd'
import { PlusOutlined, SaveOutlined } from '@ant-design/icons'
import { BIZ_CHANNEL } from '../../constants/bizChannel'
import {
  type TrafficChannelPricing,
  type TrafficPackageTier,
  type TrafficPriceLadderRow,
  loadTrafficPricing,
  saveTrafficPricing,
  generateDefaultTrafficPricing,
  findLadderUnitPrice,
} from './types'

/** 投流廣告定價配置（按業務頻道分開配置：預設檔位 + 階梯單價） */
export default function TrafficPackageConfig() {
  const { t } = useTranslation('adSales')
  const [pricing, setPricing] = useState<TrafficChannelPricing[]>(() => loadTrafficPricing())
  const [activeChannel, setActiveChannel] = useState<string>(BIZ_CHANNEL.FOOD_DELIVERY)
  /** 業務頻道 i18n 標籤映射 */
  const BIZ_CHANNEL_I18N_MAP: Record<string, string> = {
    [BIZ_CHANNEL.FOOD_DELIVERY]: t('bizChannelFoodDelivery'),
    [BIZ_CHANNEL.SUPERMARKET]: t('bizChannelSupermarket'),
    [BIZ_CHANNEL.GROUP_BUY]: t('bizChannelGroupBuy'),
  }
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTier, setEditingTier] = useState<TrafficPackageTier | null>(null)
  const [form] = Form.useForm()

  const current = pricing.find(p => p.bizChannel === activeChannel)

  /** 更新當前頻道配置 */
  const updateCurrent = (updater: (c: TrafficChannelPricing) => TrafficChannelPricing) => {
    setPricing(prev => prev.map(p => (p.bizChannel === activeChannel ? updater(p) : p)))
  }

  /* ===== 預設檔位操作 ===== */
  const openAddTier = () => {
    setEditingTier(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEditTier = (tier: TrafficPackageTier) => {
    setEditingTier(tier)
    form.setFieldsValue({ name: tier.name, impressions: tier.impressions, price: tier.price, validityDays: tier.validityDays })
    setModalOpen(true)
  }

  const handleModalOk = () => {
    form.validateFields().then(values => {
      if (editingTier) {
        updateCurrent(c => ({
          ...c,
          tiers: c.tiers.map(tier => (tier.id === editingTier.id ? { ...tier, ...values } : tier)),
        }))
      } else if (current) {
        const newTier: TrafficPackageTier = {
          id: `tier-${Date.now()}`,
          name: values.name,
          impressions: values.impressions,
          price: values.price,
          validityDays: values.validityDays,
          onSale: true,
          sort: current.tiers.length + 1,
        }
        updateCurrent(c => ({ ...c, tiers: [...c.tiers, newTier] }))
      }
      setModalOpen(false)
      message.success(t('trafficTierSaved'))
    })
  }

  const handleDeleteTier = (id: string) => {
    updateCurrent(c => ({ ...c, tiers: c.tiers.filter(tier => tier.id !== id) }))
  }

  const handleToggleSale = (id: string, checked: boolean) => {
    updateCurrent(c => ({
      ...c,
      tiers: c.tiers.map(tier => (tier.id === id ? { ...tier, onSale: checked } : tier)),
    }))
  }

  /* ===== 階梯單價操作 ===== */
  const updateLadderRow = (id: string, field: keyof TrafficPriceLadderRow, value: number) => {
    updateCurrent(c => ({
      ...c,
      ladder: c.ladder.map(row => (row.id === id ? { ...row, [field]: value } : row)),
    }))
  }

  const addLadderRow = () => {
    if (!current) return
    const last = current.ladder[current.ladder.length - 1]
    const newRow: TrafficPriceLadderRow = {
      id: `ladder-${Date.now()}`,
      minQty: last ? (last.maxQty === 0 ? last.minQty + 1000 : last.maxQty + 1) : 1,
      maxQty: 0,
      unitPrice: last ? last.unitPrice : 0.25,
    }
    // 新行作為無上限行，原無上限行改為有上限
    updateCurrent(c => ({
      ...c,
      ladder: [
        ...c.ladder.map(row => (row.maxQty === 0 ? { ...row, maxQty: newRow.minQty - 1 } : row)),
        newRow,
      ],
    }))
  }

  const removeLadderRow = (id: string) => {
    updateCurrent(c => ({ ...c, ladder: c.ladder.filter(row => row.id !== id) }))
  }

  /* ===== 保存 / 重置 ===== */
  const handleSave = () => {
    saveTrafficPricing(pricing)
    message.success(t('trafficPricingSaved'))
  }

  const handleCancel = () => {
    setPricing(loadTrafficPricing())
    message.info(t('trafficPricingRestored'))
  }

  /* ===== 檔位表格列 ===== */
  const tierColumns = [
    { title: t('trafficTierName'), dataIndex: 'name', key: 'name', width: 120 },
    {
      title: t('trafficImpressions'), dataIndex: 'impressions', key: 'impressions', width: 130,
      render: (v: number) => `${v.toLocaleString()} ${t('trafficImpressionsUnit')}`,
    },
    {
      title: t('trafficPackagePrice'), dataIndex: 'price', key: 'price', width: 120,
      render: (v: number) => `${v.toLocaleString()} ${t('trafficMopUnit')}`,
    },
    {
      title: t('trafficUnitPriceConverted'), key: 'unit', width: 130,
      render: (_: unknown, r: TrafficPackageTier) => `${(r.price / r.impressions).toFixed(3)} ${t('trafficMopUnit')}/${t('trafficImpressionsUnit')}`,
    },
    {
      title: t('trafficValidity'), dataIndex: 'validityDays', key: 'validityDays', width: 100,
      render: (v: number) => `${v} ${t('trafficDayUnit')}`,
    },
    {
      title: t('trafficSaleStatus'), key: 'onSale', width: 90,
      render: (_: unknown, r: TrafficPackageTier) => (
        <Switch size="small" checked={r.onSale} onChange={checked => handleToggleSale(r.id, checked)} />
      ),
    },
    {
      title: t('trafficAction'), key: 'action', width: 120,
      render: (_: unknown, r: TrafficPackageTier) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button type="link" size="small" onClick={() => openEditTier(r)}>{t('trafficEdit')}</Button>
          <Popconfirm title={t('trafficDeleteTierConfirm')} onConfirm={() => handleDeleteTier(r.id)}>
            <Button type="link" size="small" danger>{t('trafficDelete')}</Button>
          </Popconfirm>
        </div>
      ),
    },
  ]

  /* ===== 階梯單價表格列 ===== */
  const ladderColumns = [
    {
      title: t('trafficLadderMin'), dataIndex: 'minQty', key: 'minQty', width: 150,
      render: (v: number, r: TrafficPriceLadderRow) => (
        <InputNumber min={1} max={9999999} precision={0} value={v} style={{ width: 120 }}
          onChange={val => updateLadderRow(r.id, 'minQty', val ?? 1)} />
      ),
    },
    {
      title: t('trafficLadderMax'), dataIndex: 'maxQty', key: 'maxQty', width: 170,
      render: (v: number, r: TrafficPriceLadderRow) => (
        v === 0
          ? <Tag color="blue">{t('trafficNoUpperLimit')}</Tag>
          : (
            <InputNumber min={1} max={9999999} precision={0} value={v} style={{ width: 120 }}
              onChange={val => updateLadderRow(r.id, 'maxQty', val ?? 1)} />
          )
      ),
    },
    {
      title: t('trafficLadderUnitPrice'), dataIndex: 'unitPrice', key: 'unitPrice', width: 170,
      render: (v: number, r: TrafficPriceLadderRow) => (
        <InputNumber min={0.01} max={99} step={0.01} precision={2} value={v} style={{ width: 120 }}
          addonAfter={t('trafficMopUnit')}
          onChange={val => updateLadderRow(r.id, 'unitPrice', val ?? 0.01)} />
      ),
    },
    {
      title: t('trafficAction'), key: 'action', width: 80,
      render: (_: unknown, r: TrafficPriceLadderRow) => (
        <Popconfirm title={t('trafficDeleteLadderConfirm')} onConfirm={() => removeLadderRow(r.id)}>
          <Button type="link" size="small" danger>{t('trafficDelete')}</Button>
        </Popconfirm>
      ),
    },
  ]

  /* ===== 計價示例（取 3000 次演示命中階梯） ===== */
  const exampleQty = 3000
  const exampleUnit = current ? findLadderUnitPrice(current.ladder, exampleQty) : null

  return (
    <div>
      {/* 頻道 Tabs */}
      <Tabs
        activeKey={activeChannel}
        onChange={setActiveChannel}
        items={Object.entries(BIZ_CHANNEL).map(([, v]) => ({ key: v, label: BIZ_CHANNEL_I18N_MAP[v] }))}
        style={{ marginBottom: 8 }}
      />

      {current && (
        <>
          {/* 區塊1：預設檔位配置 */}
          <div style={{ marginBottom: 16, padding: '14px 16px', background: '#f0f5ff', border: '1px solid #d6e4ff', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1890ff' }}>📦 {t('trafficTierConfig')}</span>
              <div className="action-section-right" style={{ display: 'flex', gap: 8 }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={openAddTier}>{t('trafficAddTier')}</Button>
              </div>
            </div>
            <Table
              rowKey="id"
              size="small"
              columns={tierColumns}
              dataSource={[...current.tiers].sort((a, b) => a.sort - b.sort)}
              pagination={false}
            />
          </div>

          {/* 區塊2：自定義階梯單價 */}
          <div style={{ marginBottom: 16, padding: '14px 16px', background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#d46b08' }}>🪜 {t('trafficLadderConfig')}</span>
              <Button icon={<PlusOutlined />} onClick={addLadderRow}>{t('trafficLadderAddRow')}</Button>
            </div>
            <Table
              rowKey="id"
              size="small"
              columns={ladderColumns}
              dataSource={current.ladder}
              pagination={false}
              style={{ marginBottom: 12 }}
            />
            {/* 自定義購買規則 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#595959' }}>
              <span style={{ fontWeight: 600, color: '#d46b08' }}>{t('trafficCustomRules')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{t('trafficCustomMinQty')}</span>
                <InputNumber min={1} max={100000} precision={0} value={current.customMinQty} style={{ width: 120 }}
                  addonAfter={t('trafficImpressionsUnit')}
                  onChange={val => updateCurrent(c => ({ ...c, customMinQty: val ?? 1 }))} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{t('trafficCustomStep')}</span>
                <InputNumber min={1} max={10000} precision={0} value={current.customStep} style={{ width: 120 }}
                  addonAfter={t('trafficImpressionsUnit')}
                  onChange={val => updateCurrent(c => ({ ...c, customStep: val ?? 1 }))} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{t('trafficCustomValidity')}</span>
                <InputNumber min={1} max={365} precision={0} value={current.customValidityDays} style={{ width: 120 }}
                  addonAfter={t('trafficDayUnit')}
                  onChange={val => updateCurrent(c => ({ ...c, customValidityDays: val ?? 1 }))} />
              </div>
            </div>
          </div>

          {/* 區塊3：計價示例 */}
          <div style={{ marginBottom: 16, padding: '12px 14px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, fontSize: 12, color: '#595959', lineHeight: '22px' }}>
            <div style={{ fontWeight: 600, color: '#389e0d', marginBottom: 4 }}>💡 {t('trafficPricingExample')}</div>
            <div>{t('trafficPricingExampleDesc')}</div>
            {exampleUnit !== null && (
              <div style={{ fontFamily: 'monospace' }}>
                {t('trafficPricingExampleCalc')
                  .replace('{{qty}}', exampleQty.toLocaleString())
                  .replace('{{unit}}', String(exampleUnit))
                  .replace('{{amount}}', String(Math.round(exampleQty * exampleUnit * 100) / 100))}
              </div>
            )}
          </div>
        </>
      )}

      {/* 底部操作欄：取消 + 保存 */}
      <div className="form-footer" style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: '16px 0' }}>
        <Button onClick={handleCancel} style={{ height: 38, padding: '0 28px', borderRadius: 8, minWidth: 96 }}>
          {t('common:cancel')}
        </Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}
          style={{ height: 38, padding: '0 28px', borderRadius: 8, minWidth: 96, backgroundColor: '#E8720C', borderColor: '#E8720C' }}>
          {t('common:save')}
        </Button>
        <Button onClick={() => setPricing(generateDefaultTrafficPricing())}
          style={{ height: 38, padding: '0 28px', borderRadius: 8, minWidth: 96 }}>
          {t('trafficRestoreDefault')}
        </Button>
      </div>

      {/* 檔位新增/編輯彈窗 */}
      <Modal
        title={editingTier ? t('trafficEditTier') : t('trafficAddTier')}
        open={modalOpen}
        onOk={handleModalOk}
        onCancel={() => setModalOpen(false)}
        okText={t('common:save')}
        cancelText={t('common:cancel')}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label={t('trafficTierName')} rules={[{ required: true, message: t('trafficInputRequired') }]}>
            <Input maxLength={20} />
          </Form.Item>
          <Form.Item name="impressions" label={t('trafficImpressions')} rules={[{ required: true, message: t('trafficInputRequired') }]}>
            <InputNumber min={1} max={10000000} precision={0} style={{ width: '100%' }} addonAfter={t('trafficImpressionsUnit')} />
          </Form.Item>
          <Form.Item name="price" label={t('trafficPackagePrice')} rules={[{ required: true, message: t('trafficInputRequired') }]}>
            <InputNumber min={1} max={9999999} precision={0} style={{ width: '100%' }} addonAfter={t('trafficMopUnit')} />
          </Form.Item>
          <Form.Item name="validityDays" label={t('trafficValidity')} rules={[{ required: true, message: t('trafficInputRequired') }]}>
            <InputNumber min={1} max={365} precision={0} style={{ width: '100%' }} addonAfter={t('trafficDayUnit')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
