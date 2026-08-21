import { useState, useEffect, useMemo } from 'react'
import { Button, Form, Input, Select, InputNumber, Upload, message, Modal, Radio } from 'antd'
import { ArrowLeftOutlined, SendOutlined, PlusOutlined, ShopOutlined, GiftOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { MerchantGroupItem } from '../../api/merchantGroup'
import { fetchAllMerchantGroups } from '../../api/merchantGroup'
import type { StoreItem } from '../../api/store'
import { fetchStoresByGroup } from '../../api/store'
import { mockSubmitApproval } from '../../api/mock/financeMock'
import { createGiftRecord } from '../../api/gift'
import { getSystemRuleValue } from '../../hooks/useSystemRules'
import { getBrandLabel } from '../../constants/brand'
import BrandTag from '../../components/BrandTag'

const { TextArea } = Input

/** 所屬品牌只讀展示（受 Form 控制）：選擇門店後直接展示品牌標籤，無需單選 */
function BrandDisplay({ value, placeholder }: { value?: string; placeholder?: string }) {
  if (!value) {
    return <span style={{ color: '#8C8C8C', fontSize: 13 }}>{placeholder}</span>
  }
  return <BrandTag value={value} />
}

export default function GiftAdd() {
  const { t } = useTranslation('giftAdd')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form] = Form.useForm()

  /** 廣告類型（新店廣告、盤活復蘇、人氣商家） */
  const adTypeOptions = [
    { label: t('adTypeNewStore'), value: 'new_store' },
    { label: t('adTypeRevival'), value: 'revival' },
    { label: t('adTypePopularMerchant'), value: 'popular_merchant' },
  ]
  const [successVisible, setSuccessVisible] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [submitting, setSubmitting] = useState(false)
  const [submittedFlowNo, setSubmittedFlowNo] = useState('')
  /** 當前門店是否有多品牌需要用戶手動選擇 */
  const [needsBrandSelection, setNeedsBrandSelection] = useState(false)
  /** 門店支持的品牌列表（多品牌時供 Radio 單選） */
  const [storeBrandOptions, setStoreBrandOptions] = useState<{ label: string; value: string }[]>([])

  // 集团/门店数据
  const [groups, setGroups] = useState<MerchantGroupItem[]>([])
  const [stores, setStores] = useState<StoreItem[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>()

  // 监控广告类型选择，动态读取规则配置
  const selectedAdType = Form.useWatch('adType', form) as string | undefined

  /** 当前广告类型是否需要审批 */
  const needApproval = useMemo(() => {
    if (!selectedAdType) return true
    const key = `gift_approval_${selectedAdType}`
    return getSystemRuleValue<boolean>(key) ?? true
  }, [selectedAdType])

  /** 当前广告类型的赠送限制天数（0=不限，默认365） */
  const giftMaxDays = useMemo(() => {
    if (!selectedAdType) return 365
    const key = `gift_limit_${selectedAdType}`
    return getSystemRuleValue<number>(key) || 365
  }, [selectedAdType])

  // 從 URL 參數判斷是否為贈送模式
  const isGiftMode = searchParams.get('mode') === 'gift'
  const presetGroupId = searchParams.get('group')
  const presetStoreId = searchParams.get('store')

  // 加载集团下拉
  useEffect(() => {
    fetchAllMerchantGroups()
      .then(setGroups)
      .catch(() => message.error(t('loadGroupFailed')))
  }, [])

  // 贈送模式：预选集团和门店
  useEffect(() => {
    if (isGiftMode && presetGroupId) {
      const gid = Number(presetGroupId)
      setSelectedGroupId(gid)
      form.setFieldsValue({ groupId: gid })

      // 加载该集团下的门店
      fetchStoresByGroup(gid)
        .then((storeList) => {
          setStores(storeList)
          if (presetStoreId) {
            form.setFieldsValue({ storeId: Number(presetStoreId) })
          }
        })
        .catch(() => setStores([]))

      // 设置品牌和广告类型
      const brandParam = searchParams.get('brand')
      const adTypeParam = searchParams.get('adType')
      if (brandParam) form.setFieldsValue({ brand: brandParam })
      if (adTypeParam) form.setFieldsValue({ adType: adTypeParam })
    }
  }, [isGiftMode, presetGroupId, presetStoreId, searchParams, form])

  // 集团选择变化时加载门店（品牌随门店自动带出，切换集团后同步清空）
  useEffect(() => {
    if (selectedGroupId && !isGiftMode) {
      fetchStoresByGroup(selectedGroupId)
        .then(setStores)
        .catch(() => setStores([]))
      form.setFieldsValue({ storeId: undefined, brand: undefined })
    }
  }, [selectedGroupId, isGiftMode, form])

  /** 選擇門店後自動帶出所屬品牌（多品牌時需用戶手動選擇） */
  const handleStoreChange = (storeId?: number) => {
    const store = stores.find(s => s.id === storeId)
    const brandStr = store?.brand || ''
    const brands = brandStr.split(',').map(b => b.trim()).filter(Boolean)
    if (brands.length > 1) {
      // 門店同時屬於多個品牌，讓用戶單選
      setNeedsBrandSelection(true)
      setStoreBrandOptions(brands.map(b => ({
        label: getBrandLabel(b) || b,
        value: b,
      })))
      form.setFieldsValue({ brand: undefined })
    } else {
      setNeedsBrandSelection(false)
      setStoreBrandOptions([])
      form.setFieldsValue({ brand: brands[0] })
    }
  }

  // 倒計時邏輯
  useEffect(() => {
    if (!successVisible) return
    if (countdown <= 0) {
      setSuccessVisible(false)
      navigate('/gift-detail')
      return
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [successVisible, countdown, navigate])

  const handleBack = () => {
    navigate('/gift-detail')
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      // 校验逻辑已迁移至规则配置「限制天數」，由表單 max 校驗控制

      // 处理凭证文件（目前仅前端占位，实际上传需要文件上传服务）
      const certificateFiles = form.getFieldValue('certificate') || []
      const credentials = certificateFiles.map((f: { name?: string }) => f.name || '').filter(Boolean)

      const group = groups.find(g => g.id === values.groupId)
      const store = stores.find(s => s.id === values.storeId)
      const adLabel = adTypeOptions.find(o => o.value === values.adType)?.label || values.adType

      // ====== 二次確認彈窗 ======
      Modal.confirm({
        title: t('confirmSubmit'),
        icon: (
          <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
        ),
        centered: true,
        className: 'custom-confirm-modal',
        width: 520,
        okText: t('common:confirmSubmit'),
        cancelText: t('common:cancel'),
        content: (
          <div>
            <div className="confirm-info-card">
              <div className="confirm-info-row">
                <span className="confirm-info-label">{t('common:colGroupName')}</span>
                <span className="confirm-info-value">{group?.groupName || '-'}</span>
              </div>
              <div className="confirm-info-row">
                <span className="confirm-info-label">{t('common:colStoreName')}</span>
                <span className="confirm-info-value">{store?.storeName || '-'}</span>
              </div>
              <div className="confirm-info-row">
                <span className="confirm-info-label">{t('adType')}</span>
                <span className="confirm-info-value">{adLabel}</span>
              </div>
              <div className="confirm-info-row">
                <span className="confirm-info-label">{t('giftDays')}</span>
                <span className="confirm-info-value highlight">{values.giftDays} {t('dayUnit')}</span>
              </div>
              <div className="confirm-info-row">
                <span className="confirm-info-label">{t('validDays')}</span>
                <span className="confirm-info-value">{values.validDays} {t('dayUnit')}</span>
              </div>
            </div>
            {!needApproval && (
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 8,
                background: 'linear-gradient(135deg, #FFF1F0, #FFFAF0)',
                border: '1.5px solid #FF7A45',
                fontSize: 13, color: '#CF1322', lineHeight: 1.6, fontWeight: 500,
              }}>
                ⚡ 當前贈送審批流程已停用，確認後將直接贈送到賬，無需審批。
              </div>
            )}
          </div>
        ),
        onOk: async () => {
          try {
            if (needApproval) {
              // 需要审批：提交審批記錄（TG 流程號），審批全部通過後才寫入贈送記錄/剩餘天數
              const flowNo = mockSubmitApproval({
                approvalType: 'gift',
                groupId: group?.groupCode || String(values.groupId),
                groupName: group?.groupName || '',
                brand: values.brand,
                extra: {
                  groupId: values.groupId,
                  groupCode: group?.groupCode,
                  groupName: group?.groupName,
                  storeId: values.storeId,
                  storeCode: store?.storeCode,
                  storeName: store?.storeName,
                  adType: values.adType,
                  giftDays: values.giftDays,
                  validDays: values.validDays,
                  reason: values.reason,
                  remark: values.reason,
                  credentials,
                },
              })
              setSubmittedFlowNo(flowNo)
            } else {
              // 无需审批：直接创建赠送记录，立即生效
              await createGiftRecord({
                groupId: values.groupId,
                storeId: values.storeId,
                brand: values.brand,
                adType: values.adType,
                giftDays: values.giftDays,
                validDays: values.validDays,
                reason: values.reason,
                credentials,
              })
              setSubmittedFlowNo('') // 无流程号
            }
            setCountdown(5)
            // 等待確認彈窗完全關閉後再顯示成功彈窗
            setTimeout(() => setSuccessVisible(true), 350)
          } catch {
            message.error(t('submitFailed'))
          }
        },
      })
    } catch (_err: unknown) {
      if (_err && typeof _err === 'object' && 'errorFields' in _err) return
      message.error(t('submitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="content-area">
      {/* ====== 頁面頭部 ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%',
          animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>{t('common:back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {isGiftMode ? t('giftAdDays') : t('addGift')}
              </h2>
              {isGiftMode && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 12px', background: '#FFF7E6',
                  border: '1px solid #FFD591', borderRadius: 4,
                  fontSize: 13, color: '#E8720C', fontWeight: 500,
                }}>
                  <GiftOutlined />
                  {t('giftMode')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical">
      {/* ====== 集團與門店選擇 ====== */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShopOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('groupStoreSelection')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
          <Form.Item
            label={t('groupIdName')}
            name="groupId"
            rules={[{ required: true, message: t('selectGroup') }]}
          >
            {isGiftMode ? (
              <Select
                disabled
                showSearch
                optionFilterProp="label"
                options={groups.map(g => ({
                  label: `${g.groupCode} - ${g.groupName}`,
                  value: g.id,
                }))}
              />
            ) : (
              <Select
                showSearch
                allowClear
                placeholder={t('searchGroupIdName')}
                optionFilterProp="label"
                onChange={(v) => setSelectedGroupId(v)}
                options={groups.map(g => ({
                  label: `${g.groupCode} - ${g.groupName}`,
                  value: g.id,
                }))}
              />
            )}
          </Form.Item>

          <Form.Item
            label={t('storeIdName')}
            name="storeId"
            rules={[{ required: true, message: t('selectStore') }]}
          >
            {isGiftMode ? (
              <Select
                disabled
                showSearch
                optionFilterProp="label"
                options={stores.map(s => ({
                  label: `${s.storeCode} - ${s.storeName}`,
                  value: s.id,
                }))}
              />
            ) : (
              <Select
                showSearch
                allowClear
                placeholder={t('selectGroupFirst')}
                optionFilterProp="label"
                disabled={!selectedGroupId}
                onChange={handleStoreChange}
                options={stores.map(s => ({
                  label: `${s.storeCode} - ${s.storeName}`,
                  value: s.id,
                }))}
              />
            )}
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.storeId !== cur.storeId}
          >
            {() => (
              <Form.Item
                label={t('common:brand')}
                name="brand"
                rules={[{ required: true, message: needsBrandSelection ? t('selectBrand') : t('selectStoreFirst') }]}
              >
                {needsBrandSelection ? (
                  <Radio.Group optionType="button" buttonStyle="solid">
                    {storeBrandOptions.map(opt => (
                      <Radio.Button key={opt.value} value={opt.value}>{opt.label}</Radio.Button>
                    ))}
                  </Radio.Group>
                ) : (
                  <BrandDisplay placeholder={t('selectStoreFirst')} />
                )}
              </Form.Item>
            )}
          </Form.Item>
        </div>
      </div>

      {/* ====== 贈送配置 ====== */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClockCircleOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('giftConfig')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          <span style={{ fontSize: 12, color: '#8C6D1F' }}>
            {t('approvalTip')}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
          <Form.Item
            label={t('adType')}
            name="adType"
            rules={[{ required: true, message: t('selectAdType') }]}
          >
            <Select
              placeholder={t('selectAdType')}
              options={adTypeOptions}
              disabled={isGiftMode}
            />
          </Form.Item>

          <Form.Item
            label={t('giftDays')}
            name="giftDays"
            rules={[{ required: true, message: t('inputGiftDays') }]}
          >
            <InputNumber
              placeholder={t('inputGiftDays')}
              min={1}
              max={giftMaxDays}
              style={{ width: '100%' }}
              addonAfter={t('dayUnit')}
            />
          </Form.Item>

          <Form.Item
            label={t('validDays')}
            name="validDays"
            rules={[{ required: true, message: t('inputValidDays') }]}
          >
            <InputNumber
              placeholder={t('inputValidDays')}
              min={1}
              max={730}
              style={{ width: '100%' }}
              addonAfter={t('dayUnit')}
            />
          </Form.Item>
        </div>

        <Form.Item
          label={t('giftReason')}
          name="reason"
          rules={[{ required: true, message: t('inputGiftReason') }]}
        >
          <TextArea
            placeholder={t('reasonPlaceholder')}
            rows={5}
            maxLength={500}
            showCount
          />
        </Form.Item>

        <Form.Item
          label={t('certificate')}
          name="certificate"
          required
          rules={[{
            validator: (_, _value) => {
              const fileList = form.getFieldValue('certificate')
              if (!fileList || (Array.isArray(fileList) && fileList.length === 0)) {
                return Promise.reject(new Error(t('uploadCert')))
              }
              return Promise.resolve()
            }
          }]}
        >
          <Upload
            beforeUpload={() => false}
            maxCount={5}
            accept=".png,.jpg,.webp,.jpeg,.pdf"
            listType="picture-card"
            onChange={({ fileList }) => {
              form.setFieldsValue({ certificate: fileList })
              form.validateFields(['certificate'])
            }}
          >
            <div>
              <PlusOutlined style={{ fontSize: 20, color: '#8C8C8C' }} />
              <div style={{ marginTop: 8, fontSize: 12, color: '#8C8C8C' }}>{t('uploadCertBtn')}</div>
            </div>
          </Upload>
        </Form.Item>
        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: -16 }}>
          {t('certFormatTip')}
        </div>
      </div>
      </Form>

      {/* 底部操作按鈕（取消/提交申請） */}
      <div className="form-footer">
        <Button onClick={handleBack}>{t('common:cancel')}</Button>
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSubmit}
          loading={submitting}
        >
          {t('submitApply')}
        </Button>
      </div>

      {/* ====== 提交成功彈窗 ====== */}
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
              <span style={{ fontSize: 32, color: '#fff' }}>✓</span>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#262626', marginBottom: 12 }}>
              {t('submitSuccess')}
            </h3>
            <p style={{ fontSize: 14, color: '#595959', lineHeight: 1.8, marginBottom: 24 }}>
              {submittedFlowNo ? (
                <>
                  {t('flowNo')}：<span style={{ color: '#E8720C', fontWeight: 600 }}>{submittedFlowNo}</span><br />
                  {t('approvalProgressTip')}
                </>
              ) : (
                t('directSuccessTip')
              )}
            </p>
            <Button
              type="primary"
              size="large"
              onClick={() => navigate('/gift-detail')}
              style={{ minWidth: 120, height: 40, borderRadius: 8 }}
            >
              {t('backToList')}{countdown > 0 && ` (${countdown}s)`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
