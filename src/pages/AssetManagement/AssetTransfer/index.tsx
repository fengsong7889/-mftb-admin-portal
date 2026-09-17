import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, DatePicker, Descriptions, Form, Input, Modal, Select, Spin, TreeSelect, message } from 'antd'
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
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => { const timer = window.setTimeout(() => setSearch(keyword), 250); return () => window.clearTimeout(timer) }, [keyword])
  const fetchEmployees = useCallback(() => canEdit ? fetchTransferEmployees(search) : Promise.resolve([]), [search, canEdit])
  const employeesState = useTransferData(fetchEmployees)
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const submitLock = useRef(false)
  const requestIdentity = useRef<{ payload: string; key: string }>()
  const selectedId = Form.useWatch('toUserId', form)
  const [selectedEmployee, setSelectedEmployee] = useState<import('../../../api/asset').TransferEmployee>()
  const asset = assetState.data
  const options = optionsState.data
  const deptTree = useMemo(() => buildTransferTree(options?.departments || [], d => d.status !== ENABLED_DEPARTMENT), [options])
  const handleBack = () => navigate(from, { replace: true })
  const busy = submitting || confirming
  const handleSubmit = async () => {
    if (!asset?.transferable || !canEdit || submitLock.current || busy || asset.holdVersion === undefined) return
    let values: FormValues
    try { values = await form.validateFields() } catch { return }
    const employee = selectedEmployee
    if (!employee || employee.id !== values.toUserId) { form.setFields([{ name: 'toUserId', errors: [t('transfer.selectEmployee')] }]); return }
    const department = options?.departments.find(d => d.id === values.toDepartmentId)
    if (employee.id === asset.currentHolderId && department?.name === asset.department) {
      form.setFields([{ name: 'toDepartmentId', errors: [t('transfer.noChange')] }]); return
    }
    const input = { assetId: asset.id, toUserId: employee.id, toDepartmentId: values.toDepartmentId,
      expectedVersion: asset.holdVersion, toUserName: employee.name, toUserEmpId: employee.empId,
      transferDate: values.transferDate.format('YYYY-MM-DD'), reason: values.reason.trim(), remark: values.remark?.trim() }
    const payload = JSON.stringify(input)
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
            <Descriptions.Item label={t('asset.colStatus')}>{t(({ idle: 'asset.statusIdle', in_use: 'asset.statusInUse', in_repair: 'asset.statusInRepair', scrapped: 'asset.statusScrapped' })[asset.status] || 'transfer.unknown')}</Descriptions.Item>
          </Descriptions>
          <AssetParameters asset={asset} />
        </TransferSection>
        <TransferSection title={t('asset.sectionTransferInfo')} icon={<SwapOutlined />} tone="orange">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
            <Form.Item name="toUserId" label={t('asset.colToUser')} rules={[{ required: true, message: t('transfer.selectEmployee') }]}>
              <Select showSearch allowClear filterOption={false} onSearch={setKeyword} loading={employeesState.loading} placeholder={t('transfer.selectEmployee')}
                options={employeesState.data?.map(e => ({ value: e.id, label: formatTransferUser(e.name, e.empId) }))}
                onChange={value => {
                  const employee = employeesState.data?.find(e => e.id === value)
                  setSelectedEmployee(employee)
                  form.setFieldValue('toDepartmentId', options?.departments.some(d => d.id === employee?.departmentId && d.status === ENABLED_DEPARTMENT) ? employee?.departmentId : undefined)
                }} />
            </Form.Item>
            <Form.Item label={t('asset.colUserEmpId')}><Input readOnly value={selectedId === selectedEmployee?.id ? selectedEmployee?.empId : ''} /></Form.Item>
            <Form.Item name="toDepartmentId" label={t('asset.colToDepartment')} rules={[{ required: true, message: t('asset.departmentRequired') }]}>
              <TreeSelect treeData={deptTree} showSearch treeNodeFilterProp="title" allowClear placeholder={t('asset.departmentPh')} disabled={!options || busy || !canEdit || !asset.transferable} />
            </Form.Item>
            <Form.Item name="transferDate" label={t('asset.colTransferDate')} rules={[{ required: true, message: t('asset.transferDateRequired') }]}>
              <DatePicker style={{ width: '100%' }} disabledDate={date => date.isAfter(dayjs(), 'day') || (!!asset.claimDate && date.isBefore(dayjs(asset.claimDate), 'day'))} />
            </Form.Item>
            <Form.Item name="reason" label={t('asset.colTransferReason')} style={{ gridColumn: 'span 2' }} rules={[{ required: true, whitespace: true, message: t('asset.reasonRequired') }, { max: TRANSFER_LIMITS.REASON }]}>
              <Input maxLength={TRANSFER_LIMITS.REASON} showCount placeholder={t('asset.transferReasonPh')} />
            </Form.Item>
            <Form.Item name="remark" label={t('asset.colRemark')} style={{ gridColumn: '1 / -1' }} rules={[{ max: TRANSFER_LIMITS.REMARK }]}>
              <Input.TextArea rows={3} maxLength={TRANSFER_LIMITS.REMARK} showCount placeholder={t('asset.remarkPh')} />
            </Form.Item>
          </div>
        </TransferSection>
      </Form>}
    </Spin>
    <div className="form-footer">
      <Button onClick={handleBack} disabled={busy}>{t('common.cancel')}</Button>
      {canEdit && <Button type="primary" icon={<SaveOutlined />} loading={submitting} disabled={!asset?.transferable || !options || busy} onClick={handleSubmit}>{t('common.save')}</Button>}
    </div>
  </div>
}
