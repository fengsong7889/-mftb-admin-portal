import { Alert, Button, Descriptions, Empty, Modal, Spin } from 'antd'
import { EditOutlined, FileProtectOutlined, FileTextOutlined, StopOutlined, RollbackOutlined } from '@ant-design/icons'
import DetailPageHeader from '../../../components/DetailPageHeader'
import BrandTag from '../../../components/BrandTag'
import { ClaimSection } from './ClaimLayout'
import { ClaimStatusTag, SignatureStatusTag, canSignClaim } from './ClaimRecordTable'
import { CLAIM_STATUS, SIGNATURE_STATUS, type ClaimRow } from './claimViewTypes'

interface Props {
  record?: ClaimRow
  loading?: boolean
  error?: string
  onBack: () => void
  onSign?: () => void
  onViewEvidence?: () => void
  onDownloadEvidence?: () => void
  onCancel?: (claimId: number, reason: string) => Promise<void>
  onReturn?: (claimId: number, returnDate: string, returnReason?: string, conditionNote?: string) => Promise<void>
}

export function ClaimSnapshot({ record }: { record: ClaimRow }) {
  return <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} bordered size="middle" items={[
    { key: 'claimNo', label: '领用编号', children: record.claimNo },
    { key: 'assetNo', label: '资产编号', children: record.assetNo },
    { key: 'assetName', label: '资产名称', children: record.assetName },
    { key: 'companyBrand', label: '所属公司品牌', children: record.companyBrand ? <BrandTag value={record.companyBrand} /> : '—' },
    { key: 'brand', label: '资产品牌', children: record.brand || '—' },
    { key: 'assetType', label: '资产分类', children: record.assetType || '—' },
    { key: 'employee', label: '领用人', children: `${record.empName}（${record.empNo}）` },
    { key: 'department', label: '领用时部门', children: record.department },
    { key: 'claimDate', label: '业务领用日期', children: record.claimDate },
    { key: 'createdAt', label: '实际登记时间', children: record.createdAt || '—' },
    { key: 'operator', label: '登记操作人', children: record.operator },
    { key: 'status', label: '领用状态', children: <ClaimStatusTag status={record.status} /> },
    { key: 'signature', label: '签收状态', children: <SignatureStatusTag status={record.signatureStatus} /> },
    { key: 'signedAt', label: '实际签署时间', children: record.signedAt || '—' },
    { key: 'returnDate', label: '业务归还日期', children: record.returnDate || '—' },
    { key: 'returnedAt', label: '实际归还时间', children: record.returnedAt || '—' },
    { key: 'reason', label: '领用用途', children: record.claimReason || '—' },
    { key: 'remark', label: '备注', children: record.remark || '—' },
    ...(record.proxyReason ? [{ key: 'proxy', label: '代办原因', children: record.proxyReason }] : []),
    ...(record.cancelledReason ? [{ key: 'cancel', label: '取消原因', children: record.cancelledReason }] : []),
  ]} />
}

export default function ClaimRecordDetail({ record, loading, error, onBack, onSign, onViewEvidence, onDownloadEvidence, onCancel, onReturn }: Props) {
  return <>
    <DetailPageHeader title="领用及签收凭证详情" meta={record?.claimNo} onBack={onBack} />
    {error && <Alert type="error" showIcon message={error} className="claim-notice" />}
    <Spin spinning={loading}>
      <ClaimSection title="领用内容快照" icon={<FileTextOutlined />}>
        {record && !error ? <ClaimSnapshot record={record} /> : <Empty description="领用内容尚未加载" />}
      </ClaimSection>
      <ClaimSection title="签收凭证" icon={<FileProtectOutlined />}>
        {record?.signatureStatus === SIGNATURE_STATUS.PROXY_PENDING && <Alert type="warning" showIcon className="claim-notice"
          message={record.status === CLAIM_STATUS.RETURNED ? `此资产已于 ${record.returnDate ?? '—'} 归还，尚未补签。` : '管理员代办未签，不能视为员工本人已确认。'}
          description="补签只确认历史领用事实，不重新分配资产，也不影响之后的新领用。" />}
        <p className="claim-muted">仅作为内部签收凭证，不承诺 CA 认证、可信时间戳或特定司法效力。凭证仅允许受控查看和下载。</p>
        <div className="claim-evidence-actions">
          <Button disabled={!record || !!error || record.signatureStatus !== SIGNATURE_STATUS.SIGNED || !onViewEvidence} onClick={onViewEvidence}>查看签收凭证</Button>
          <Button disabled={!record || !!error || record.signatureStatus !== SIGNATURE_STATUS.SIGNED || !onDownloadEvidence} onClick={onDownloadEvidence}>下载凭证包</Button>
          {record && !error && onSign && canSignClaim(record) && <Button type="primary" onClick={onSign}>{record.signatureStatus === SIGNATURE_STATUS.PROXY_PENDING ? '补签历史领用' : '前往本人签署'}</Button>}
        </div>
      </ClaimSection>
      <ClaimSection title="操作记录" icon={<EditOutlined />}>
        <Descriptions column={2} items={[
          { key: 'updatedBy', label: '最后更新人', children: record?.updatedBy || '—' },
          { key: 'updatedAt', label: '最后更新时间', children: record?.updatedAt || '—' },
        ]} />
        {record && !error && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            {onCancel && record.status !== CLAIM_STATUS.RETURNED && record.status !== CLAIM_STATUS.CANCELLED && (
              <Button danger icon={<StopOutlined />} onClick={() => {
                Modal.confirm({
                  title: '确认取消领用？',
                  content: '取消后领用记录将标记为已取消，代办生效的资产将释放为闲置。',
                  okText: '确认取消',
                  cancelText: '返回',
                  okButtonProps: { danger: true },
                  onOk: () => onCancel(record.id, '管理员手动取消'),
                })
              }}>取消领用</Button>
            )}
            {onReturn && record.status === CLAIM_STATUS.CLAIMED && (
              <Button type="primary" icon={<RollbackOutlined />} onClick={() => {
                Modal.confirm({
                  title: '确认归还资产？',
                  content: `确认将资产「${record.assetName}（${record.assetNo}）」归还？`,
                  okText: '确认归还',
                  cancelText: '返回',
                  onOk: () => onReturn(record.id, new Date().toISOString().slice(0, 10), '正常归还'),
                })
              }}>归还资产</Button>
            )}
          </div>
        )}
      </ClaimSection>
    </Spin>
  </>
}
