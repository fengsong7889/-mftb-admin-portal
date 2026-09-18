/**
 * 耗材入库 独立表单页（Stock 与 Alert 页共用）
 *
 * 遵循 form-page-style 规范：橙色渐变顶条 + 返回 + 模块卡片 + 底部操作栏
 * 用于手工入库 / 期初建账 / 预警补货；提交前 custom-confirm-modal 二次确认
 */
import { useState, useEffect } from 'react'
import { Button, Form, Input, InputNumber, Select, Modal, message, Space, Spin } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import {
  fetchConsumableItemOptions, inboundConsumable, type ConsumableItem,
} from '../../../api/consumable'
import { fetchLocationList, type AssetLocation } from '../../../api/eam'

interface FormValues {
  itemId: number
  locationId?: number
  qty: number
  unitCost?: number
  remark?: string
}

interface Props {
  onBack: () => void
  /** 预填耗材（从预警页「补货入库」进入时携带） */
  presetItemId?: number
}

export default function InboundForm({ onBack, presetItemId }: Props) {
  const [form] = Form.useForm<FormValues>()
  const [items, setItems] = useState<ConsumableItem[]>([])
  const [locations, setLocations] = useState<AssetLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([fetchConsumableItemOptions(), fetchLocationList().catch(() => [] as AssetLocation[])])
      .then(([its, locs]) => {
        setItems(its)
        setLocations(locs)
        if (presetItemId) {
          const preset = its.find(i => i.id === presetItemId)
          form.setFieldsValue({
            itemId: presetItemId,
            unitCost: preset?.refPrice ?? 0,
            // 补货建议量：上限-可用（无上限则给安全库存缺口）
            qty: preset ? (preset.maxStock > 0
              ? Math.max(1, preset.maxStock - preset.availableQty)
              : Math.max(1, preset.safetyStock - preset.availableQty)) : 1,
          })
        } else {
          form.setFieldsValue({ qty: 1 })
        }
      })
      .catch((e: Error) => message.error(e.message))
      .finally(() => setLoading(false))
  }, [form, presetItemId])

  const itemOptions = items.map(it => ({
    label: `${it.itemCode} · ${it.name}${it.spec ? ' / ' + it.spec : ''}（現存 ${it.totalQty} ${it.unit}）`,
    value: it.id,
  }))
  const locationOptions = locations.map(l => ({ label: l.name, value: l.id }))

  const doSubmit = async (v: FormValues) => {
    setSubmitting(true)
    try {
      await inboundConsumable({
        itemId: v.itemId,
        locationId: v.locationId ?? 0,
        qty: v.qty,
        unitCost: v.unitCost,
        txnType: 'in_manual',
        remark: v.remark,
      })
      message.success('入庫成功')
      onBack()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '入庫失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    let v: FormValues
    try {
      v = await form.validateFields()
    } catch {
      return
    }
    const it = items.find(i => i.id === v.itemId)
    Modal.confirm({
      title: '確認入庫？',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>耗材：</span><b>{it?.name ?? ''}</b></div>
          <div className="confirm-info-row"><span>入庫數量：</span><b>{v.qty} {it?.unit ?? ''}</b></div>
          <div className="confirm-info-row"><span>入庫單價：</span><b>¥{(v.unitCost ?? 0).toFixed(2)}</b></div>
        </div>
      ),
      okText: '確認入庫',
      cancelText: '取消',
      onOk: () => doSubmit(v),
    })
  }

  return (
    <Spin spinning={loading}>
      {/* 顶部标题栏 */}
      <div style={{ position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)', backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite' }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}
          >返回</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>耗材入庫</h2>
        </div>
      </div>

      <Form<FormValues> form={form} layout="vertical">
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, color: '#1890ff' }}>📥</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>入库信息</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <Form.Item label="耗材" name="itemId" rules={[{ required: true, message: '請選擇耗材' }]}>
              <Select placeholder="選擇耗材" showSearch optionFilterProp="label" options={itemOptions} />
            </Form.Item>
            <Form.Item label="入庫倉庫" name="locationId">
              <Select placeholder="請選擇入庫倉庫" allowClear options={locationOptions} />
            </Form.Item>
            <Form.Item label="入庫數量" name="qty" rules={[{ required: true, message: '請填寫入庫數量' }]}>
              <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder="正整數" />
            </Form.Item>
            <Form.Item label="入庫單價（元）" name="unitCost">
              <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} placeholder="成本核算用" />
            </Form.Item>
          </div>
          <Form.Item label="備註" name="remark" style={{ marginBottom: 0 }}>
            <Input.TextArea placeholder="選填，如採購單號/來源說明" maxLength={200} showCount rows={2} />
          </Form.Item>
        </div>
      </Form>

      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>確認入庫</Button>
        </Space>
      </div>
    </Spin>
  )
}
