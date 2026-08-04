import { useState, useEffect, useRef } from 'react'
import { Form, Input, Select, Button, Upload, message, InputNumber, Tag, type UploadFile } from 'antd'
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
  SwapOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BrandTag from '../../components/BrandTag'
import { fetchFinAccounts, submitTransferApply, withFinanceFallback } from '../../api/finance'
import type { FinAccount, TransferApplyPayload } from '../../api/finance'
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

/** 賬戶狀態文案/顏色映射 */
const accountStatusMap: Record<string, { label: string; color: string }> = {
  normal: { label: '正常', color: 'green' },
  frozen: { label: '凍結', color: 'red' },
  mergeFrozen: { label: '合併凍結', color: 'orange' },
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

export default function TransferAdd() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const groupIdParam = searchParams.get('groupId') || ''
  const groupNameParam = searchParams.get('groupName') || ''
  const brandParam = searchParams.get('brand') || 'mFood'

  const [form] = Form.useForm()
  const [transferAmount, setTransferAmount] = useState<number>(0)
  const [targetGroupId, setTargetGroupId] = useState<string | undefined>(undefined)
  const [certificateFiles, setCertificateFiles] = useState<UploadFile[]>([])
  const [successVisible, setSuccessVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedFlowNo, setSubmittedFlowNo] = useState('')
  const [countdown, setCountdown] = useState(5)

  /** 同品牌推廣金賬戶列表（轉出餘額與轉入集團选项均由此派生） */
  const [accounts, setAccounts] = useState<FinAccount[]>([])

  useEffect(() => {
    fetchFinAccounts({ page: 1, size: 500, brand: brandParam })
      .then(res => setAccounts(res.records || []))
      .catch(() => setAccounts([]))
  }, [brandParam])

  /** 轉出集團賬戶（虛擬餘額/狀態） */
  const sourceAccount = accounts.find(a => a.groupId === groupIdParam)
  const sourceVirtualBalance = Number(sourceAccount?.virtualBalance) || 0

  /** 轉入集團选項：同品牌且排除當前集團，非正常狀態賬戶不可選 */
  const targetGroupOptions = accounts
    .filter(a => a.groupId !== groupIdParam)
    .map(a => ({
      label: `${a.groupId} - ${a.groupName}${a.status !== 'normal' ? `（${accountStatusMap[a.status]?.label || a.status}）` : ''}`,
      value: a.groupId,
      disabled: a.status !== 'normal',
    }))

  /** 已選轉入集團賬戶 */
  const targetAccount = accounts.find(a => a.groupId === targetGroupId)

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
      if (!transferAmount || transferAmount <= 0) {
        message.warning('請填寫轉賬金額')
        return
      }
      if (transferAmount > sourceVirtualBalance) {
        message.warning('轉賬金額不能超過虛擬賬戶餘額')
        return
      }
      if (certificateFiles.length === 0) {
        message.warning('請上傳相關憑證')
        return
      }
      // 提交審批記錄
      const payload: TransferApplyPayload = {
        fromGroupId: groupIdParam,
        fromGroupName: groupNameParam,
        brand: brandParam,
        fromVirtualBalance: sourceVirtualBalance,
        toGroupId: targetGroupId || '',
        toGroupName: targetAccount?.groupName || '',
        transferAmount,
        remark: form.getFieldValue('remark') || '',
      }
      setSubmitting(true)
      const flowNo = await withFinanceFallback(
        () => submitTransferApply(payload),
        () => mockSubmitApproval({
          approvalType: 'transfer',
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
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>賬戶轉賬</h2>
              <Tag color="blue" style={{ fontSize: 11 }}>轉賬申請</Tag>
            </div>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical"
        initialValues={{
          sourceGroupId: groupIdParam,
          sourceGroupName: groupNameParam,
        }}
      >
        {/* 轉出集團信息 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AccountBookOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>轉出集團</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="轉出集團" name="sourceGroupId">
              <Input disabled addonAfter={groupNameParam} />
            </Form.Item>
            <Form.Item label="所屬品牌">
              <BrandTag value={brandParam} />
            </Form.Item>
            <Form.Item label="賬戶狀態">
              <Tag color={accountStatusMap[sourceAccount?.status || 'normal']?.color || 'green'}>
                {accountStatusMap[sourceAccount?.status || 'normal']?.label || '正常'}
              </Tag>
            </Form.Item>
          </div>
        </div>

        {/* 轉入集團信息 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SwapOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>轉入集團</span>
            <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>僅展示與轉出集團所屬品牌一致的集團，請確認轉入集團擁有相同的品牌標識</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="轉入集團" name="targetGroupId" rules={[{ required: true, message: '請選擇轉入集團' }]}>
              <Select
                placeholder={targetGroupOptions.length ? '請選擇轉入集團（同品牌）' : '暫無同品牌可轉入集團'}
                options={targetGroupOptions}
                showSearch
                allowClear
                onChange={(val) => setTargetGroupId(val)}
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
              />
            </Form.Item>
            <Form.Item label="所屬品牌">
              {targetGroupId ? <BrandTag value={brandParam} /> : <span style={{ color: '#BFBFBF', fontSize: 13 }}>選擇集團後展示</span>}
            </Form.Item>
            <Form.Item label="賬戶狀態">
              {targetGroupId
                ? <Tag color={accountStatusMap[targetAccount?.status || 'normal']?.color || 'green'}>
                    {accountStatusMap[targetAccount?.status || 'normal']?.label || '正常'}
                  </Tag>
                : <span style={{ color: '#BFBFBF', fontSize: 13 }}>選擇集團後展示</span>}
            </Form.Item>
          </div>
        </div>

        {/* 转账金额 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>轉賬金額</span>
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>金額配置</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          {/* 轉出集團虛擬賬戶餘額 */}
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
              <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 2 }}>轉出集團 · 虛擬賬戶餘額</div>
            </div>
          </div>

          {/* 转账金额输入 */}
          <Form.Item label="轉賬金額" required style={{ marginBottom: transferAmount > 0 ? 4 : 16 }}>
            <InputNumber
              placeholder="請輸入轉賬金額"
              min={0}
              max={sourceVirtualBalance}
              precision={2}
              value={transferAmount || undefined}
              onChange={(v) => setTransferAmount(v || 0)}
              style={{ width: 360 }}
              addonAfter="MOP"
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v) => Number(v?.replace(/,/g, '') || 0)}
            />
          </Form.Item>
          {transferAmount > 0 && (
            <div style={{ fontSize: 12, color: '#E8720C', fontWeight: 500, marginBottom: 16 }}>
              {amountToChinese(transferAmount)}
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
              placeholder="本次轉賬相關說明，限制200字！"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>
        </div>
      </Form>

      {/* 底部操作按鈕（取消/提交申請） */}
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
