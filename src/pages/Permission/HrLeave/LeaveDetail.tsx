import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Descriptions, Modal, Space, Tag, message } from 'antd'
import { DeleteOutlined, EditOutlined, SendOutlined, UndoOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { useAuth } from '../../../contexts/AuthContext'
import {
  LEAVE_EDITABLE, cancelLeaveRequest, deleteLeaveRequest, fetchLeaveDetail, submitLeaveRequest,
  type LeaveRequestItem,
} from '../../../api/hrLeave'
import { LEAVE_STATUS_LABEL_KEY, LEAVE_STATUS_TAG_COLOR, LEAVE_TYPE_LABEL_KEY } from './meta'

/** 请假单详情页：只读展示 + 提交/撤销/删除操作，审批进度跳转 OA 流程详情 */
export default function LeaveDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const id = Number(searchParams.get('id'))
  const canEdit = hasPermission('hr-leave:edit')
  const canDelete = hasPermission('hr-leave:delete')

  const [item, setItem] = useState<LeaveRequestItem | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      setItem(await fetchLeaveDetail(id))
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

  const handleSubmit = () => {
    if (!item) return
    Modal.confirm({
      title: t('hrLeave.confirmSubmitTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hrLeave.reqNo')}：</span><b>{item.reqNo}</b></div>
          <div className="confirm-info-row"><span>{t('hrLeave.employee')}：</span><b>{item.empName}</b></div>
          <div className="confirm-info-row"><span>{t('hrLeave.period')}：</span><b>{item.startDate} ~ {item.endDate}</b></div>
          <div className="confirm-info-row"><span>{t('hrLeave.days')}：</span><b>{item.days} {t('hrLeave.dayUnit')}</b></div>
          {item.remainingDays != null && (
            <div className="confirm-info-row"><span>{t('hrLeave.remaining')}：</span><b>{item.remainingDays}</b></div>
          )}
        </div>
      ),
      okText: t('hrLeave.confirmSubmit'), cancelText: t('common.cancel'),
      onOk: () => run(() => submitLeaveRequest(item.id), 'hrLeave.submittedShort'),
    })
  }

  /** 撤销审批：中断在途流程属高危操作，必须二次确认 */
  const handleCancel = () => {
    if (!item) return
    Modal.confirm({
      title: t('hrLeave.confirmCancelTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hrLeave.reqNo')}：</span><b>{item.reqNo}</b></div>
          <div className="confirm-info-row"><span>{t('hrLeave.employee')}：</span><b>{item.empName}</b></div>
          {item.flowNo && (
            <div className="confirm-info-row"><span>{t('hrLeave.flowNo')}：</span><b>{item.flowNo}</b></div>
          )}
        </div>
      ),
      okText: t('hrLeave.revoke'), cancelText: t('common.cancel'),
      onOk: () => run(() => cancelLeaveRequest(item.id), 'hrLeave.cancelled'),
    })
  }

  /** 删除草稿：破坏性操作，二次确认 + 成功提示后再跳转列表 */
  const handleDelete = () => {
    if (!item) return
    Modal.confirm({
      title: t('hrLeave.confirmDeleteTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hrLeave.reqNo')}：</span><b>{item.reqNo}</b></div>
          <div className="confirm-info-row"><span>{t('hrLeave.employee')}：</span><b>{item.empName}</b></div>
          <div className="confirm-info-row"><span>{t('hrLeave.days')}：</span><b>{item.days} {t('hrLeave.dayUnit')}</b></div>
        </div>
      ),
      okText: t('common.delete'), okButtonProps: { danger: true }, cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteLeaveRequest(item.id)
        message.success(t('hrLeave.deleted'))
        navigate('/hr-leave', { replace: true })
      },
    })
  }

  if (!item) {
    return <div className="content-area">{t('common.noData')}</div>
  }
  const editable = LEAVE_EDITABLE.includes(item.status)
  const typeLabel = LEAVE_TYPE_LABEL_KEY[item.leaveType] ? t(LEAVE_TYPE_LABEL_KEY[item.leaveType]) : item.leaveType
  const fmt = (v?: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-')

  return (
    <div className="content-area">
      <DetailPageHeader
        title={t('hrLeave.detailTitle')}
        tags={(
          <Space size={8}>
            <Tag color="cyan">{typeLabel}</Tag>
            <Tag color={LEAVE_STATUS_TAG_COLOR[item.status]}>
              {LEAVE_STATUS_LABEL_KEY[item.status] ? t(LEAVE_STATUS_LABEL_KEY[item.status]) : item.status}
            </Tag>
          </Space>
        )}
        meta={`${item.reqNo} · ${item.empName}${item.empNo ? `(${item.empNo})` : ''} · ${item.days} ${t('hrLeave.dayUnit')}`}
        onBack={() => navigate('/hr-leave')}
        extra={(
          <Space size={8}>
            {editable && canEdit && (
              <Button icon={<EditOutlined />} onClick={() => navigate(`/hr-leave-form?id=${item.id}`)}>
                {t('common.edit')}
              </Button>
            )}
            {editable && canEdit && (
              <Button type="primary" icon={<SendOutlined />} loading={busy} onClick={handleSubmit}>
                {t('hrLeave.submitApproval')}
              </Button>
            )}
            {item.status === 'pending' && canEdit && (
              <Button icon={<UndoOutlined />} loading={busy} onClick={handleCancel}>
                {t('hrLeave.revoke')}
              </Button>
            )}
            {editable && canDelete && (
              <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>{t('common.delete')}</Button>
            )}
          </Space>
        )}
      />

      <Card size="small" className="detail-card" title={t('hrLeave.sectionInfo')} style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label={t('hrLeave.reqNo')}>{item.reqNo}</Descriptions.Item>
          <Descriptions.Item label={t('hrLeave.employee')}>{item.empName}{item.empNo ? ` (${item.empNo})` : ''}</Descriptions.Item>
          <Descriptions.Item label={t('hrLeave.dept')}>{item.deptName || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('hrLeave.leaveType')}>{typeLabel}</Descriptions.Item>
          <Descriptions.Item label={t('hrLeave.period')}>{item.startDate} ~ {item.endDate}</Descriptions.Item>
          <Descriptions.Item label={t('hrLeave.days')}>{item.days} {t('hrLeave.dayUnit')}</Descriptions.Item>
          {item.remainingDays != null && (
            <Descriptions.Item label={t('hrLeave.remainingExclThis')}>{item.remainingDays}</Descriptions.Item>
          )}
          <Descriptions.Item label={t('hrLeave.reason')} span={3}>{item.reason || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('common.colCreateTime')}>{fmt(item.createdAt)}</Descriptions.Item>
          <Descriptions.Item label={t('common.colUpdater')}>{item.updatedBy || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('common.colUpdateTime')}>{fmt(item.updatedAt)}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" className="detail-card" title={t('hrLeave.sectionFlow')}>
        {!item.flowNo && <span style={{ color: '#8C8C8C' }}>{t('hrLeave.noFlowTip')}</span>}
        {item.flowNo && (
          <Space size={12} wrap>
            <Tag color="orange">{t('hrLeave.flowNo')}: {item.flowNo}</Tag>
            <Button type="link" size="small" style={{ padding: 0 }}
              onClick={() => navigate(`/hr-flow-detail?flowNo=${encodeURIComponent(item.flowNo!)}&back=${encodeURIComponent(`/hr-leave-detail?id=${item.id}`)}`)}>
              {t('hrLeave.gotoFlowDetail')}
            </Button>
          </Space>
        )}
      </Card>
      {item.remark && (
        <Card size="small" className="detail-card" title={t('hrLeave.resultRemark')} style={{ marginTop: 16 }}>
          <span style={{ fontSize: 13 }}>{item.remark}</span>
        </Card>
      )}
    </div>
  )
}
