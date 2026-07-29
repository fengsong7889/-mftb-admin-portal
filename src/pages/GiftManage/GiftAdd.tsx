import { useState, useEffect } from 'react'
import { Button, Form, Input, Select, Tag, InputNumber, Upload, Radio, message } from 'antd'
import { ArrowLeftOutlined, SendOutlined, PlusOutlined, ShopOutlined, GiftOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { MerchantGroupItem } from '../../api/merchantGroup'
import { fetchAllMerchantGroups } from '../../api/merchantGroup'
import type { StoreItem } from '../../api/store'
import { fetchStoresByGroup } from '../../api/store'
import { createGiftRecord } from '../../api/gift'

const { TextArea } = Input

/** 廣告類型（僅保留新店廣告與盤活復蘇） */
const adTypeOptions = [
  { label: '新店廣告', value: 'new_store' },
  { label: '盤活復蘇', value: 'revival' },
]

export default function GiftAdd() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form] = Form.useForm()
  const [successVisible, setSuccessVisible] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [submitting, setSubmitting] = useState(false)

  // 集团/门店数据
  const [groups, setGroups] = useState<MerchantGroupItem[]>([])
  const [stores, setStores] = useState<StoreItem[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>()

  // 從 URL 參數判斷是否為贈送模式
  const isGiftMode = searchParams.get('mode') === 'gift'
  const presetGroupId = searchParams.get('group')
  const presetStoreId = searchParams.get('store')

  // 加载集团下拉
  useEffect(() => {
    fetchAllMerchantGroups()
      .then(setGroups)
      .catch(() => message.error('加載集團列表失敗'))
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

  // 集团选择变化时加载门店
  useEffect(() => {
    if (selectedGroupId && !isGiftMode) {
      fetchStoresByGroup(selectedGroupId)
        .then(setStores)
        .catch(() => setStores([]))
      form.setFieldsValue({ storeId: undefined })
    }
  }, [selectedGroupId, isGiftMode, form])

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

      // 处理凭证文件（目前仅前端占位，实际上传需要文件上传服务）
      const certificateFiles = form.getFieldValue('certificate') || []
      const credentials = certificateFiles.map((f: { name?: string }) => f.name || '').filter(Boolean)

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

      setSuccessVisible(true)
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('提交失敗，請重試')
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
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {isGiftMode ? '贈送廣告天數' : '新增推廣贈送'}
              </h2>
              {isGiftMode && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 12px', background: '#FFF7E6',
                  border: '1px solid #FFD591', borderRadius: 4,
                  fontSize: 13, color: '#E8720C', fontWeight: 500,
                }}>
                  <GiftOutlined />
                  贈送模式
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
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>集團與門店選擇</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
          <Form.Item
            label="集團ID/名稱"
            name="groupId"
            rules={[{ required: true, message: '請選擇集團' }]}
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
                placeholder="支持ID和名稱搜索查詢"
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
            label="門店ID/名稱"
            name="storeId"
            rules={[{ required: true, message: '請選擇門店' }]}
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
                placeholder="請先選擇集團"
                optionFilterProp="label"
                disabled={!selectedGroupId}
                options={stores.map(s => ({
                  label: `${s.storeCode} - ${s.storeName}`,
                  value: s.id,
                }))}
              />
            )}
          </Form.Item>

          <Form.Item
            label="所屬品牌"
            name="brand"
            rules={[{ required: true, message: '請選擇所屬品牌' }]}
          >
            <Radio.Group disabled={isGiftMode}>
              <Radio value="flashBee">閃蜂</Radio>
              <Radio value="mFood">mFood</Radio>
            </Radio.Group>
          </Form.Item>
        </div>
      </div>

      {/* ====== 贈送配置 ====== */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClockCircleOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>贈送配置</span>
          <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>需審批</Tag>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          <span style={{ fontSize: 12, color: '#8C6D1F' }}>
            📋 提交後將進入審批中心，審核通過後系統自動為商戶增加對應廣告天數。
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
          <Form.Item
            label="廣告類型"
            name="adType"
            rules={[{ required: true, message: '請選擇廣告類型' }]}
          >
            <Select
              placeholder="請選擇廣告類型"
              options={adTypeOptions}
              disabled={isGiftMode}
            />
          </Form.Item>

          <Form.Item
            label="贈送天數"
            name="giftDays"
            rules={[{ required: true, message: '請輸入贈送天數' }]}
          >
            <InputNumber
              placeholder="請輸入贈送天數"
              min={1}
              max={365}
              style={{ width: '100%' }}
              addonAfter="天"
            />
          </Form.Item>

          <Form.Item
            label="有效期"
            name="validDays"
            rules={[{ required: true, message: '請輸入有效期天數' }]}
          >
            <InputNumber
              placeholder="請輸入有效期天數"
              min={1}
              max={730}
              style={{ width: '100%' }}
              addonAfter="天"
            />
          </Form.Item>
        </div>

        <Form.Item
          label="贈送原因"
          name="reason"
          rules={[{ required: true, message: '請輸入贈送原因' }]}
        >
          <TextArea
            placeholder="請填寫贈送原因，便於相關審核人審閱，時限制500字"
            rows={5}
            maxLength={500}
            showCount
          />
        </Form.Item>

        <Form.Item
          label="相關憑證"
          name="certificate"
          required
          rules={[{
            validator: (_, value) => {
              const fileList = form.getFieldValue('certificate')
              if (!fileList || (Array.isArray(fileList) && fileList.length === 0)) {
                return Promise.reject(new Error('請上傳相關憑證'))
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
              <div style={{ marginTop: 8, fontSize: 12, color: '#8C8C8C' }}>上傳憑證</div>
            </div>
          </Upload>
        </Form.Item>
        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: -16 }}>
          支持 png、jpg、webp、jpeg、pdf；最大 10MB；最多上傳 5 張
        </div>
      </div>
      </Form>

      {/* 底部操作按鈕（取消/提交申請） */}
      <div className="form-footer">
        <Button onClick={handleBack}>取消</Button>
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSubmit}
          loading={submitting}
        >
          提交申請
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
              提交成功
            </h3>
            <p style={{ fontSize: 14, color: '#595959', lineHeight: 1.8, marginBottom: 24 }}>
              該流程已經進入審批，可到<span style={{ color: '#E8720C', fontWeight: 500 }}>審批中心</span>菜單查看審批進度
            </p>
            <Button
              type="primary"
              size="large"
              onClick={() => navigate('/gift-detail')}
              style={{ minWidth: 120, height: 40, borderRadius: 8 }}
            >
              返回列表{countdown > 0 && ` (${countdown}s)`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
