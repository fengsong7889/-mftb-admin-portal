/**
 * 耗材档案 新增/编辑/详情 独立表单页
 *
 * 遵循 form-page-style 规范：橙色渐变顶条 + 返回按钮 + 模块卡片 + 底部操作栏
 * readOnly=true 时为详情模式（禁用输入、隐藏保存）
 */
import { useState, useEffect, useMemo } from 'react'
import { Button, Form, Input, InputNumber, Select, Spin, message, Space } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import {
  fetchConsumableItemDetail, createConsumableItem, updateConsumableItem,
  type ConsumableItemSave,
} from '../../../api/consumable'
import { fetchCategoryList, type AssetCategory } from '../../../api/eam'

interface FormValues {
  name: string
  categoryId?: number
  brand?: string
  spec?: string
  unit: string
  refPrice?: number
  safetyStock?: number
  maxStock?: number
  perClaimLimit?: number
  status?: 'enabled' | 'disabled'
  remark?: string
}

interface Props {
  id?: number
  readOnly?: boolean
  onBack: () => void
}

const UNIT_OPTIONS = ['個', '支', '盒', '包', '箱', '瓶', '卷', '張', '套', '袋'].map(u => ({ label: u, value: u }))

export default function ItemForm({ id, readOnly, onBack }: Props) {
  const [form] = Form.useForm<FormValues>()
  const isEdit = id != null
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [detailMeta, setDetailMeta] = useState<{ updatedBy?: string; updatedAt?: string }>({})

  const categoryOptions = useMemo(
    () => categories.map(c => ({ label: c.name, value: c.id })),
    [categories],
  )

  useEffect(() => {
    fetchCategoryList().then(setCategories).catch(() => { /* 忽略 */ })
  }, [])

  useEffect(() => {
    let alive = true
    if (isEdit && id) {
      setLoading(true)
      fetchConsumableItemDetail(id)
        .then((it) => {
          if (!alive) return
          setDetailMeta({ updatedBy: it.updatedBy, updatedAt: it.updatedAt })
          form.setFieldsValue({
            name: it.name,
            categoryId: it.categoryId ?? undefined,
            brand: it.brand || undefined,
            spec: it.spec || undefined,
            unit: it.unit,
            refPrice: it.refPrice ?? 0,
            safetyStock: it.safetyStock,
            maxStock: it.maxStock,
            perClaimLimit: it.perClaimLimit,
            status: it.status,
            remark: it.remark || undefined,
          })
        })
        .catch((e: Error) => message.error(e.message))
        .finally(() => { if (alive) setLoading(false) })
    } else {
      form.setFieldsValue({ unit: '個', refPrice: 0, safetyStock: 0, maxStock: 0, perClaimLimit: 0, status: 'enabled' })
    }
    return () => { alive = false }
  }, [form, id, isEdit])

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      const payload: ConsumableItemSave = {
        name: v.name.trim(),
        categoryId: v.categoryId ?? null,
        brand: v.brand?.trim(),
        spec: v.spec?.trim(),
        unit: v.unit,
        refPrice: v.refPrice ?? 0,
        safetyStock: v.safetyStock ?? 0,
        maxStock: v.maxStock ?? 0,
        perClaimLimit: v.perClaimLimit ?? 0,
        status: v.status ?? 'enabled',
        remark: v.remark,
      }
      setSubmitting(true)
      if (isEdit && id) {
        await updateConsumableItem(id, payload)
        message.success('保存成功')
      } else {
        await createConsumableItem(payload)
        message.success('新增成功')
      }
      onBack()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const title = readOnly ? '耗材詳情' : isEdit ? '編輯耗材' : '新增耗材'

  return (
    <Spin spinning={loading}>
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
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}
          >返回</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{title}</h2>
        </div>
      </div>

      <Form<FormValues> form={form} layout="vertical" disabled={readOnly}>
        {/* ====== 基本信息 ====== */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, color: '#1890ff' }}>📦</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基本信息</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="耗材名稱" name="name" rules={[{ required: true, message: '請填寫耗材名稱' }]}>
              <Input placeholder="如：A4打印紙 / 中性筆" allowClear />
            </Form.Item>
            <Form.Item label="分類" name="categoryId">
              <Select placeholder="選擇分類" allowClear showSearch optionFilterProp="label" options={categoryOptions} />
            </Form.Item>
            <Form.Item label="品牌" name="brand">
              <Input placeholder="如：得力 / 晨光" allowClear />
            </Form.Item>
            <Form.Item label="規格型號" name="spec">
              <Input placeholder="如：70g 500張/包" allowClear />
            </Form.Item>
            <Form.Item label="計量單位" name="unit" rules={[{ required: true, message: '請選擇單位' }]}>
              <Select placeholder="選擇單位" options={UNIT_OPTIONS} showSearch />
            </Form.Item>
            <Form.Item label="參考單價（元）" name="refPrice">
              <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>
          </div>
        </div>

        {/* ====== 库存策略 ====== */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, color: '#FA8C16' }}>📊</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>库存策略</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>安全库存用于低库存预警；限领量控制单次领用上限（0=不限）</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <Form.Item label="安全庫存下限" name="safetyStock">
              <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="0=不預警" />
            </Form.Item>
            <Form.Item label="庫存上限" name="maxStock">
              <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="0=不限" />
            </Form.Item>
            <Form.Item label="單次限領量" name="perClaimLimit">
              <InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="0=不限" />
            </Form.Item>
            <Form.Item label="狀態" name="status">
              <Select options={[{ label: '啟用', value: 'enabled' }, { label: '停用', value: 'disabled' }]} />
            </Form.Item>
          </div>
          <Form.Item label="備註" name="remark" style={{ marginBottom: 0 }}>
            <Input.TextArea placeholder="選填" maxLength={300} showCount rows={3} />
          </Form.Item>
        </div>
      </Form>

      {/* 详情页「最后更新」footer */}
      {readOnly && (
        <div style={{ background: '#fafafa', borderRadius: 8, padding: '12px 24px', border: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 24, marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新人：<span style={{ color: '#595959' }}>{detailMeta.updatedBy || '-'}</span></span>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新時間：<span style={{ color: '#595959' }}>{detailMeta.updatedAt || '-'}</span></span>
        </div>
      )}

      {/* ====== 底部操作栏 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>{readOnly ? '返回' : '取消'}</Button>
          {!readOnly && (
            <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>保存</Button>
          )}
        </Space>
      </div>
    </Spin>
  )
}
