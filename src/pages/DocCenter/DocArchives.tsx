/**
 * 档案室（P1d）：保管期限、冻结、销毁申请与审批、清册导出。
 * 归档入口在文档详情；本页只处理已归档文档的后续治理。
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Alert, Button, Empty, Input, Modal, Space, Table, Tabs, Tag, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ExportOutlined, ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  decideDocDisposal, downloadDisposalCsv, fetchDisposalRequests, fetchDocArchives, requestDocDisposal,
  type DocArchiveMeta, type DocDisposalRequest,
} from '@/api/docArchive'
import { DocPlanSectionTitle } from './docPlanUi'
import { docPlanCardStyle } from './docPlanStyle'

const DISPOSAL_KEY: Record<number, string> = { 0: 'normal', 1: 'pending', 2: 'approved', 3: 'destroyed' }
const REQUEST_KEY: Record<number, string> = { 1: 'pending', 2: 'approved', 3: 'rejected', 4: 'destroyed' }

export default function DocArchives() {
  const { t } = useTranslation()
  const [archives, setArchives] = useState<DocArchiveMeta[]>([])
  const [requests, setRequests] = useState<DocDisposalRequest[]>([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [disposalTarget, setDisposalTarget] = useState<DocArchiveMeta | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [archiveRows, requestRows] = await Promise.all([
        fetchDocArchives({ keyword, page: 1, size: 100 }),
        fetchDisposalRequests({ page: 1, size: 100 }),
      ])
      setArchives(archiveRows)
      setRequests(requestRows)
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [keyword, t])

  useEffect(() => { void load() }, [load])

  const handleRequestDisposal = async () => {
    if (!disposalTarget || !reason.trim()) {
      message.warning(t('docKnowledge.disposalReasonRequired'))
      return
    }
    setSaving(true)
    try {
      await requestDocDisposal(disposalTarget.nodeId, reason.trim())
      setDisposalTarget(null)
      setReason('')
      setSaving(false)
      message.success(t('docKnowledge.disposalRequested'))
      void load()
    } catch {
      // request.ts 已统一提示，避免重复 toast
      setSaving(false)
    }
  }

  const handleDecide = (row: DocDisposalRequest, approve: boolean) => {
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      title: t(approve ? 'docKnowledge.disposalApproveConfirm' : 'docKnowledge.disposalRejectConfirm'),
      content: t(approve ? 'docKnowledge.disposalApproveHint' : 'docKnowledge.disposalRejectHint'),
      okText: t('docKnowledge.confirm'),
      cancelText: t('docKnowledge.cancel'),
      okButtonProps: { danger: approve },
      onOk: async () => {
        try {
          await decideDocDisposal(row.id, approve)
          message.success(t(approve ? 'docKnowledge.disposalApproved' : 'docKnowledge.disposalRejected'))
          await load()
        } catch {
          // request.ts 已统一提示，避免重复 toast
        }
      },
    })
  }

  const archiveColumns: ColumnsType<DocArchiveMeta> = [
    { title: t('docKnowledge.documentNo'), dataIndex: 'documentNo', width: 160 },
    { title: t('docKnowledge.colTitle'), dataIndex: 'title', ellipsis: true },
    { title: t('docKnowledge.colSpace'), dataIndex: 'spaceName', width: 130 },
    { title: t('docKnowledge.archiveNo'), dataIndex: 'archiveNo', width: 160 },
    { title: t('docKnowledge.retentionYears'), dataIndex: 'retentionYears', width: 100 },
    { title: t('docKnowledge.retentionStart'), dataIndex: 'retentionStart', width: 120 },
    {
      title: t('docKnowledge.disposalState'), dataIndex: 'disposalState', width: 130,
      render: (value: number) => <Tag color={value === 3 ? 'red' : value === 1 ? 'orange' : 'green'}>{t(`docKnowledge.disposalStateValue.${DISPOSAL_KEY[value]}`)}</Tag>,
    },
    {
      title: t('docKnowledge.legalHold'), dataIndex: 'legalHold', width: 100,
      render: (value: boolean) => value ? <Tag color="red">{t('docKnowledge.legalHoldOn')}</Tag> : '—',
    },
    {
      title: t('docKnowledge.colAction'), width: 130,
      render: (_, row) => (
        <Button size="small" danger disabled={row.legalHold || row.disposalState === 3}
          onClick={() => setDisposalTarget(row)}>{t('docKnowledge.requestDisposal')}</Button>
      ),
    },
  ]

  const requestColumns: ColumnsType<DocDisposalRequest> = [
    { title: t('docKnowledge.documentNo'), dataIndex: 'documentNo', width: 160 },
    { title: t('docKnowledge.colTitle'), dataIndex: 'title', ellipsis: true },
    { title: t('docKnowledge.disposalReason'), dataIndex: 'reason', ellipsis: true },
    { title: t('docKnowledge.requester'), dataIndex: 'requestedByName', width: 110 },
    {
      title: t('docKnowledge.disposalStatus'), dataIndex: 'status', width: 100,
      render: (value: number) => <Tag color={value === 4 ? 'red' : value === 1 ? 'orange' : value === 2 ? 'green' : 'default'}>{t(`docKnowledge.disposalRequestValue.${REQUEST_KEY[value]}`)}</Tag>,
    },
    { title: t('docKnowledge.approver'), dataIndex: 'approvedByName', width: 110 },
    { title: t('docKnowledge.certificateNo'), dataIndex: 'certificateNo', width: 150 },
    {
      title: t('docKnowledge.colAction'), width: 150,
      render: (_, row) => row.status === 1 ? (
        <Space size={4}>
          <Button size="small" danger onClick={() => handleDecide(row, true)}>{t('docKnowledge.approve')}</Button>
          <Button size="small" onClick={() => handleDecide(row, false)}>{t('docKnowledge.reject')}</Button>
        </Space>
      ) : '—',
    },
  ]

  return (
    <div className="content-area">
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message={t('docKnowledge.archivesTitle')} description={t('docKnowledge.archivesHint')} />
      <div style={docPlanCardStyle}>
        <DocPlanSectionTitle icon={<SafetyCertificateOutlined />} title={t('docKnowledge.archivesTitle')}
          extra={(
            <Space>
              <Input.Search allowClear value={keyword} onChange={e => setKeyword(e.target.value)}
                onSearch={() => void load()} placeholder={t('docKnowledge.searchPlaceholder')} style={{ width: 220 }} />
              <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>{t('docKnowledge.reload')}</Button>
              <Button icon={<ExportOutlined />} onClick={() => void downloadDisposalCsv().catch(error => message.error(error.message))}>
                {t('docKnowledge.exportRegister')}
              </Button>
            </Space>
          )} />
        <Tabs items={[
          {
            key: 'archives',
            label: t('docKnowledge.archiveList'),
            children: (
              <Table rowKey="nodeId" size="small" loading={loading} dataSource={archives}
                scroll={{ x: 1200 }} pagination={false} columns={archiveColumns}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.archiveEmpty')} /> }} />
            ),
          },
          {
            key: 'requests',
            label: t('docKnowledge.disposalRequests'),
            children: (
              <Table rowKey="id" size="small" loading={loading} dataSource={requests}
                scroll={{ x: 1200 }} pagination={false} columns={requestColumns}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.disposalEmpty')} /> }} />
            ),
          },
        ]} />
      </div>

      <Modal
        open={!!disposalTarget}
        title={t('docKnowledge.requestDisposal')}
        onCancel={() => { setDisposalTarget(null); setReason('') }}
        onOk={handleRequestDisposal}
        confirmLoading={saving}
        okText={t('docKnowledge.submit')}
        cancelText={t('docKnowledge.cancel')}
        className="custom-confirm-modal"
      >
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={t('docKnowledge.disposalHint')} />
        <div style={{ marginBottom: 6, color: '#595959' }}>{disposalTarget?.documentNo} · {disposalTarget?.title}</div>
        <Input.TextArea rows={4} maxLength={500} showCount value={reason}
          onChange={event => setReason(event.target.value)} placeholder={t('docKnowledge.disposalReasonPlaceholder')} />
      </Modal>
    </div>
  )
}
