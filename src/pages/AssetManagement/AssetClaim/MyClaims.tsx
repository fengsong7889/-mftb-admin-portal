import { useCallback, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Descriptions, Form, Modal, Spin, message } from 'antd'
import { FileProtectOutlined, SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchMyClaim, fetchMyClaims, signMyClaim } from '../../../api/eamClaim'
import { SignaturePad } from '../../../components/SignaturePad'
import { useTransferData } from '../AssetTransfer/useTransferData'
import { TransferError, TransferPageHeader, TransferSection } from '../AssetTransfer/TransferLayout'
import { positiveId } from '../AssetTransfer/transferUtils'
import ClaimRecordTable, { canSignClaim, ClaimStatusTag, SignatureStatusTag } from './ClaimRecordTable'

function MyClaimDetail({ id, onBack }: { id?: number; onBack: () => void }) {
  const { t } = useTranslation()
  const fetcher = useCallback(() => id ? fetchMyClaim(id) : Promise.reject(new Error(t('transfer.invalidId'))), [id, t])
  const { data: record, loading, error, refresh } = useTransferData(fetcher)
  const [signature, setSignature] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const signable = !!record && canSignClaim(record)
  const handleSubmit = () => {
    if (!record || !signable || locked.current) return
    if (!signature) { message.warning(t('transfer.signatureRequired')); return }
    locked.current = true
    setBusy(true)
    Modal.confirm({
      title: t('transfer.signConfirm'), className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: <div className="confirm-info-card"><div className="confirm-info-row"><span>{t('asset.colAssetNo')}：</span><b>{record.assetNo}</b></div><p>{t('transfer.signTip')}</p></div>,
      okText: t('common.confirm'), cancelText: t('common.cancel'),
      afterClose: () => { locked.current = false; setBusy(false) },
      onOk: async () => { await signMyClaim(record.id, signature); message.success(t('transfer.signed')); refresh() },
    })
  }
  return <>
    <TransferPageHeader title={t('transfer.sign')} onBack={onBack} disabled={busy} />
    <TransferError error={error} retry={refresh} />
    <Spin spinning={loading}>
      {record && <Form layout="vertical" disabled={busy || !signable}>
        <TransferSection title={record.sourceTransferId ? t('transfer.successor') : t('transfer.myClaims')} icon={<FileProtectOutlined />}>
          <Descriptions column={3}>
            <Descriptions.Item label={t('asset.colAssetNo')}>{record.assetNo}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colAssetName')}>{record.assetName}</Descriptions.Item>
            <Descriptions.Item label={t('transfer.brand')}>{record.brand || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colUserName')}>{record.empName} ({record.empNo})</Descriptions.Item>
            <Descriptions.Item label={t('transfer.claimDate')}>{record.claimDate}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colStatus')}><ClaimStatusTag status={record.status} /><SignatureStatusTag status={record.signatureStatus} /></Descriptions.Item>
          </Descriptions>
          {signable && <><Alert type="info" message={t('transfer.signTip')} style={{ marginBottom: 16 }} /><SignaturePad key={record.id} onChange={setSignature} disabled={busy} /></>}
        </TransferSection>
      </Form>}
    </Spin>
    {signable && <div className="form-footer"><Button onClick={onBack} disabled={busy}>{t('common.cancel')}</Button><Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} disabled={busy}>{t('transfer.sign')}</Button></div>}
  </>
}

export default function MyClaims() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const page = positiveId(params.get('page')) || 1
  const size = positiveId(params.get('size')) || 10
  const selected = params.has('id')
  const fetcher = useCallback(() => selected ? Promise.resolve({ records: [], total: 0 }) : fetchMyClaims({ page, size }), [page, size, selected])
  const { data, loading, error, refresh } = useTransferData(fetcher)
  const handleBack = () => setParams({ page: String(page), size: String(size) })
  return <div className="content-area">
    {selected ? <MyClaimDetail key={params.get('id')} id={positiveId(params.get('id'))} onBack={handleBack} /> : <>
      <TransferPageHeader title={t('transfer.myClaims')} onBack={() => navigate('/')} />
      <TransferError error={error} retry={refresh} />
      <ClaimRecordTable data={data} loading={loading} query={{ page, size }} pageKey="my-asset-claims"
        onQuery={q => setParams({ page: String(q.page), size: String(q.size) })}
        onView={r => setParams({ page: String(page), size: String(size), id: String(r.id) })}
        onSign={r => setParams({ page: String(page), size: String(size), id: String(r.id) })} />
    </>}
  </div>
}
