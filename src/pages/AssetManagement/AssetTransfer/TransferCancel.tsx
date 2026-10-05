/**
 * 资产调拨单撤销页（真实业务）：对尚未生效的调拨记录发起作废，并登记撤销理由。
 *
 * 可撤销与否则完全由后端决定（record.cancellable / record.cancelBlockedReason），
 * 前端不自行推断状态；不可撤销时表单整体置灰并把后端理由直接展示给用户。
 * 无 :edit 权限的人仍可打开本页看详情，但看不到撤销按钮（前端隐藏不构成安全边界，
 * 真正的拦截在后端）。
 */
import { useCallback, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Descriptions, Form, Input, Modal, Spin, message } from 'antd'
import { StopOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { cancelTransfer, fetchTransferDetail } from '../../../api/asset'
import { useAuth } from '../../../contexts/AuthContext'
import AssetParameters from '../../../components/AssetParameters'
import { TransferError, TransferPageHeader, TransferSection } from './TransferLayout'
import { useTransferData } from './useTransferData'
import { positiveId, resolveTransferFrom, TRANSFER_LIMITS, TRANSFER_MENU } from './transferUtils'

export default function TransferCancel() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { hasPermission } = useAuth()
  const id = positiveId(params.get('id'))
  const from = resolveTransferFrom(params.get('from'), undefined, '/asset-transfer/cancel')
  const fetcher = useCallback(() => id ? fetchTransferDetail(id) : Promise.reject(new Error(t('transfer.invalidId'))), [id, t])
  const { data: record, loading, error, refresh } = useTransferData(fetcher)
  const [form] = Form.useForm<{ reason: string }>()
  const [busy, setBusy] = useState(false)
  // Modal.confirm 关闭后（afterClose）才释锁，保证确认框停留期间重复点击不会发出第二笔请求
  const locked = useRef(false)
  const canEdit = hasPermission(`${TRANSFER_MENU}:edit`)
  const handleBack = () => navigate(from, { replace: true })
  const handleSubmit = async () => {
    // 三个条件缺一不可：后端说可撤销、当前用户有编辑权、无进行中的提交
    if (!record?.cancellable || !canEdit || locked.current) return
    locked.current = true
    let values: { reason: string }
    try { values = await form.validateFields() } catch { locked.current = false; return }
    setBusy(true)
    Modal.confirm({
      title: t('transfer.cancelConfirm'), className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: <div className="confirm-info-card">
        <div className="confirm-info-row"><span>{t('asset.colTransferNo')}：</span><b>{record.transferNo}</b></div>
        <div className="confirm-info-row"><span>{t('transfer.cancelReason')}：</span><b>{values.reason.trim()}</b></div>
        <p>{t('transfer.cancelTip')}</p>
      </div>,
      okText: t('transfer.cancelTransfer'), cancelText: t('common.cancel'), okButtonProps: { danger: true },
      afterClose: () => { locked.current = false; setBusy(false) },
      onOk: async () => {
        await cancelTransfer(record.id, values.reason.trim())
        message.success(t('asset.transferCancelled'))
        handleBack()
      },
    })
  }
  return <div className="content-area">
    <TransferPageHeader title={t('transfer.cancelTransfer')} onBack={handleBack} disabled={busy} />
    <TransferError error={error} retry={refresh} />
    {!canEdit && <Alert type="warning" message={t('guard.403Sub')} />}
    <Spin spinning={loading}>
      {record && <Form form={form} layout="vertical" disabled={!canEdit || !record.cancellable || busy}>
        {/* 不可撤销时把后端给的 blockedReason 顶在卡片开头；无理由则给默认提示 */}
        <TransferSection title={t('asset.sectionTransferInfo')} icon={<StopOutlined />} tone="orange">
          <Alert type="warning" showIcon message={record.cancelBlockedReason || t('transfer.cancelTip')} style={{ marginBottom: 16 }} />
          <Descriptions column={3}>
            <Descriptions.Item label={t('asset.colTransferNo')}>{record.transferNo}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colAssetNo')}>{record.assetNo}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colAssetName')}>{record.assetName}</Descriptions.Item>
          </Descriptions>
          <AssetParameters asset={record} current />
          <Form.Item name="reason" label={t('transfer.cancelReason')} rules={[{ required: true, whitespace: true, message: t('transfer.cancelReasonRequired') }, { max: TRANSFER_LIMITS.REASON }]}>
            <Input.TextArea rows={3} showCount maxLength={TRANSFER_LIMITS.REASON} />
          </Form.Item>
        </TransferSection>
      </Form>}
    </Spin>
    <div className="form-footer">
      <Button onClick={handleBack} disabled={busy}>{t('common.cancel')}</Button>
      {canEdit && <Button danger icon={<StopOutlined />} disabled={!record?.cancellable || busy} onClick={handleSubmit}>{t('transfer.cancelTransfer')}</Button>}
    </div>
  </div>
}
