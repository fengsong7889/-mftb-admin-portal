/**
 * 領用登記獨立表單頁（長期配給）
 *
 * 模塊化卡片佈局（參考新增資產界面）：
 *  1. 資產選擇 — 選擇閒置資產，展示所選資產信息
 *  2. 領用信息 — 領用人/部門/日期/原因/操作人
 *  3. 備注信息
 *
 * 業務閉環：選閒置資產 → 填領用人/部門/領用日期 → 提交
 *          （自動置資產為「在用」、holdType=owned，並寫入變更歷史流水）
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Button, Form, Input, Select, DatePicker, Spin, Modal, Radio, TreeSelect,
  Alert, Row, Col,
} from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, DatabaseOutlined,
  UserOutlined, AppstoreOutlined,
} from '@ant-design/icons'
import { Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import type { DepartmentItem } from '../../../api/department'
import { AssetSummary } from '../../../components/AssetParameters'
import { buildDeptTree, type ClaimAssetOption, type ClaimEmployee, type ClaimPage, type ClaimQuery, type ClaimRegistration } from './claimViewTypes'

const { TextArea } = Input

interface FormValues {
  assetId: number
  employeeId: number
  claimDate: Dayjs
  claimReason?: string
  mode: 'standard' | 'proxy'
  proxyReason?: string
  remark?: string
}

interface Props {
  onBack: () => void
  employeeId?: number
  assetId?: number
  initialEmployee?: ClaimEmployee
  initialAsset?: ClaimAssetOption
  assets?: ClaimPage<ClaimAssetOption>
  employees?: ClaimPage<ClaimEmployee>
  departments?: DepartmentItem[]
  operatorName?: string
  operatorEmpNo?: string
  canProxy?: boolean
  loading?: boolean
  error?: string
  onAssetQuery?: (query: ClaimQuery) => void
  onEmployeeQuery?: (query: ClaimQuery) => void
  onSubmit?: (values: ClaimRegistration) => Promise<void>
}
const EMPTY_DEPARTMENTS: DepartmentItem[] = []

/* ==================== 卡片樣式常量 ==================== */
const CARD_STYLE: React.CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

export default function ClaimForm({ onBack, employeeId, assetId, initialEmployee, initialAsset, assets, employees, departments = EMPTY_DEPARTMENTS, operatorName, operatorEmpNo, canProxy = false, loading = false, error, onAssetQuery, onEmployeeQuery, onSubmit }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const [modal, contextHolder] = Modal.useModal()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string>()
  const busy = useRef(false)
  const mounted = useRef(true)
  const [selected, setSelected] = useState(initialAsset)
  const [employee, setEmployee] = useState(initialEmployee)
  const [claimAccessories, setClaimAccessories] = useState<{ name: string; qty: number }[]>([])
  const [assetQuery, setAssetQuery] = useState<ClaimQuery>({ page: 1, size: 200 })
  const [employeeQuery, setEmployeeQuery] = useState<ClaimQuery>({ page: 1, size: 10 })
  const mode = Form.useWatch('mode', form) ?? 'standard'
  const deptTree = useMemo(() => buildDeptTree(departments), [departments])
  const assetOptions = [...(assets?.records ?? [])]
  if (selected && !assetOptions.some((item) => item.id === selected.id)) assetOptions.unshift(selected)
  const employeeOptions = [...(employees?.records ?? [])]
  if (employee && !employeeOptions.some((item) => item.employeeId === employee.employeeId)) employeeOptions.unshift(employee)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { onAssetQuery?.(assetQuery) }, [assetQuery, onAssetQuery])
  useEffect(() => { onEmployeeQuery?.(employeeQuery) }, [employeeQuery, onEmployeeQuery])
  useEffect(() => {
    if (initialAsset) { setSelected(initialAsset); form.setFieldValue('assetId', initialAsset.id) }
  }, [initialAsset, form])
  useEffect(() => {
    if (initialEmployee) { setEmployee(initialEmployee); form.setFieldValue('employeeId', initialEmployee.employeeId) }
  }, [initialEmployee, form])
  // 當所選資產變化時，同步配件清單（從資產複製）
  useEffect(() => {
    if (selected?.accessories?.length) {
      setClaimAccessories(selected.accessories.map(a => ({ name: a.name, qty: a.qty })))
    } else {
      setClaimAccessories([])
    }
  }, [selected?.id, selected?.accessories])

  const handleSubmit = async () => {
    if (!onSubmit || busy.current) return
    busy.current = true
    setSubmitError(undefined)
    try {
      const v = await form.validateFields()
      if (!selected || !employee || (v.mode === 'proxy' && !canProxy)) {
        setSubmitError('請等待資產和員工信息加載完成，並確認當前操作權限。')
        return
      }
      const payload: ClaimRegistration = {
        assetId: v.assetId, employeeId: v.employeeId, claimDate: v.claimDate.format('YYYY-MM-DD'),
        claimReason: v.claimReason?.trim(), remark: v.remark?.trim(), mode: v.mode,
        proxyReason: v.mode === 'proxy' ? v.proxyReason?.trim() : undefined,
        // 始終攜帶快照（含空數組）：NULL 僅留給歷史舊數據，刪光配件時需存 "[]" 以免詳情頁回退展示資產配件
        accessories: JSON.stringify(claimAccessories),
      }
      const confirmed = await modal.confirm({
        title: v.mode === 'proxy' ? '確認代辦領用？' : '確認登記並發送待簽？',
        className: 'custom-confirm-modal',
        icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
        content: <div className="confirm-info-card">
          <div className="confirm-info-row"><span>領用人：</span><b>{employee.empName}（{employee.empNo}）</b></div>
          <div className="confirm-info-row"><span>資產：</span><b>{selected.assetNo} / {selected.assetName}</b></div>
          <div className="confirm-info-row"><span>領用日期：</span><b>{payload.claimDate}</b></div>
          <div className="confirm-info-row"><span>處理結果：</span><b>{v.mode === 'proxy' ? '立即在用，保留代辦未簽標識' : '預留資產，等待員工本人簽署'}</b></div>
          {v.mode === 'proxy' && <div className="confirm-info-row"><span>代辦原因：</span><b>{payload.proxyReason}</b></div>}
        </div>,
        okText: t('common.confirm'), cancelText: t('common.cancel'),
      })
      if (!confirmed || !mounted.current) return
      setSubmitting(true)
      try {
        await onSubmit(payload)
        if (mounted.current) onBack()
      } catch {
        if (mounted.current) setSubmitError('登记未完成，填写内容已保留，请核对错误后重试。')
      }
    } catch {
      // 表单自行展示校验错误；统一请求层负责 API 错误提示。
    } finally {
      busy.current = false
      if (mounted.current) setSubmitting(false)
    }
  }

  /* ==================== 卡片標題通用渲染 ==================== */
  const renderCardTitle = (icon: React.ReactNode, iconBg: string, title: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )

  return (
    <div>
      {contextHolder}
      {/* ====== 頂部標題欄（橙色漸變頂條） ====== */}
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
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1890ff' }}>{t('asset.claimTitle')}</h2>
        </div>
      </div>

      {(error || submitError) && <Alert type="error" showIcon className="claim-notice" message={error || submitError} />}
      <Spin spinning={loading}>
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{ claimDate: dayjs(), mode: 'standard', assetId: initialAsset?.id ?? assetId, employeeId: initialEmployee?.employeeId ?? employeeId }}
          disabled={submitting}
          onFinish={handleSubmit}
        >

          {/* ====== 模塊1：資產選擇 ====== */}
          <div style={CARD_STYLE}>
            {renderCardTitle(
              <DatabaseOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
              '#e6f7ff',
              '資產選擇',
            )}

            <Alert type="info" showIcon className="claim-notice" message="仅可选择未被预留的闲置资产；登记后须本人签署才完成领用。" />
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  label={t('asset.colAssetNo')} name="assetId"
                  rules={[{ required: true, message: t('asset.assetRequired') }]}
                >
                  <Select
                    placeholder={t('asset.searchAssetPh')}
                    showSearch
                    filterOption={false}
                    disabled={!onAssetQuery || submitting}
                    onSearch={(keyword) => setAssetQuery({ ...assetQuery, keyword: keyword.trim() || undefined, page: 1 })}
                    onChange={(id: number) => setSelected(assetOptions.find((item) => item.id === id))}
                    options={assetOptions.map((a) => ({
                      label: `${a.assetNo} / ${a.assetName}`, value: a.id,
                    }))}
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* 所選資產信息展示 */}
            {selected && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 12 }}>資產信息</div>
                <AssetSummary asset={selected} hideAccessories />
                {/* 配件清单（可删除） */}
                {claimAccessories.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <AppstoreOutlined style={{ fontSize: 13, color: '#FA8C16' }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>配件清单</span>
                      <Tag color="orange" style={{ fontSize: 11 }}>{claimAccessories.length} 项</Tag>
                      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {claimAccessories.map((acc, idx) => (
                        <Tag
                          key={idx}
                          color="orange"
                          closable
                          onClose={(e) => {
                            e.preventDefault()
                            setClaimAccessories(prev => prev.filter((_, i) => i !== idx))
                          }}
                          style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4 }}
                        >
                          {acc.name} × {acc.qty}
                        </Tag>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 6 }}>点击 × 可移除不需要的配件，归还时仅展示领用的配件。</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ====== 模塊2：領用信息 ====== */}
          <div style={CARD_STYLE}>
            {renderCardTitle(
              <UserOutlined style={{ fontSize: 14, color: '#E8720C' }} />,
              '#fff7e6',
              '領用信息',
            )}

            <Row gutter={16}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t('asset.colClaimant')} name="employeeId" rules={[{ required: true, message: t('asset.claimantRequired') }]}>
                  <Select showSearch filterOption={false} placeholder="搜索姓名 / 工号" disabled={!onEmployeeQuery || submitting}
                    onSearch={(keyword) => setEmployeeQuery({ ...employeeQuery, keyword: keyword.trim() || undefined, page: 1 })}
                    onChange={(id: number) => setEmployee(employeeOptions.find((item) => item.employeeId === id))}
                    options={employeeOptions.map((item) => ({ value: item.employeeId, label: `${item.empName}（${item.empNo}）` }))} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t('asset.colDepartment')}>
                  <TreeSelect disabled treeData={deptTree} value={employee?.departmentId} placeholder={employee?.department || '由员工组织信息带出'} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t('asset.colClaimDate')} name="claimDate" rules={[
                  { required: true, message: t('asset.claimDateRequired') },
                  { validator: (_, date: Dayjs) => !date || !date.isAfter(dayjs(), 'day') ? Promise.resolve() : Promise.reject(new Error('领用日期不能在未来')) },
                ]}>
                  <DatePicker style={{ width: '100%' }} disabledDate={(date) => date.isAfter(dayjs(), 'day')} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label={t('asset.colOperator')}>
                  <Input disabled value={operatorEmpNo ? `${operatorName}（${operatorEmpNo}）` : operatorName ?? ''} placeholder="由服务端登录身份确认" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="领用用途" name="claimReason"><Input maxLength={200} placeholder="请输入领用用途" allowClear /></Form.Item>
              </Col>
            </Row>
            <Form.Item label="办理方式" name="mode" style={{ marginTop: 20 }}>
              <Radio.Group>
                <Radio value="standard">登记并发送待签</Radio>
                {canProxy && <Radio value="proxy">管理员代办领用</Radio>}
              </Radio.Group>
            </Form.Item>
            {mode === 'proxy' && <>
              <Alert type="warning" showIcon className="claim-notice" message="代办将立即使资产在用，但不代表员工本人已签署；必须填写原因并由员工补签。" />
              <Form.Item label="代办原因" name="proxyReason" rules={[{ required: true, whitespace: true, message: '请填写代办原因' }]}>
                <TextArea rows={3} maxLength={500} showCount />
              </Form.Item>
            </>}
          </div>

          {/* ====== 模塊3：備注信息 ====== */}
          <div style={CARD_STYLE}>
            {renderCardTitle(
              <span style={{ fontSize: 14, color: '#722ED1' }}></span>,
              '#f9f0ff',
              '備注信息',
            )}

            <Form.Item name="remark" style={{ marginBottom: 0 }}>
              <TextArea rows={4} maxLength={500} showCount placeholder="可填写备注信息" style={{ borderRadius: 8 }} />
            </Form.Item>
          </div>

        </Form>
      </Spin>

      {/* ====== 底部操作欄（取消+保存） ====== */}
      <div className="form-footer">
        <Button onClick={onBack} disabled={submitting}>{t('common.cancel')}</Button>
        <Button
          type="primary" icon={<SaveOutlined />} loading={submitting}
          disabled={!onSubmit || loading || !!error}
          onClick={handleSubmit}
        >
          {mode === 'proxy' ? '代办领用' : '登记并发送待签'}
        </Button>
      </div>
    </div>
  )
}
