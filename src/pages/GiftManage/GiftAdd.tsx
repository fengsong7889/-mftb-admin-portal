import { useState, useEffect } from 'react'
import { Button, Form, Input, Select, Space, Card, InputNumber, Upload, Radio, message } from 'antd'
import { ArrowLeftOutlined, SendOutlined, PlusOutlined, ShopOutlined, GiftOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'

const { TextArea } = Input

/** 廣告類型 */
const adTypeOptions = [
  { label: '新店廣告', value: 'new_store' },
  { label: '盤活復蘇', value: 'revival' },
  { label: '獨家商家', value: 'exclusive' },
  { label: '金牌商家', value: 'gold' },
  { label: '人氣商家(KA)', value: 'ka' },
]

/** 集團選項 */
const groupOptions = [
  { label: 'G001 - 美味餐廳集團', value: 'G001 - 美味餐廳集團' },
  { label: 'G002 - 生鮮超市集團', value: 'G002 - 生鮮超市集團' },
  { label: 'G003 - 時尚百貨集團', value: 'G003 - 時尚百貨集團' },
  { label: 'G004 - 速遞物流集團', value: 'G004 - 速遞物流集團' },
  { label: 'G005 - 甜品屋集團', value: 'G005 - 甜品屋集團' },
  { label: 'G006 - 火鍋城集團', value: 'G006 - 火鍋城集團' },
]

/** 門店選項 */
const storeOptions = [
  { label: 'S1001 - 澳門總店', value: 'S1001 - 澳門總店' },
  { label: 'S1002 - 氹仔分店', value: 'S1002 - 氹仔分店' },
  { label: 'S1003 - 新馬路店', value: 'S1003 - 新馬路店' },
  { label: 'S1004 - 黑沙環店', value: 'S1004 - 黑沙環店' },
  { label: 'S1005 - 官也街老店', value: 'S1005 - 官也街老店' },
  { label: 'S1006 - 珠海旗艦店', value: 'S1006 - 珠海旗艦店' },
]

export default function GiftAdd() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form] = Form.useForm()
  const [successVisible, setSuccessVisible] = useState(false)
  const [countdown, setCountdown] = useState(5)

  // 從 URL 參數判斷是否為贈送模式
  const isGiftMode = searchParams.get('mode') === 'gift'

  useEffect(() => {
    if (isGiftMode) {
      form.setFieldsValue({
        groupDisplay: searchParams.get('group') || '',
        storeDisplay: searchParams.get('store') || '',
        brand: searchParams.get('brand') === '1' ? 'flashBee' : searchParams.get('brand') === '2' ? 'mFood' : '',
        adType: searchParams.get('adType') || '',
      })
    }
  }, [isGiftMode, searchParams, form])

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
      await form.validateFields()
      const values = form.getFieldsValue()
      console.log('提交贈送申請:', values)
      setSuccessVisible(true)
    } catch (error) {
      console.error('表單驗證失敗:', error)
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

      <Form form={form} layout="horizontal">
      {/* ====== 集團與門店選擇 ====== */}
      <Card
        title={
          <Space>
            <ShopOutlined style={{ fontSize: 16, color: '#1890ff' }} />
            <span style={{ fontSize: 15, fontWeight: 500 }}>集團與門店選擇</span>
          </Space>
        }
        style={{
          marginTop: 16,
          backgroundColor: '#fafbfc',
          border: '1px solid #e8eaed',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
        headStyle={{
          backgroundColor: '#f0f5ff',
          borderBottom: '1px solid #d6e4ff',
          borderRadius: '8px 8px 0 0',
        }}
      >
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <span style={{ flexShrink: 0, marginRight: 8, fontSize: 14, fontWeight: 500, color: '#262626', whiteSpace: 'nowrap' }}>
                <span style={{ color: '#FF4D4F' }}>*</span> 集團ID/名稱
              </span>
              <Form.Item
                name="groupDisplay"
                rules={[{ required: true, message: '請選擇集團ID/名稱' }]}
                style={{ marginBottom: 0, flex: 1 }}
              >
                {isGiftMode ? (
                  <Input disabled />
                ) : (
                  <Select
                    showSearch
                    allowClear
                    placeholder="支持ID和名稱搜索查詢"
                    optionFilterProp="label"
                    options={groupOptions}
                  />
                )}
              </Form.Item>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <span style={{ flexShrink: 0, marginRight: 8, fontSize: 14, fontWeight: 500, color: '#262626', whiteSpace: 'nowrap' }}>
                <span style={{ color: '#FF4D4F' }}>*</span> 門店ID/名稱
              </span>
              <Form.Item
                name="storeDisplay"
                rules={[{ required: true, message: '請選擇門店ID/名稱' }]}
                style={{ marginBottom: 0, flex: 1 }}
              >
                {isGiftMode ? (
                  <Input disabled />
                ) : (
                  <Select
                    showSearch
                    allowClear
                    placeholder="支持ID和名稱搜索查詢"
                    optionFilterProp="label"
                    options={storeOptions}
                  />
                )}
              </Form.Item>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <span style={{ flexShrink: 0, marginRight: 8, fontSize: 14, fontWeight: 500, color: '#262626', whiteSpace: 'nowrap' }}>
                <span style={{ color: '#FF4D4F' }}>*</span> 所屬品牌
              </span>
              <Form.Item
                name="brand"
                rules={[{ required: true, message: '請選擇所屬品牌' }]}
                style={{ marginBottom: 0, flex: 1 }}
              >
                <Radio.Group disabled={isGiftMode}>
                  <Radio value="flashBee">閃蜂</Radio>
                  <Radio value="mFood">mFood</Radio>
                </Radio.Group>
              </Form.Item>
            </div>
          </div>
      </Card>

      {/* ====== 贈送配置 ====== */}
      <Card
        title={
          <Space>
            <ClockCircleOutlined style={{ fontSize: 16, color: '#E8720C' }} />
            <span style={{ fontSize: 15, fontWeight: 500 }}>贈送配置</span>
          </Space>
        }
        extra={
          <span style={{ fontSize: 12, color: '#8C6D1F' }}>
            📋 提交後將進入審批中心，審核通過後系統自動為商戶增加對應廣告天數。
          </span>
        }
        style={{
          marginTop: 16,
          backgroundColor: '#fafbfc',
          border: '1px solid #e8eaed',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
        headStyle={{
          backgroundColor: '#FFF7E6',
          borderBottom: '1px solid #FFD591',
          borderRadius: '8px 8px 0 0',
        }}
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <span style={{ flexShrink: 0, marginRight: 8, fontSize: 14, fontWeight: 500, color: '#262626', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#FF4D4F' }}>*</span> 廣告類型
            </span>
            <Form.Item
              name="adType"
              rules={[{ required: true, message: '請選擇廣告類型' }]}
              style={{ marginBottom: 0, flex: 1 }}
            >
              <Select
                placeholder="請選擇廣告類型"
                options={adTypeOptions}
                disabled={isGiftMode}
              />
            </Form.Item>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <span style={{ flexShrink: 0, marginRight: 8, fontSize: 14, fontWeight: 500, color: '#262626', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#FF4D4F' }}>*</span> 贈送天數
            </span>
            <Form.Item
              name="giftDays"
              rules={[{ required: true, message: '請輸入贈送天數' }]}
              style={{ marginBottom: 0, flex: 1 }}
            >
              <InputNumber
                placeholder="請輸入贈送天數"
                min={1}
                max={365}
                style={{ width: '100%' }}
                addonAfter="天"
              />
            </Form.Item>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <span style={{ flexShrink: 0, marginRight: 8, fontSize: 14, fontWeight: 500, color: '#262626', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#FF4D4F' }}>*</span> 有效期
            </span>
            <Form.Item
              name="validDays"
              rules={[{ required: true, message: '請輸入有效期天數' }]}
              style={{ marginBottom: 0, flex: 1 }}
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
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: 16 }}>
          <span style={{ flexShrink: 0, marginRight: 8, fontSize: 14, fontWeight: 500, color: '#262626', whiteSpace: 'nowrap', lineHeight: '32px' }}>
            <span style={{ color: '#FF4D4F' }}>*</span> 贈送原因
          </span>
          <Form.Item
            name="reason"
            rules={[{ required: true, message: '請輸入贈送原因' }]}
            style={{ marginBottom: 0, flex: 1 }}
          >
            <TextArea
              placeholder="請填寫贈送原因，便於相關審核人審閱，時限制500字"
              rows={5}
              maxLength={500}
              showCount
            />
          </Form.Item>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: 16 }}>
          <span style={{ flexShrink: 0, marginRight: 8, fontSize: 14, fontWeight: 500, color: '#262626', whiteSpace: 'nowrap', lineHeight: '32px' }}>
            <span style={{ color: '#FF4D4F' }}>*</span> 相關憑證
          </span>
          <Form.Item
            name="certificate"
            required
            style={{ marginBottom: 0, flex: 1 }}
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
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>
            支持 png、jpg、webp、jpeg、pdf；最大 10MB；最多上傳 5 張
          </div>
          </Form.Item>
        </div>
      </Card>
      </Form>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Button onClick={handleBack}>
          取消
        </Button>
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSubmit}
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
