import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Descriptions, Modal, Space, Tag, message } from 'antd'
import { DeleteOutlined, EditOutlined, SafetyCertificateOutlined, SendOutlined, UndoOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import DetailPageHeader from '../../components/DetailPageHeader'
import { useAuth } from '../../contexts/AuthContext'
import {
  CERT_DETAIL_PATH, CERT_EDITABLE, CERT_FORM_PATH, CERT_ISSUE_PATH, CERT_LEDGER_PATH, CERT_LIST_PATH,
  cancelCertificate, deleteCertificate, fetchCertificateDetail, submitCertificate,
  type CertificateItem,
} from '../../api/hrCertificate'
import {
  CERT_LANG_LABEL_KEY, CERT_PICKUP_LABEL_KEY, CERT_STATUS_LABEL_KEY, CERT_STATUS_TAG_COLOR,
  CERT_TYPE_LABEL_KEY,
} from './meta'

/** 我的证明申请详情：只读展示 + 提交/撤销/删除，审批进度跳转人事审批详情页 */
/**
 * 证明申请详情。自助端与人事台账端共用本页：
 * ledgerMode 只切换返回路径与操作按钮（人事用「前往登記開具」，员工用提交/撤销/删除）。
 */
export default function CertificateDetail({ ledgerMode = false }: { ledgerMode?: boolean } = {}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const id = Number(searchParams.get('id'))
  const permBase = ledgerMode ? 'hr-certificate' : 'ess-certificate'
  const canEdit = hasPermission(`${permBase}:edit`)
  const canDelete = hasPermission(`${permBase}:delete`)
  const backPath = ledgerMode ? CERT_LEDGER_PATH : CERT_LIST_PATH

  const [item, setItem] = useState<CertificateItem | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      setItem(await fetchCertificateDetail(id))
    } catch {
      // 请求层已提示
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const run = async (fn: () => Promise<unknown>, key: string) => {
    setBusy(true)
    try {
      await fn()
      message.success(t(key))
      await load()
    } catch {
      // 请求层已提示
    } finally {
      setBusy(false)
    }
  }

  const confirmThen = (opts: {
    title: string
    okText: string
    danger?: boolean
    rows: Array<[string, string]>
    action: () => Promise<unknown>
    doneKey: string
  }) => {
    if (!item) return
    Modal.confirm({
      title: opts.title,
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          {opts.rows.map(([label, value]) => (
            <div className="confirm-info-row" key={label}><span>{label}：</span><b>{value || '-'}</b></div>
          ))}
        </div>
      ),
      okText: opts.okText, okButtonProps: opts.danger ? { danger: true } : undefined,
      cancelText: t('common.cancel'),
      onOk: () => run(opts.action, opts.doneKey),
    })
  }

  const baseInfo = (doc: CertificateItem): Array<[string, string]> => [
    [t('hrCert.reqNo'), doc.reqNo],
    [t('hrCert.applicant'), doc.empName],
    [t('hrCert.copies'), `${doc.copies} ${t('hrCert.copyUnit')}`],
  ]

  const handleSubmit = () => {
    if (!item) return
    confirmThen({
      title: t('hrLeave.confirmSubmitTitle'), okText: t('hrLeave.confirmSubmit'),
      rows: [...baseInfo(item), [t('hrCert.purpose'), item.purpose]],
      action: () => submitCertificate(item.id), doneKey: 'hrLeave.submittedShort',
    })
  }

  const handleCancel = () => {
    if (!item) return
    confirmThen({
      title: t('hrCert.confirmCancelTitle'), okText: t('hrLeave.revoke'),
      rows: [...baseInfo(item), [t('hrLeave.flowNo'), item.flowNo || '-']],
      action: () => cancelCertificate(item.id), doneKey: 'hrLeave.cancelled',
    })
  }

  const handleDelete = () => {
    if (!item) return
    confirmThen({
      title: t('hrCert.confirmDeleteTitle'), okText: t('common.delete'), danger: true,
      rows: baseInfo(item),
      action: async () => {
        await deleteCertificate(item.id)
        navigate(CERT_LIST_PATH, { replace: true })
      },
      doneKey: 'hrLeave.deleted',
    })
  }

  if (!item) {
    return <div className="content-area">{t('common.noData')}</div>
  }
  const editable = CERT_EDITABLE.includes(item.status)
  const typeLabel = CERT_TYPE_LABEL_KEY[item.certType] ? t(CERT_TYPE_LABEL_KEY[item.certType]) : item.certType
  const langLabel = CERT_LANG_LABEL_KEY[item.language] ? t(CERT_LANG_LABEL_KEY[item.language]) : item.language
  const statusLabel = CERT_STATUS_LABEL_KEY[item.status] ? t(CERT_STATUS_LABEL_KEY[item.status]) : item.status
  const fmt = (v?: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-')
  const fmtDate = (v?: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '-')

  return (
    <div className="content-area">
      <DetailPageHeader
        title={t('hrCert.detailTitle')}
        tags={(
          <Space size={8}>
            <Tag color="cyan">{typeLabel}</Tag>
            <Tag color={CERT_STATUS_TAG_COLOR[item.status]}>{statusLabel}</Tag>
          </Space>
        )}
        meta={`${item.reqNo} · ${item.empName}${item.empNo ? `(${item.empNo})` : ''} · ${item.copies} ${t('hrCert.copyUnit')}`}
        onBack={() => navigate(backPath)}
        extra={(
          <Space size={8}>
            {ledgerMode && item.status === 'approved' && canEdit && (
              <Button type="primary" icon={<SafetyCertificateOutlined />}
                onClick={() => navigate(`${CERT_ISSUE_PATH}?id=${item.id}`)}>
                {t('hrCert.issue')}
              </Button>
            )}
            {!ledgerMode && editable && canEdit && (
              <Button icon={<EditOutlined />} onClick={() => navigate(`${CERT_FORM_PATH}?id=${item.id}`)}>
                {t('common.edit')}
              </Button>
            )}
            {!ledgerMode && editable && canEdit && (
              <Button type="primary" icon={<SendOutlined />} loading={busy} onClick={handleSubmit}>
                {t('hrLeave.submitApproval')}
              </Button>
            )}
            {!ledgerMode && item.status === 'pending' && canEdit && (
              <Button icon={<UndoOutlined />} loading={busy} onClick={handleCancel}>{t('hrLeave.revoke')}</Button>
            )}
            {!ledgerMode && editable && canDelete && (
              <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>{t('common.delete')}</Button>
            )}
          </Space>
        )}
      />

      <Card size="small" className="detail-card" title={t('hrCert.sectionInfo')} style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label={t('hrCert.reqNo')}>{item.reqNo}</Descriptions.Item>
          <Descriptions.Item label={t('hrCert.applicant')}>{item.empName}{item.empNo ? ` (${item.empNo})` : ''}</Descriptions.Item>
          <Descriptions.Item label={t('hrLeave.dept')}>{item.deptName || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('hrCert.certType')}>{typeLabel}</Descriptions.Item>
          <Descriptions.Item label={t('hrCert.language')}>{langLabel}</Descriptions.Item>
          <Descriptions.Item label={t('hrCert.copies')}>{item.copies} {t('hrCert.copyUnit')}</Descriptions.Item>
          <Descriptions.Item label={t('hrCert.expectDate')}>{fmtDate(item.expectDate)}</Descriptions.Item>
          <Descriptions.Item label={t('hrCert.recipient')} span={2}>{item.recipient || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('hrCert.purpose')} span={3}>{item.purpose || '-'}</Descriptions.Item>
          {item.certNo && (
            <Descriptions.Item label={t('hrCert.certNo')}>{item.certNo}</Descriptions.Item>
          )}
          {item.issueDate && (
            <Descriptions.Item label={t('hrCert.issueDate')}>{fmtDate(item.issueDate)}</Descriptions.Item>
          )}
          {item.pickupType && (
            <Descriptions.Item label={t('hrCert.pickupType')}>
              {CERT_PICKUP_LABEL_KEY[item.pickupType] ? t(CERT_PICKUP_LABEL_KEY[item.pickupType]) : item.pickupType}
            </Descriptions.Item>
          )}
          {item.issuedBy && (
            <Descriptions.Item label={t('hrCert.issuedBy')}>{item.issuedBy}</Descriptions.Item>
          )}
          <Descriptions.Item label={t('hrCert.remark')} span={3}>{item.remark || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('common.colCreateTime')}>{fmt(item.createdAt)}</Descriptions.Item>
          <Descriptions.Item label={t('common.colUpdater')}>{item.updatedBy || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('common.colUpdateTime')}>{fmt(item.updatedAt)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" className="detail-card" title={t('hrLeave.sectionFlow')} style={{ marginBottom: 16 }}>
        {!item.flowNo && <span style={{ color: '#8C8C8C' }}>{t('hrLeave.noFlowTip')}</span>}
        {item.flowNo && (
          <Space size={12} wrap>
            <Tag color="orange">{t('hrLeave.flowNo')}: {item.flowNo}</Tag>
            <Button type="link" size="small" style={{ padding: 0 }}
              onClick={() => navigate(`/hr-flow-detail?flowNo=${encodeURIComponent(item.flowNo!)}&back=${encodeURIComponent(`${ledgerMode ? CERT_LEDGER_PATH : CERT_DETAIL_PATH}?id=${item.id}`)}`)}>
              {t('hrLeave.gotoFlowDetail')}
            </Button>
          </Space>
        )}
      </Card>

      {item.resultRemark && (
        <Card size="small" className="detail-card" title={t('hrLeave.resultRemark')}>
          <span style={{ fontSize: 13 }}>{item.resultRemark}</span>
        </Card>
      )}
    </div>
  )
}
