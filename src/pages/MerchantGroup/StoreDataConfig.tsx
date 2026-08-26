import { useState, useEffect, useCallback } from 'react'
import { Button, Form, InputNumber, Spin, message } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchStoreDataConfig, updateStoreDataConfig } from '../../api/store'
import type { StoreDataConfigPayload } from '../../api/store'

/** 金字招牌數據配置 — 獨立頁面 */
export default function StoreDataConfig() {
  const { t } = useTranslation('store')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const storeId = searchParams.get('storeId') ? Number(searchParams.get('storeId')) : 0
  const storeCode = searchParams.get('storeCode') || ''
  const storeName = searchParams.get('storeName') || ''

  const [form] = Form.useForm<StoreDataConfigPayload>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  /* ── 實時計算復購率 / 好評率 ── */
  const orders = Form.useWatch('monthlyOrders', form)
  const repurchaseOrders = Form.useWatch('monthlyRepurchaseOrders', form)
  const positiveOrders = Form.useWatch('monthlyPositiveOrders', form)
  const repurchaseRate = orders && repurchaseOrders
    ? ((repurchaseOrders / orders) * 100).toFixed(2)
    : '0.00'
  const positiveRate = orders && positiveOrders
    ? ((positiveOrders / orders) * 100).toFixed(2)
    : '0.00'

  /* ── 加載配置 ── */
  const loadConfig = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    try {
      const data = await fetchStoreDataConfig(storeId)
      form.setFieldsValue({
        monthlyOrders: data.monthlyOrders ?? undefined,
        monthlyRepurchaseOrders: data.monthlyRepurchaseOrders ?? undefined,
        monthlyPositiveOrders: data.monthlyPositiveOrders ?? undefined,
        monthlyVisits: data.monthlyVisits ?? undefined,
        storeFavorites: data.storeFavorites ?? undefined,
        monthlyCustomers: data.monthlyCustomers ?? undefined,
      })
    } catch {
      message.error(t('loadConfigFailed'))
    } finally {
      setLoading(false)
    }
  }, [storeId, form, t])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  /* ── 保存 ── */
  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      await updateStoreDataConfig(storeId, values)
      message.success(t('configSaved'))
    } catch {
      // 校驗失敗或接口異常，不額外提示（表單校驗已有紅字提示）
    } finally {
      setSaving(false)
    }
  }

  /* ── 返回 ── */
  const handleBack = () => {
    navigate('/store-list')
  }

  return (
    <div className="content-area">
      {/* 頂部標題欄（與訂單詳情/算價配置等二級頁面保持一致） */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        {/* 頂部漸變裝飾線 */}
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          {/* 左側：返回 + 標題 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {t('common:back')}
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {t('dataConfigTitle')}
            </h2>
          </div>
        </div>
      </div>

      {/* 門店基本信息 */}
      <div style={{
        background: '#fff', border: '1px solid #e8eaed', borderRadius: 8,
        padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div style={{ background: '#FAFAFA', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('colStoreId')}</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{storeCode || '-'}</div>
          </div>
          <div style={{ background: '#FAFAFA', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('colStoreName')}</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{storeName || '-'}</div>
          </div>
          <div style={{ background: '#FAFAFA', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('configStatus')}</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#52C41A' }}>{t('configEnabled')}</div>
          </div>
        </div>
      </div>

      {/* 配置表單 */}
      <Spin spinning={loading}>
        <div style={{
          background: '#fff', borderRadius: 8, padding: '20px 24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          {/* 標題區 */}
          <div style={{
            fontSize: 15, fontWeight: 600, color: '#262626', marginBottom: 20,
            paddingBottom: 12, borderBottom: '1px dashed rgba(0,0,0,0.08)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              display: 'inline-block', width: 4, height: 16,
              background: '#E8720C', borderRadius: 2,
            }} />
            {t('signboardDataConfig')}
          </div>

          <div style={{
            padding: '12px 16px', marginBottom: 20,
            background: '#FFF7E6', borderRadius: 8,
            border: '1px solid #FFD591', fontSize: 13, color: '#D46B08',
          }}>
            {t('signboardDataConfigHint')}
          </div>

          {/* 計算指標 */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16,
            marginBottom: 20,
          }}>
            <div style={{ background: '#FFF7E6', borderRadius: 8, padding: '12px 16px', border: '1px solid #FFD591' }}>
              <div style={{ fontSize: 12, color: '#D46B08', marginBottom: 4 }}>月復購率</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#E8720C' }}>{repurchaseRate}%</div>
            </div>
            <div style={{ background: '#F6FFED', borderRadius: 8, padding: '12px 16px', border: '1px solid #B7EB8F' }}>
              <div style={{ fontSize: 12, color: '#389E0D', marginBottom: 4 }}>月好評率</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#52C41A' }}>{positiveRate}%</div>
            </div>
          </div>

          <Form
            form={form}
            layout="vertical"
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
              columnGap: 24, rowGap: 0,
            }}
          >
            <Form.Item
              label={t('monthlyOrders')}
              name="monthlyOrders"
              tooltip={t('monthlyOrdersTooltip')}
              rules={[
                { required: true, message: t('monthlyOrdersRequired') },
              ]}
            >
              <InputNumber
                min={0}
                precision={0}
                placeholder={t('monthlyOrdersPlaceholder')}
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              label={t('monthlyCustomers')}
              name="monthlyCustomers"
              tooltip={t('monthlyCustomersTooltip')}
              rules={[
                { required: true, message: t('monthlyCustomersRequired') },
              ]}
            >
              <InputNumber
                min={0}
                precision={0}
                placeholder={t('monthlyCustomersPlaceholder')}
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              label={t('monthlyRepurchaseOrders')}
              name="monthlyRepurchaseOrders"
              tooltip={t('monthlyRepurchaseOrdersTooltip')}
              rules={[
                { required: true, message: t('monthlyRepurchaseOrdersRequired') },
              ]}
            >
              <InputNumber
                min={0}
                precision={0}
                placeholder={t('monthlyRepurchaseOrdersPlaceholder')}
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              label={t('monthlyPositiveOrders')}
              name="monthlyPositiveOrders"
              tooltip={t('monthlyPositiveOrdersTooltip')}
              rules={[
                { required: true, message: t('monthlyPositiveOrdersRequired') },
              ]}
            >
              <InputNumber
                min={0}
                precision={0}
                placeholder={t('monthlyPositiveOrdersPlaceholder')}
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              label={t('monthlyVisits')}
              name="monthlyVisits"
              tooltip={t('monthlyVisitsTooltip')}
              rules={[
                { required: true, message: t('monthlyVisitsRequired') },
              ]}
            >
              <InputNumber
                min={0}
                precision={0}
                placeholder={t('monthlyVisitsPlaceholder')}
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              label={t('storeFavorites')}
              name="storeFavorites"
              tooltip={t('storeFavoritesTooltip')}
              rules={[
                { required: true, message: t('storeFavoritesRequired') },
              ]}
            >
              <InputNumber
                min={0}
                precision={0}
                placeholder={t('storeFavoritesPlaceholder')}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Form>
        </div>
      </Spin>

      {/* 底部操作欄 */}
      <div className="form-footer">
        <Button onClick={handleBack}>{t('common:cancel')}</Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={handleSave}
        >
          {t('common:save')}
        </Button>
      </div>
    </div>
  )
}
