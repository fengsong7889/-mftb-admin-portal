/**
 * 借用登記表單 — 接通真實後端 API
 *
 * UX 改造：資產與借用人均使用可搜索 Select 下拉（復用領用表單模式），
 * 替代原始 InputNumber 手輸 ID；部門由所選員工自動帶出。
 */
import { useState, useEffect, useRef } from 'react'
import { Alert, Button, DatePicker, Form, Input, Select, Spin, Pagination, Modal, message } from 'antd'
import { SaveOutlined, DatabaseOutlined, UserOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { ReturnHeader } from '../AssetReturn/ReturnLayout'
import { AssetSummary } from '../../../components/AssetParameters'
import type { BorrowRegisterDTO } from '../../../api/eamBorrow'
import type { ClaimAssetOption, ClaimEmployee, ClaimPage, ClaimQuery } from '../AssetClaim/claimViewTypes'

interface Values { assetId: number; holderId: number; department: string; startDate: Dayjs; dueDate: Dayjs; purpose: string }

interface Props {
  operatorName?: string
  canEdit?: boolean
  loading?: boolean
  assets?: ClaimPage<ClaimAssetOption>
  employees?: ClaimPage<ClaimEmployee>
  onAssetQuery?: (query: ClaimQuery) => void
  onEmployeeQuery?: (query: ClaimQuery) => void
  onSubmit: (dto: BorrowRegisterDTO) => void
  onBack: () => void
}

const CARD_STYLE: React.CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

const renderCardTitle = (icon: React.ReactNode, iconBg: string, title: string) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
    <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
    <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
    <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
  </div>
)

export default function BorrowForm({
  operatorName: _operatorName, canEdit = true, loading = false,
  assets, employees, onAssetQuery, onEmployeeQuery,
  onSubmit, onBack,
}: Props) {
  const [form] = Form.useForm<Values>()
  const [modal, contextHolder] = Modal.useModal()
  const [submitting, setSubmitting] = useState(false)
  const busy = useRef(false)
  const mounted = useRef(true)

  const [selected, setSelected] = useState<ClaimAssetOption>()
  const [employee, setEmployee] = useState<ClaimEmployee>()
  const [assetQuery, setAssetQuery] = useState<ClaimQuery>({ page: 1, size: 10 })
  const [employeeQuery, setEmployeeQuery] = useState<ClaimQuery>({ page: 1, size: 10 })

  const assetOptions = [...(assets?.records ?? [])]
  if (selected && !assetOptions.some(a => a.id === selected.id)) assetOptions.unshift(selected)
  const employeeOptions = [...(employees?.records ?? [])]
  if (employee && !employeeOptions.some(e => e.employeeId === employee.employeeId)) employeeOptions.unshift(employee)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { onAssetQuery?.(assetQuery) }, [assetQuery, onAssetQuery])
  useEffect(() => { onEmployeeQuery?.(employeeQuery) }, [employeeQuery, onEmployeeQuery])

  const handleSubmit = async () => {
    if (busy.current) return
    busy.current = true
    try {
      const v = await form.validateFields()
      if (!selected || !employee) {
        message.warning('請等待資產和員工信息加載完成')
        return
      }
      const dto: BorrowRegisterDTO = {
        assetId: v.assetId,
        holderId: v.holderId,
        department: v.department,
        startDate: v.startDate.format('YYYY-MM-DD'),
        dueDate: v.dueDate.format('YYYY-MM-DD'),
        purpose: v.purpose?.trim(),
      }
      const confirmed = await modal.confirm({
        title: '確認借用登記？',
        className: 'custom-confirm-modal',
        icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
        content: (
          <div className="confirm-info-card">
            <div className="confirm-info-row"><span>資產：</span><b>{selected.assetNo} / {selected.assetName}</b></div>
            <div className="confirm-info-row"><span>借用人：</span><b>{employee.empName}（{employee.empNo}）</b></div>
            <div className="confirm-info-row"><span>借用部門：</span><b>{dto.department}</b></div>
            <div className="confirm-info-row"><span>借用期限：</span><b>{dto.startDate} ~ {dto.dueDate}</b></div>
            <div className="confirm-info-row"><span>借用用途：</span><b>{dto.purpose || '—'}</b></div>
          </div>
        ),
        okText: '確認借用',
        cancelText: '取消',
      })
      if (!confirmed || !mounted.current) return
      setSubmitting(true)
      try {
        await onSubmit(dto)
      } catch {
        /* API 層已處理錯誤提示 */
      }
    } catch {
      /* 表單校驗失敗 */
    } finally {
      busy.current = false
      if (mounted.current) setSubmitting(false)
    }
  }

  if (!canEdit) {
    return <Alert type="warning" showIcon message="無借用辦理權限" />
  }

  return <>
    {contextHolder}
    <ReturnHeader title="借用登記" onBack={onBack} />
    <Spin spinning={loading || submitting}>
      <Form<Values> form={form} layout="vertical" disabled={submitting}
        initialValues={{ startDate: dayjs(), dueDate: dayjs().add(7, 'day') }}>

        {/* ====== 模塊1：資產選擇 ====== */}
        <div style={CARD_STYLE}>
          {renderCardTitle(<DatabaseOutlined style={{ fontSize: 14, color: '#1890ff' }} />, '#e6f7ff', '資產選擇')}
          <Alert type="info" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
            message="僅可選擇閒置狀態的資產；借用後資產將標記為使用中。" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
            <div>
              <Form.Item name="assetId" label="可借用資產" rules={[{ required: true, message: '請選擇可借用的資產' }]}>
                <Select placeholder="搜索資產編號 / 名稱" showSearch filterOption={false}
                  disabled={!onAssetQuery || submitting}
                  onSearch={(keyword) => setAssetQuery({ ...assetQuery, keyword: keyword.trim() || undefined, page: 1 })}
                  onChange={(id: number) => setSelected(assetOptions.find(a => a.id === id))}
                  options={assetOptions.map(a => ({ label: `${a.assetNo} / ${a.assetName}`, value: a.id }))} />
              </Form.Item>
              <Pagination className="claim-selection-pagination" size="small"
                current={assetQuery.page} pageSize={assetQuery.size} total={assets?.total ?? 0}
                showSizeChanger={false} hideOnSinglePage
                onChange={(page) => setAssetQuery({ ...assetQuery, page })} />
            </div>
          </div>
          {selected && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 12 }}>資產信息</div>
              <AssetSummary asset={selected} />
            </div>
          )}
        </div>

        {/* ====== 模塊2：借用人與期限 ====== */}
        <div style={CARD_STYLE}>
          {renderCardTitle(<UserOutlined style={{ fontSize: 14, color: '#E8720C' }} />, '#fff7e6', '借用人信息')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div>
              <Form.Item name="holderId" label="借用人" rules={[{ required: true, message: '請選擇借用人' }]}>
                <Select placeholder="搜索姓名 / 工號" showSearch filterOption={false}
                  disabled={!onEmployeeQuery || submitting}
                  onSearch={(keyword) => setEmployeeQuery({ ...employeeQuery, keyword: keyword.trim() || undefined, page: 1 })}
                  onChange={(id: number) => {
                    const emp = employeeOptions.find(e => e.employeeId === id)
                    setEmployee(emp)
                    if (emp) form.setFieldValue('department', emp.department)
                  }}
                  options={employeeOptions.map(e => ({ value: e.employeeId, label: `${e.empName}（${e.empNo}）` }))} />
              </Form.Item>
            </div>
            <Form.Item name="department" label="借用部門" rules={[{ required: true, message: '請選擇借用人後自動帶出部門' }]}>
              <Input placeholder="由借用人組織信息帶出" readOnly />
            </Form.Item>
            <Form.Item name="purpose" label="借用用途" rules={[{ required: true, whitespace: true, message: '請填寫借用用途' }]}>
              <Input maxLength={100} placeholder="請輸入借用用途" />
            </Form.Item>
          </div>
        </div>

        {/* ====== 模塊3：借用期限 ====== */}
        <div style={CARD_STYLE}>
          {renderCardTitle(<SaveOutlined style={{ fontSize: 14, color: '#722ED1' }} />, '#f9f0ff', '借用期限')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <Form.Item name="startDate" label="借出日期" rules={[{ required: true, message: '請選擇借出日期' }]}>
              <DatePicker disabledDate={d => d.isAfter(dayjs(), 'day')} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="dueDate" label="到期日期" rules={[{ required: true, message: '請選擇到期日期' }, { validator: (_, d: Dayjs) => {
              const start = form.getFieldValue('startDate')
              return d && start && d.isAfter(start, 'day') ? Promise.resolve() : Promise.reject(new Error('到期日期須晚於借出日期'))
            } }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </div>

      </Form>
    </Spin>
    <div className="form-footer">
      <Button onClick={onBack} disabled={submitting}>取消</Button>
      <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>確認借用</Button>
    </div>
  </>
}
