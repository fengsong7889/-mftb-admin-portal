import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Descriptions, Input, Modal, Space, Spin, Tag, Timeline, message } from 'antd'
import {
  CheckOutlined, CloseOutlined, UndoOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { useAuth } from '../../../contexts/AuthContext'
import { approveOaRequest, cancelOaRequest, fetchOaRequestDetail, rejectOaRequest, type OaRequestVO } from '../../../api/oaRequest'
import {
  HR_LIFECYCLE_LIST_PATH,
  HR_LIFECYCLE_MENU_KEY,
  HR_PROCESS_CODE_TO_TYPE,
  fetchLifecycleRequest,
  type HrLifecycleItem,
  type HrLifecycleType,
} from '../../../api/hrLifecycle'
import {
  LEAVE_DETAIL_PATH, LEAVE_PROCESS_CODE, fetchLeaveDetail, type LeaveRequestItem,
} from '../../../api/hrLeave'
import { LEAVE_STATUS_LABEL_KEY, LEAVE_STATUS_TAG_COLOR, LEAVE_TYPE_LABEL_KEY } from '../HrLeave/meta'
import { STATUS_LABEL_KEY, STATUS_TAG_COLOR, TYPE_LABEL_KEY, TYPE_TAG_COLOR } from './meta'

/**
 * HR 单据「审批流程」详情页（走 OA 统一接口 biz_oa_request）。
 * 流程事項点 HR 单据、HR 详情页「前往流程事項」均落到本页，
 * 避免误入财务审批详情（财务 mock 数据）导致错审他单。
 * <p>
 * formData.bizId 只在同域内有意义（入转调离与请假各有一套主键），
 * 因此必须先按 processCode 判定单据域再回查，严禁拿 bizId 直接猜表。
 */
export default function HrFlowDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const { user, hasPermission } = useAuth()

  const flowNo = searchParams.get('flowNo') || ''
  const backPath = searchParams.get('back') || '/oa-requests'

  const [flow, setFlow] = useState<OaRequestVO | null>(null)
  const [biz, setBiz] = useState<HrLifecycleItem | null>(null)
  const [leave, setLeave] = useState<LeaveRequestItem | null>(null)
  /** 流程编码判定的入转调离类型（无单据查看权限时仍可正确展示类型标签） */
  const [flowType, setFlowType] = useState<HrLifecycleType | undefined>()
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState(false)
  const [comment, setComment] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async () => {
    if (!flowNo) return
    setLoading(true)
    try {
      const data = await fetchOaRequestDetail(flowNo)
      setFlow(data)
      setBiz(null)
      setLeave(null)
      setFlowType(HR_PROCESS_CODE_TO_TYPE[data.processCode])
      const bizId = Number((data.formData as { bizId?: unknown } | null)?.bizId)
      if (!bizId) return
      try {
        if (HR_PROCESS_CODE_TO_TYPE[data.processCode]) {
          setBiz(await fetchLifecycleRequest(bizId))
        } else if (data.processCode === LEAVE_PROCESS_CODE) {
          setLeave(await fetchLeaveDetail(bizId))
        }
        // 其它流程域（财务/采购等）不在此页处理，保持只展示流程信息
      } catch {
        // 无该单据菜单查看权限时仅展示流程信息
      }
    } catch {
      // 请求层已提示
    } finally {
      setLoading(false)
    }
  }, [flowNo])

  useEffect(() => {
    load()
  }, [load])

  const isLeaveFlow = flow?.processCode === LEAVE_PROCESS_CODE
  const type: HrLifecycleType | undefined = isLeaveFlow ? undefined : (flowType ?? biz?.type)
  const menuKey = isLeaveFlow ? 'hr-leave' : (type ? HR_LIFECYCLE_MENU_KEY[type] : undefined)
  const status = flow?.flowStatus
  /** 关联单据展示名（两种单据域共用一套确认框/标签逻辑） */
  const docNo = biz?.reqNo ?? leave?.reqNo
  const docEmp = biz?.empName ?? leave?.empName

  /** 是否可审批：流程在途 + 当前用户为节点审批人（或系统管理员），与后端身份校验口径一致 */
  const approverNames = (flow?.currentApprover || '').split(',')
  const isMyTurn = status === 'pending' && (!!user && (
    user.role === 'admin'
    || approverNames.some(a => a.includes(user.name) || (!!user.empId && a.includes(user.empId)))
  ))
  const canAct = isMyTurn && (!menuKey || hasPermission(`${menuKey}:edit`) || user?.role === 'admin')

  const handleApprove = () => {
    Modal.confirm({
      title: t('hrLifecycle.confirmApproveTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hrLifecycle.flowNo')}：</span><b>{flowNo}</b></div>
          {docNo && <div className="confirm-info-row"><span>{t('hrLifecycle.reqNo')}：</span><b>{docNo}</b></div>}
          {docEmp && <div className="confirm-info-row"><span>{t('hrLifecycle.employee')}：</span><b>{docEmp}</b></div>}
          {isLeaveFlow && leave && (
            <div className="confirm-info-row">
              <span>{t('hrLeave.period')}：</span><b>{leave.startDate} ~ {leave.endDate}（{leave.days} {t('hrLeave.dayUnit')}）</b>
            </div>
          )}
          <div className="confirm-info-row"><span>{t('hrLifecycle.flowCurrentNode')}：</span><b>{flow?.currentNodeName || '-'}</b></div>
        </div>
      ),
      okText: t('hrLifecycle.confirmApprove'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setActing(true)
        try {
          const res = await approveOaRequest(flowNo, comment.trim() || undefined)
          message.success(res.finished ? t('hrLifecycle.approveFinished') : t('hrLifecycle.approveNext', { node: res.nextNode || '' }))
          setComment('')
          await load()
        } catch {
          // 请求层已提示
        } finally {
          setActing(false)
        }
      },
    })
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      message.warning(t('hrLifecycle.rejectReasonRequired'))
      return
    }
    setActing(true)
    try {
      await rejectOaRequest(flowNo, rejectReason.trim())
      message.success(t('hrLifecycle.rejected'))
      setRejectOpen(false)
      setRejectReason('')
      await load()
    } catch {
      // 请求层已提示
    } finally {
      setActing(false)
    }
  }

  const handleCancelFlow = async () => {
    setActing(true)
    try {
      await cancelOaRequest(flowNo)
      message.success(t('hrLifecycle.flowCancelledTip'))
      await load()
    } catch {
      // 请求层已提示
    } finally {
      setActing(false)
    }
  }

  const fmtTime = (v?: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-')

  if (loading && !flow) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 80 }}><Spin /></div>
  }
  if (!flow) {
    return (
      <div className="content-area">
        <DetailPageHeader title={t('hrLifecycle.flowDetailTitle')} onBack={() => navigate(backPath, { replace: true })} />
        <Card size="small">{t('common.noData')}</Card>
      </div>
    )
  }

  return (
    <div className="content-area">
      <DetailPageHeader
        title={t('hrLifecycle.flowDetailTitle')}
        tags={(
          <Space size={8}>
            {isLeaveFlow && <Tag color="cyan">{t('hrLeave.title')}</Tag>}
            {!isLeaveFlow && type && <Tag color={TYPE_TAG_COLOR[type]}>{TYPE_LABEL_KEY[type] ? t(TYPE_LABEL_KEY[type]) : type}</Tag>}
            {isLeaveFlow ? (
              <Tag color={LEAVE_STATUS_TAG_COLOR[leave?.status ?? flow.flowStatus]}>
                {leave && LEAVE_STATUS_LABEL_KEY[leave.status] ? t(LEAVE_STATUS_LABEL_KEY[leave.status]) : flow.flowStatus}
              </Tag>
            ) : (
              <Tag color={STATUS_TAG_COLOR[biz?.status ?? 'pending']}>
                {biz?.status && STATUS_LABEL_KEY[biz.status] ? t(STATUS_LABEL_KEY[biz.status]) : flow.flowStatus}
              </Tag>
            )}
          </Space>
        )}
        meta={`${flowNo} · ${flow.title} · ${flow.applicant}`}
        onBack={() => navigate(backPath, { replace: true })}
        extra={(
          <Space size={8}>
            {status === 'pending' && flow.applicant.includes(user?.name || '') && (
              <Button icon={<UndoOutlined />} loading={acting} onClick={handleCancelFlow}>
                {t('hrLifecycle.revoke')}
              </Button>
            )}
            {canAct && (
              <>
                <Button danger icon={<CloseOutlined />} onClick={() => setRejectOpen(true)}>
                  {t('hrLifecycle.reject')}
                </Button>
                <Button type="primary" icon={<CheckOutlined />} loading={acting} onClick={handleApprove}>
                  {t('hrLifecycle.approvePass')}
                </Button>
              </>
            )}
          </Space>
        )}
      />

      {/* 关联单据：入转调离 */}
      {biz && (
        <Card size="small" className="detail-card" title={t('hrLifecycle.linkedRequestTitle')} style={{ marginBottom: 16 }}>
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label={t('hrLifecycle.reqNo')}>{biz.reqNo}</Descriptions.Item>
            <Descriptions.Item label={t(type === 'onboard' ? 'hrLifecycle.empName' : 'hrLifecycle.employee')}>
              {biz.empName}{biz.empNo ? ` (${biz.empNo})` : ''}
            </Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.dept')}>{biz.deptName || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.position')}>{biz.positionName || '-'}</Descriptions.Item>
            <Descriptions.Item label={t(type === 'onboard' ? 'hrLifecycle.hireDate' : 'hrLifecycle.effectiveDate')}>
              {biz.effectiveDate ? fmtTime(biz.effectiveDate).slice(0, 10) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.reason')} span={3}>{biz.reason || '-'}</Descriptions.Item>
          </Descriptions>
          <div style={{ marginTop: 4 }}>
            <Button type="link" size="small" style={{ padding: 0 }}
              onClick={() => navigate(type ? `${HR_LIFECYCLE_LIST_PATH[type]}-detail?id=${biz.id}` : '/oa-requests')}>
              {t('hrLifecycle.viewRequest')}
            </Button>
          </div>
        </Card>
      )}

      {/* 关联单据：请假（与入转调离不同表，字段与跳转各自独立） */}
      {leave && (
        <Card size="small" className="detail-card" title={t('hrLifecycle.linkedRequestTitle')} style={{ marginBottom: 16 }}>
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label={t('hrLeave.reqNo')}>{leave.reqNo}</Descriptions.Item>
            <Descriptions.Item label={t('hrLeave.employee')}>{leave.empName}{leave.empNo ? ` (${leave.empNo})` : ''}</Descriptions.Item>
            <Descriptions.Item label={t('hrLeave.dept')}>{leave.deptName || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLeave.leaveType')}>
              {LEAVE_TYPE_LABEL_KEY[leave.leaveType] ? t(LEAVE_TYPE_LABEL_KEY[leave.leaveType]) : leave.leaveType}
            </Descriptions.Item>
            <Descriptions.Item label={t('hrLeave.period')}>{leave.startDate} ~ {leave.endDate}</Descriptions.Item>
            <Descriptions.Item label={t('hrLeave.days')}>{leave.days} {t('hrLeave.dayUnit')}</Descriptions.Item>
            <Descriptions.Item label={t('hrLeave.reason')} span={3}>{leave.reason || '-'}</Descriptions.Item>
          </Descriptions>
          <div style={{ marginTop: 4 }}>
            <Button type="link" size="small" style={{ padding: 0 }}
              onClick={() => navigate(`${LEAVE_DETAIL_PATH}?id=${leave.id}`)}>
              {t('hrLifecycle.viewRequest')}
            </Button>
          </div>
        </Card>
      )}

      {/* 审批节点 */}
      <Card size="small" className="detail-card" title={t('hrLifecycle.sectionFlow')} style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space size={12} wrap>
            <Tag color="orange">{t('hrLifecycle.flowNo')}: {flowNo}</Tag>
            <Tag>{t('hrLifecycle.flowApplicant')}: {flow.applicant}</Tag>
            {flow.currentNodeName && <Tag color="processing">{t('hrLifecycle.flowCurrentNode')}: {flow.currentNodeName}</Tag>}
            {flow.currentApprover && <Tag color="processing">{t('hrLifecycle.flowCurrentApprover')}: {flow.currentApprover}</Tag>}
          </Space>
          {flow.rejectReason && (
            <div style={{ color: '#FF4D4F', fontSize: 13 }}>{t('hrLifecycle.rejectReason')}: {flow.rejectReason}</div>
          )}
          {flow.approvalTasks?.length ? (
            <Timeline
              items={flow.approvalTasks.map(task => ({
                color: task.taskStatus === 'approved' ? 'green' : task.taskStatus === 'rejected' ? 'red' : 'blue',
                children: (
                  <Space direction="vertical" size={0}>
                    <b style={{ fontSize: 13 }}>{task.nodeName}</b>
                    <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                      {task.approver || '-'} · {task.approveTime ? fmtTime(task.approveTime) : t('hrLifecycle.flowWaiting')}
                      {task.comment ? ` · ${task.comment}` : ''}
                    </span>
                  </Space>
                ),
              }))}
            />
          ) : <span style={{ color: '#8C8C8C', fontSize: 13 }}>{t('common.noData')}</span>}
          {status === 'pending' && !isMyTurn && (
            <span style={{ color: '#8C8C8C', fontSize: 12 }}>{t('hrLifecycle.notApproverTip')}</span>
          )}
        </Space>
      </Card>

      {/* 审批意见输入 */}
      {canAct && (
        <Card size="small" className="detail-card" title={t('hrLifecycle.approveComment')}>
          <Input.TextArea rows={2} maxLength={300} value={comment} onChange={e => setComment(e.target.value)}
            placeholder={t('hrLifecycle.approveCommentPlaceholder')} />
        </Card>
      )}

      <Modal
        title={t('hrLifecycle.rejectTitle')}
        open={rejectOpen}
        confirmLoading={acting}
        onOk={handleReject}
        onCancel={() => setRejectOpen(false)}
        okText={t('hrLifecycle.confirmReject')}
        okButtonProps={{ danger: true }}
        cancelText={t('common.cancel')}
      >
        <Input.TextArea rows={3} maxLength={300} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
          placeholder={t('hrLifecycle.rejectReasonRequired')} />
      </Modal>
    </div>
  )
}
