import { useState, useEffect, useRef } from 'react'
import { Form, Input, Select, Radio, Button, Upload, message, InputNumber, Tag, Popover } from 'antd'
import {
  ArrowLeftOutlined,
  SendOutlined,
  UploadOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  AccountBookOutlined,
  DollarOutlined,
  FileProtectOutlined,
  EditOutlined,
  QuestionCircleOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BrandTag from '../../components/BrandTag'
import { fetchFinAccounts, fetchFinBatches, submitDeductApply, withFinanceFallback } from '../../api/finance'
import type { DeductApplyPayload } from '../../api/finance'
import { fetchStoresByGroupCode, fetchStoreBds } from '../../api/store'
import type { OptionItem } from '../../api/types'
import { mockSubmitApproval } from '../../api/mock/financeMock'

/* ---- 數字動畫 Hook（遵循數據指標統計卡標準） ---- */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setValue(Math.round(target * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])
  return value
}

function AnimatedNumber({ value, suffix = '', prefix = '' }: { value: number; suffix?: string; prefix?: string }) {
  const animated = useCountUp(value)
  return <>{prefix}{animated.toLocaleString()}{suffix}</>
}

/** 扣款方式選項 */
const deductMethodOptions = [
  { label: '消費扣款', value: 'consume' },
  { label: '充值批次扣款', value: 'batch' },
  { label: '賬戶扣款', value: 'account' },
]

/** 業務頻道選項 */
const businessChannelOptions = [
  { label: '美食外賣', value: 'foodTakeout' },
  { label: '超市百貨', value: 'supermarket' },
  { label: '團購到店', value: 'groupBuyStore' },
]

/** 消費類型選項 */
const consumeTypeOptions = [
  { label: 'POS機維修', value: 'posRepair' },
  { label: '巴士廣告', value: 'busAd' },
  { label: '百貨精選', value: 'deptStore' },
  { label: '復蘇盤活', value: 'revitalize' },
  { label: '基礎套餐', value: 'basicPlan' },
  { label: '機器檢測', value: 'machineInspect' },
  { label: '機器維修', value: 'machineRepair' },
  { label: '金牌套餐', value: 'goldPlan' },
  { label: '精選套餐', value: 'selectPlan' },
  { label: '免費入駐', value: 'freeEntry' },
  { label: '企業套餐', value: 'enterprisePlan' },
  { label: '升級套餐', value: 'upgradePlan' },
  { label: '團購套餐', value: 'groupPlan' },
  { label: '小紅書廣告', value: 'xiaohongshuAd' },
  { label: '專業套餐', value: 'proPlan' },
]

/** 充值批次選項（批次號 + 可扣金額 + 結算方式） */
interface BatchOption {
  label: string
  value: string
  deductible: number
  settlement: string
}

/** 結算方式映射 */
const settlementMap: Record<string, string> = {
  corporate: '對公轉賬',
  mixed: '混合支付',
  revenue: '營業額支付',
}

/** 数字金额转中文大写 */
function amountToChinese(num: number): string {
  if (!num || num <= 0) return ''
  const digits = ['零', '壹', '貳', '叁', '肆', '伍', '陸', '柒', '捌', '玖']
  const units = ['', '拾', '佰', '仟']
  const bigUnits = ['', '萬', '億']
  const intPart = Math.floor(num)
  const decPart = Math.round((num - intPart) * 100)
  const jiao = Math.floor(decPart / 10)
  const fen = decPart % 10

  let result = ''
  const intStr = String(intPart)
  const groups: number[][] = []
  for (let i = intStr.length; i > 0; i -= 4) {
    groups.unshift(intStr.slice(Math.max(0, i - 4), i).split('').map(Number))
  }
  groups.forEach((group, gi) => {
    let groupStr = ''
    let zeroFlag = false
    group.forEach((d, di) => {
      if (d === 0) { zeroFlag = true; return }
      if (zeroFlag) { groupStr += '零'; zeroFlag = false }
      groupStr += digits[d] + units[group.length - 1 - di]
    })
    if (groupStr) result += groupStr + bigUnits[groups.length - 1 - gi]
  })
  result += '元'
  if (jiao > 0) result += digits[jiao] + '角'
  if (fen > 0) result += digits[fen] + '分'
  return result
}

export default function DeductAdd() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const groupIdParam = searchParams.get('groupId') || ''
  const groupNameParam = searchParams.get('groupName') || ''
  const brandParam = searchParams.get('brand') || 'mFood'

  const [form] = Form.useForm()
  const [deductMethod, setDeductMethod] = useState('consume')
  const [selectedBatch, setSelectedBatch] = useState<string | undefined>(undefined)
  /** 集團虛擬賬戶餘額（數據庫讀取） */
  const [sourceVirtualBalance, setSourceVirtualBalance] = useState(0)
  /** 門店選項：該集團下且品牌相同的門店 */
  const [storeOptions, setStoreOptions] = useState<OptionItem[]>([])
  /** 歸屬BD選項：所選門店綁定的BD */
  const [bdOptions, setBdOptions] = useState<OptionItem[]>([])
  /** 充值批次選項：該集團的充值批次 */
  const [batchOptions, setBatchOptions] = useState<BatchOption[]>([])
  const [deductAmount, setDeductAmount] = useState<number>(0)
  const [certificateFiles, setCertificateFiles] = useState<any[]>([])
  const [successVisible, setSuccessVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedFlowNo, setSubmittedFlowNo] = useState('')
  const [countdown, setCountdown] = useState(5)

  /** 當前批次的可扣金額 */
  const currentBatch = batchOptions.find(b => b.value === selectedBatch)

  // 加載虛擬賬戶餘額（按集團+品牌定位賬戶）
  useEffect(() => {
    if (!groupIdParam) return
    fetchFinAccounts({ page: 1, size: 1, groupId: groupIdParam, brand: brandParam })
      .then(res => setSourceVirtualBalance(Number(res.records?.[0]?.virtualBalance) || 0))
      .catch(() => setSourceVirtualBalance(0))
  }, [groupIdParam, brandParam])

  // 加載門店選項（集團下且所屬品牌與集團一致）
  useEffect(() => {
    if (!groupIdParam) return
    fetchStoresByGroupCode(groupIdParam, brandParam)
      .then(list => setStoreOptions(list || []))
      .catch(() => setStoreOptions([]))
  }, [groupIdParam, brandParam])

  // 加載充值批次選項（數據庫充值批次，可扣金額=虛擬充值金額）
  useEffect(() => {
    if (!groupIdParam) return
    fetchFinBatches({ page: 1, size: 200, groupId: groupIdParam, brand: brandParam, batchType: 'recharge' })
      .then(res => {
        const options = (res.records || []).map(b => ({
          label: b.batchNo,
          value: b.batchNo,
          deductible: Number(b.virtualAmount) || 0,
          settlement: String(b.extra?.payMethod || ''),
        }))
        setBatchOptions(options)
      })
      .catch(() => setBatchOptions([]))
  }, [groupIdParam, brandParam])

  /** 選擇門店後：重置歸屬BD，並加載該門店綁定的BD選項 */
  const handleStoreChange = (storeId?: string) => {
    form.setFieldValue('consumeBd', undefined)
    setBdOptions([])
    if (!storeId) return
    fetchStoreBds(Number(storeId))
      .then(list => setBdOptions((list || []).map(b => ({
        value: b.bdEmpId,
        label: `${b.bdName || b.bdEmpId}(${b.bdEmpId})`,
      }))))
      .catch(() => setBdOptions([]))
  }

  // 提交成功彈窗倒計時
  useEffect(() => {
    if (!successVisible) return
    if (countdown <= 0) {
      setSuccessVisible(false)
      navigate('/account-balance')
      return
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [successVisible, countdown, navigate])

  /** 提交申請 */
  const handleSubmit = async () => {
    try {
      await form.validateFields()
      if (!deductAmount || deductAmount <= 0) {
        message.warning('請填寫扣款金額')
        return
      }
      if (deductMethod === 'batch' && currentBatch && deductAmount > currentBatch.deductible) {
        message.warning('扣款金額不能超過可扣金額')
        return
      }
      if (certificateFiles.length === 0) {
        message.warning('請上傳相關憑證')
        return
      }
      // 提交審批記錄
      const consumeStoreId = form.getFieldValue('consumeStore')
      const consumeStoreOpt = storeOptions.find(s => s.value === consumeStoreId)
      const consumeTypeVal = form.getFieldValue('consumeType')
      const consumeChannelVal = form.getFieldValue('consumeChannel')
      const consumeBdVal = form.getFieldValue('consumeBd')
      const payload: DeductApplyPayload = {
        groupId: groupIdParam,
        groupName: groupNameParam,
        brand: brandParam,
        deductMethod,
        deductAmount,
        virtualBalance: sourceVirtualBalance,
        consumeChannel: businessChannelOptions.find(c => c.value === consumeChannelVal)?.label || '',
        consumeStore: consumeStoreOpt?.label || '',
        consumeType: consumeTypeOptions.find(t => t.value === consumeTypeVal)?.label || '',
        consumeBd: bdOptions.find(o => o.value === consumeBdVal)?.label || consumeBdVal || '--',
        batchNo: deductMethod === 'batch' ? (selectedBatch || '') : '',
        batchDeductible: deductMethod === 'batch' ? (currentBatch?.deductible || 0) : 0,
        batchSettlement: deductMethod === 'batch' ? (settlementMap[currentBatch?.settlement || ''] || '') : '',
        remark: form.getFieldValue('remark') || '',
      }
      setSubmitting(true)
      const flowNo = await withFinanceFallback(
        () => submitDeductApply(payload),
        () => mockSubmitApproval({
          approvalType: 'deduct',
          groupId: groupIdParam,
          groupName: groupNameParam,
          brand: brandParam,
          extra: { ...payload },
        }),
      )
      setSubmittedFlowNo(flowNo)
      setCountdown(5)
      setSuccessVisible(true)
    } catch (err) {
      // 表单校验未通过时 antd 已在字段标红；财务接口为静默请求，后端业务错误需在此提示
      if (!(err && typeof err === 'object' && 'errorFields' in err)) {
        message.error(err instanceof Error && err.message ? err.message : '提交失败，请稍后重试')
      }
    } finally {
      setSubmitting(false)
    }
  }
  
  /** 文件上传前校验 */
  const beforeUpload = (file: File) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
    if (!validTypes.includes(file.type)) {
      message.error('僅支持 jpeg/jpg/png/PDF 格式')
      return Upload.LIST_IGNORE
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('文件大小不能超過 5MB')
      return Upload.LIST_IGNORE
    }
    return false
  }

  /** 渲染文件列表 */
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
          <span style={{ fontSize: 10, color: '#999', marginTop: 4, maxWidth: 76, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name}
          </span>
          <Button type="text" size="small" danger
            style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#ff4d4f', color: '#fff', fontSize: 12, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setCertificateFiles(certificateFiles.filter(f => f.uid !== file.uid))}
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
            onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = '#E8720C'; el.style.background = '#fff7e6'; el.style.color = '#E8720C' }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = '#d9d9d9'; el.style.background = '#fafafa'; el.style.color = '#999' }}
          >
            <UploadOutlined style={{ fontSize: 22, marginBottom: 4, color: 'inherit' }} />
            <span>上傳</span>
          </div>
        </Upload>
      )}
    </div>
  )

  return (
    <div className="content-area">
      {/* 页面标题栏 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/account-balance')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>賬戶扣款</h2>
              <Tag color="blue" style={{ fontSize: 11 }}>扣款申請</Tag>
            </div>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical"
        initialValues={{
          groupId: groupIdParam,
          groupName: groupNameParam,
          deductMethod: 'consume',
        }}
      >
        {/* 基础信息 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AccountBookOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基礎信息</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="集團" name="groupId" rules={[{ required: true, message: '請選擇集團' }]}>
              <Input disabled addonAfter={groupNameParam} />
            </Form.Item>
            <Form.Item label="所屬品牌">
              <BrandTag value={brandParam} />
            </Form.Item>
            <Form.Item label="賬戶狀態">
              <Tag color="green">正常</Tag>
            </Form.Item>
          </div>
        </div>

        {/* 扣款方式 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>扣款方式</span>
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>扣款配置</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          {/* 虛擬賬戶餘額展示 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 20 }}>
            <div
              style={{
                padding: '12px', borderRadius: 10, background: '#E6F7FF',
                border: '1px solid #1890ff22', textAlign: 'center',
                transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default',
                position: 'relative', overflow: 'hidden',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div style={{ fontSize: 16, color: '#1890ff', marginBottom: 4 }}><WalletOutlined /></div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                <AnimatedNumber value={sourceVirtualBalance} prefix="MOP " />
              </div>
              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 2 }}>虛擬賬戶餘額</div>
            </div>
          </div>

          <Form.Item label="扣款方式" name="deductMethod" rules={[{ required: true }]}>
            <Radio.Group onChange={(e) => { setDeductMethod(e.target.value); setDeductAmount(0); setSelectedBatch(undefined) }}>
              <Radio value="consume">消費扣款</Radio>
              <Radio value="batch">
                充值批次扣款
                <Popover
                  content={
                    <div style={{ maxWidth: 300, fontSize: 12, lineHeight: '20px', color: '#595959' }}>
                      <div>1. 此扣款只會扣除該筆充值批次的金額。</div>
                      <div>2. 當該筆充值使用的結算方式是「混合支付」「營業額支付」並且商家還尚未結清欠款：</div>
                      <div style={{ paddingLeft: 12 }}>• 本次扣款不會自動核銷商家側對應的欠款單，商家所欠金額將繼續按期履約還款；</div>
                      <div style={{ paddingLeft: 12 }}>• 如您扣款後需要進行商家欠款平賬，請協商財務根據本次扣除金額，按比例計算出可用於抵扣欠款的金額，並在商家欠款賬單核銷。</div>
                    </div>
                  }
                  trigger="hover"
                  placement="top"
                >
                  <QuestionCircleOutlined style={{ color: '#8c8c8c', fontSize: 14, cursor: 'pointer', marginLeft: 6 }} />
                </Popover>
              </Radio>
              <Radio value="account">
                賬戶扣款
                <Popover
                  content={
                    <div style={{ maxWidth: 300, fontSize: 12, lineHeight: '20px', color: '#595959' }}>
                      <div>1. 此扣款將直接扣除該集團賬戶的推廣金，當扣款金額過大，會扣除多筆充值批次的金額。</div>
                      <div>2. 當部分充值批次的結算方式是「混合支付」「營業額支付」並且商家還尚未完成還款：</div>
                      <div style={{ paddingLeft: 12 }}>• 本次扣款不會自動核銷商家側對應的欠款單，商家所欠金額將繼續按期履約還款；</div>
                      <div style={{ paddingLeft: 12 }}>• 如您扣款後需要進行商家欠款平賬，請協商財務根據本次扣除金額，按比例計算出可用於抵扣欠款的金額，並在商家欠款賬單核銷。</div>
                      <div>3. 如您的目標是對某一筆充值進行扣款，請選擇「充值批次扣款」功能。</div>
                    </div>
                  }
                  trigger="hover"
                  placement="top"
                >
                  <QuestionCircleOutlined style={{ color: '#8c8c8c', fontSize: 14, cursor: 'pointer', marginLeft: 6 }} />
                </Popover>
              </Radio>
            </Radio.Group>
          </Form.Item>

          {/* ====== 消費扣款 ====== */}
          {deductMethod === 'consume' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 24px' }}>
              <Form.Item label="業務頻道" name="consumeChannel" rules={[{ required: true, message: '請選擇業務頻道' }]}>
                <Select placeholder="請選擇業務頻道" options={businessChannelOptions} allowClear />
              </Form.Item>
              <Form.Item label="門店名稱" name="consumeStore" rules={[{ required: true, message: '請選擇門店' }]}>
                <Select
                  placeholder={storeOptions.length ? '請選擇門店' : '該集團下暫無同品牌門店'}
                  options={storeOptions}
                  showSearch
                  allowClear
                  onChange={handleStoreChange}
                  filterOption={(input, option) => (option?.label ?? '').includes(input)}
                />
              </Form.Item>
              <Form.Item label="消費類型" name="consumeType" rules={[{ required: true, message: '請選擇消費類型' }]}>
                <Select placeholder="請選擇消費類型" options={consumeTypeOptions} allowClear />
              </Form.Item>
              <Form.Item label="歸屬BD" name="consumeBd">
                <Select
                  placeholder={
                    !form.getFieldValue('consumeStore') ? '請先選擇門店'
                      : bdOptions.length ? '請選擇BD' : '該門店暫未綁定BD'
                  }
                  options={bdOptions}
                  allowClear
                />
              </Form.Item>
              <Form.Item label="扣款金額" required style={{ marginBottom: deductAmount > 0 ? 4 : undefined }}>
                <InputNumber
                  placeholder="請輸入扣款金額"
                  min={0}
                  precision={2}
                  value={deductAmount || undefined}
                  onChange={(v) => setDeductAmount(v || 0)}
                  style={{ width: '100%' }}
                  addonAfter="MOP"
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => Number(v?.replace(/,/g, '') || 0)}
                />
              </Form.Item>
              {deductAmount > 0 && (
                <div style={{ fontSize: 12, color: '#E8720C', fontWeight: 500, paddingTop: 30 }}>
                  {amountToChinese(deductAmount)}
                </div>
              )}
            </div>
          )}

          {/* ====== 充值批次扣款 ====== */}
          {deductMethod === 'batch' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 24px' }}>
                <Form.Item label="批次號" name="batchNo" rules={[{ required: true, message: '請選擇批次號' }]}>
                  <Select
                    placeholder={batchOptions.length ? '請選擇充值批次' : '該集團暫無充值批次'}
                    options={batchOptions.map(b => ({ label: b.label, value: b.value }))}
                    showSearch
                    allowClear
                    onChange={(val) => { setSelectedBatch(val); setDeductAmount(0) }}
                    filterOption={(input, option) => (option?.label ?? '').includes(input)}
                  />
                </Form.Item>
                <Form.Item label="可扣金額">
                  <InputNumber
                    disabled
                    value={currentBatch ? currentBatch.deductible : undefined}
                    style={{ width: '100%' }}
                    addonAfter="MOP"
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  />
                </Form.Item>
                <Form.Item label="結算方式">
                  <Input
                    disabled
                    value={currentBatch ? (settlementMap[currentBatch.settlement] || '--') : undefined}
                    placeholder="選擇批次後展示"
                  />
                </Form.Item>
                <Form.Item label="扣款金額" required style={{ marginBottom: deductAmount > 0 ? 4 : undefined }}>
                  <InputNumber
                    placeholder="請輸入扣款金額"
                    min={0}
                    max={currentBatch ? currentBatch.deductible : undefined}
                    precision={2}
                    value={deductAmount || undefined}
                    onChange={(v) => setDeductAmount(v || 0)}
                    style={{ width: '100%' }}
                    addonAfter="MOP"
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(v) => Number(v?.replace(/,/g, '') || 0)}
                  />
                </Form.Item>
                {deductAmount > 0 && (
                  <div style={{ fontSize: 12, color: '#E8720C', fontWeight: 500, paddingTop: 30 }}>
                    {amountToChinese(deductAmount)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ====== 賬戶扣款 ====== */}
          {deductMethod === 'account' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 24px' }}>
                <Form.Item label="扣款金額" required style={{ marginBottom: deductAmount > 0 ? 4 : undefined }}>
                  <InputNumber
                    placeholder="請輸入扣款金額"
                    min={0}
                    precision={2}
                    value={deductAmount || undefined}
                    onChange={(v) => setDeductAmount(v || 0)}
                    style={{ width: '100%' }}
                    addonAfter="MOP"
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(v) => Number(v?.replace(/,/g, '') || 0)}
                  />
                </Form.Item>
                {deductAmount > 0 && (
                  <div style={{ fontSize: 12, color: '#E8720C', fontWeight: 500, paddingTop: 30 }}>
                    {amountToChinese(deductAmount)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 相关凭证 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f9f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileProtectOutlined style={{ fontSize: 14, color: '#722ed1' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>相關憑證</span>
            <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>憑證上傳</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>支持 jpeg/jpg/png/PDF</span>
          </div>
          <Form.Item label="相關憑證" required style={{ marginBottom: 0 }}>
            {renderFileList()}
            <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
              限 jpeg/jpg/png/PDF 格式，5MB 內，最多可上傳 5 份
            </div>
          </Form.Item>
        </div>

        {/* 备注信息 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EditOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>備註信息</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <Form.Item name="remark" style={{ marginBottom: 0 }}>
            <Input.TextArea
              rows={4}
              maxLength={200}
              showCount
              placeholder="本次扣款相關說明，限制200字！"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>
        </div>
      </Form>

      {/* 底部操作按鈕 */}
      <div className="form-footer">
        <Button onClick={() => navigate('/account-balance')}>取消</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>
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
              {submittedFlowNo && (
                <>流程編號：<span style={{ color: '#E8720C', fontWeight: 500 }}>{submittedFlowNo}</span><br /></>
              )}
              該流程已經進入審批，可到<span style={{ color: '#E8720C', fontWeight: 500 }}>審批中心</span>菜單查看審批進度
            </p>
            <Button
              type="primary"
              size="large"
              onClick={() => navigate('/account-balance')}
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
