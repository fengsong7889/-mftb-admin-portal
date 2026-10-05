/**
 * 资产调拨登记页（真实业务，非预览）：把一件资产从当前持有人/部门转给另一个。
 * 入口带 ?id=<资产id>&from=<回跳路径>，from 只影响返回导航，已由
 * {@link resolveTransferFrom} 限制为白名单内的本站路径。
 *
 * 并发与幂等靠两个字段配合，缺一个就会出问题：
 * - expectedVersion：提交时携带页面加载到的持仓版本，后端比对不上则拒绝，
 *   避免两人同时调拨同一资产时后者静默覆盖前者。
 * - requestKey：以表单 payload 为键缓存在 requestIdentity 里。payload 未变时
 *   重试（包丢失后重新点击）沿用同一 key，后端可识别为同一请求并去重；一旦用户
 *   改了任何字段就必须换新 key，否则会把新意图误判成旧请求的重放。
 * 前端隐藏按钮与 canEdit 都不构成安全边界，调拨合法性以后端校验为准。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, DatePicker, Descriptions, Form, Input, Modal, Select, Spin, TreeSelect, message, Row, Col } from 'antd'
import { AppstoreOutlined, SaveOutlined, SwapOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import { fetchTransferAsset, fetchTransferEmployees, fetchTransferOptions, transferAsset, type TransferRegistration } from '../../../api/asset'
import { useAuth } from '../../../contexts/AuthContext'
import AssetParameters from '../../../components/AssetParameters'
import { TransferError, TransferPageHeader, TransferSection } from './TransferLayout'
import { useTransferData } from './useTransferData'
import { buildTransferTree, ENABLED_DEPARTMENT, formatTransferUser, positiveId, resolveTransferFrom, TRANSFER_LIMITS, TRANSFER_MENU } from './transferUtils'

interface FormValues { toUserId: number; toDepartmentId: number; transferDate: Dayjs; reason: string; remark?: string }

export default function AssetTransfer() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [params] = useSearchParams()
  const id = positiveId(params.get('id'))
  const from = resolveTransferFrom(params.get('from'))
  const canEdit = hasPermission(`${TRANSFER_MENU}:edit`)
  const [form] = Form.useForm<FormValues>()
  const fetchAsset = useCallback(() => id ? fetchTransferAsset(id) : Promise.reject(new Error(t('transfer.invalidId'))), [id, t])
  const assetState = useTransferData(fetchAsset)
  const optionsState = useTransferData(fetchTransferOptions)
  // keyword 即时回显、search 滞后 250ms 才参与请求，避免每敲一个字符就拉一次员工列表
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => { const timer = window.setTimeout(() => setSearch(keyword), 250); return () => window.clearTimeout(timer) }, [keyword])
  // 无调拨编辑权限时直接给空数组，不发请求：避免非授权账号拉取全量员工名单
  const fetchEmployees = useCallback(() => canEdit ? fetchTransferEmployees(search) : Promise.resolve([]), [search, canEdit])
  const employeesState = useTransferData(fetchEmployees)
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // antd Modal.confirm 的 onOk 可被反复触发，submitLock 保证一次确认窗口内只会发出一次 POST
  const submitLock = useRef(false)
  // 同一份 payload 复用幂等键；payload 变化则换新键（详见文件头说明）
  const requestIdentity = useRef<{ payload: string; key: string }>()
  const selectedId = Form.useWatch('toUserId', form)
  const [selectedEmployee, setSelectedEmployee] = useState<import('../../../api/asset').TransferEmployee>()
  const asset = assetState.data
  const options = optionsState.data
  // 已停用的部门仍展示在树上但置灰，防止历史数据找不到入口，同时阻止新调拨落入停用部门
  const deptTree = useMemo(() => buildTransferTree(options?.departments || [], d => d.status !== ENABLED_DEPARTMENT), [options])
  const handleBack = () => navigate(from, { replace: true })
  const busy = submitting || confirming
  const handleSubmit = async () => {
    if (!asset?.transferable || !canEdit || submitLock.current || busy || asset.holdVersion === undefined) return
    let values: FormValues
    try { values = await form.validateFields() } catch { return }
    const employee = selectedEmployee
    // selectedEmployee 是本地快照，可能与表单值不一致（搜索结果刷新、换了人），必须再对一次 id
    if (!employee || employee.id !== values.toUserId) { form.setFields([{ name: 'toUserId', errors: [t('transfer.selectEmployee')] }]); return }
    const department = options?.departments.find(d => d.id === values.toDepartmentId)
    // 同人同部门提交不会报错但会产生一张无意义的调拨单，在前端就拦住
    if (employee.id === asset.currentHolderId && department?.name === asset.department) {
      form.setFields([{ name: 'toDepartmentId', errors: [t('transfer.noChange')] }]); return
    }
    const input = { assetId: asset.id, toUserId: employee.id, toDepartmentId: values.toDepartmentId,
      expectedVersion: asset.holdVersion, toUserName: employee.name, toUserEmpId: employee.empId,
      transferDate: values.transferDate.format('YYYY-MM-DD'), reason: values.reason.trim(), remark: values.remark?.trim() }
    const payload = JSON.stringify(input)
    // 只在内容真的变了时换新键；payload 相同时保留旧键，使重试可被后端识别为同一笔
    if (requestIdentity.current?.payload !== payload) requestIdentity.current = { payload, key: crypto.randomUUID() }
    const registration: TransferRegistration = { ...input, requestKey: requestIdentity.current.key }
    setConfirming(true)
    Modal.confirm({
      title: t('transfer.confirmTitle'), className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: <div className="confirm-info-card">
        {[[t('asset.colAssetNo'), asset.assetNo], [t('asset.colFromUser'), asset.userName], [t('asset.colToUser'), formatTransferUser(employee.name, employee.empId)],
          [t('asset.colToDepartment'), department?.name], [t('asset.colTransferDate'), input.transferDate], [t('asset.colTransferReason'), input.reason]].map(([label, value]) =>
          <div className="confirm-info-row" key={label}><span>{label}：</span><b>{value || '—'}</b></div>)}
        <p>{t('transfer.immediateTip')}</p>
      </div>,
      okText: t('common.confirm'), cancelText: t('common.cancel'),
      afterClose: () => setConfirming(false),
      onOk: async () => {
        if (submitLock.current) return
        submitLock.current = true
        setSubmitting(true)
        try {
          await transferAsset(registration)
          message.success(t('asset.transferSuccess'))
          handleBack()
        } finally { submitLock.current = false; setSubmitting(false) }
      },
    })
  }

  return <div className="content-area">
    <TransferPageHeader title={t('asset.transferTitle')} onBack={handleBack} disabled={busy} />
    {!canEdit && <Alert type="warning" showIcon message={t('guard.403Sub')} style={{ marginBottom: 16 }} />}
    <TransferError error={assetState.error} retry={assetState.refresh} />
    <TransferError error={optionsState.error} retry={optionsState.refresh} />
    <TransferError error={employeesState.error} retry={employeesState.refresh} />
    <Spin spinning={assetState.loading || optionsState.loading}>
      {asset && <Form<FormValues> form={form} layout="vertical" initialValues={{ transferDate: dayjs() }} disabled={!canEdit || busy || !asset.transferable}>
        <TransferSection title={t('asset.sectionAssetInfo')} icon={<AppstoreOutlined />}>
          <Alert type={asset.transferable ? 'info' : 'warning'} showIcon message={asset.transferBlockedReason || t('transfer.immediateTip')} style={{ marginBottom: 16 }} />
          <Descriptions column={3}>
            <Descriptions.Item label={t('asset.colAssetNo')}>{asset.assetNo}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colAssetName')}>{asset.assetName}</Descriptions.Item>
            <Descriptions.Item label={t('transfer.category')}>{asset.assetType || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('transfer.brand')}>{asset.brand || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colFromUser')}>{asset.userName || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colFromDept')}>{asset.department || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('transfer.claimDate')}>{asset.claimDate || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colStatus')}>{t(({ idle: 'asset.statusIdle', in_use: 'asset.statusInUse', in_repair: 'asset.statusInRepair', scrapped: 'asset.statusScrapped', lost: 'asset.statusLost', pending_inspection: 'asset.statusPendingInspection', pending_disposal: 'asset.statusPendingDisposal', written_off: 'asset.statusWrittenOff' })[asset.status] || 'transfer.unknown')}</Descriptions.Item>
          </Descriptions>
          <AssetParameters asset={asset} />
        </TransferSection>
        <TransferSection title={t('asset.sectionTransferInfo')} icon={<SwapOutlined />} tone="orange">
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="toUserId" label={t('asset.colToUser')} rules={[{ required: true, message: t('transfer.selectEmployee') }]}>
                {/* 选中人后自动带出其部门，但仅当该部门仍启用；否则置空强制操作人显式选择 */}
                <Select showSearch allowClear filterOption={false} onSearch={setKeyword} loading={employeesState.loading} placeholder={t('transfer.selectEmployee')}
                  options={employeesState.data?.map(e => ({ value: e.id, label: formatTransferUser(e.name, e.empId) }))}
                  onChange={value => {
                    const employee = employeesState.data?.find(e => e.id === value)
                    setSelectedEmployee(employee)
                    form.setFieldValue('toDepartmentId', options?.departments.some(d => d.id === employee?.departmentId && d.status === ENABLED_DEPARTMENT) ? employee?.departmentId : undefined)
                  }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label={t('asset.colUserEmpId')}><Input readOnly value={selectedId === selectedEmployee?.id ? selectedEmployee?.empId : ''} /></Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="toDepartmentId" label={t('asset.colToDepartment')} rules={[{ required: true, message: t('asset.departmentRequired') }]}>
                <TreeSelect treeData={deptTree} showSearch treeNodeFilterProp="title" allowClear placeholder={t('asset.departmentPh')} disabled={!options || busy || !canEdit || !asset.transferable} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="transferDate" label={t('asset.colTransferDate')} rules={[{ required: true, message: t('asset.transferDateRequired') }]}>
                <DatePicker style={{ width: '100%' }} disabledDate={date => date.isAfter(dayjs(), 'day') || (!!asset.claimDate && date.isBefore(dayjs(asset.claimDate), 'day'))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={16}>
              <Form.Item name="reason" label={t('asset.colTransferReason')} rules={[{ required: true, whitespace: true, message: t('asset.reasonRequired') }, { max: TRANSFER_LIMITS.REASON }]}>
                <Input maxLength={TRANSFER_LIMITS.REASON} showCount placeholder={t('asset.transferReasonPh')} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="remark" label={t('asset.colRemark')} rules={[{ max: TRANSFER_LIMITS.REMARK }]}>
                <Input.TextArea rows={3} maxLength={TRANSFER_LIMITS.REMARK} showCount placeholder={t('asset.remarkPh')} />
              </Form.Item>
            </Col>
          </Row>
        </TransferSection>
      </Form>}
    </Spin>
    <div className="form-footer">
      <Button onClick={handleBack} disabled={busy}>{t('common.cancel')}</Button>
      {canEdit && <Button type="primary" icon={<SaveOutlined />} loading={submitting} disabled={!asset?.transferable || !options || busy} onClick={handleSubmit}>{t('common.save')}</Button>}
    </div>
  </div>
}
