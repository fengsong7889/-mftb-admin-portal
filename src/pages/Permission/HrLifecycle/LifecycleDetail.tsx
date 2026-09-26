import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Descriptions, Modal, Space, Spin, Tag, Timeline, message } from 'antd'
import {
  CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, SendOutlined, UndoOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { useAuth } from '../../../contexts/AuthContext'
import {
  HR_LIFECYCLE_LIST_PATH,
  HR_LIFECYCLE_MENU_KEY,
  HR_LIFECYCLE_ROUTE,
  HR_LIFECYCLE_TYPE,
  cancelLifecycleRequest,
  deleteLifecycleRequest,
  fetchLifecycleRequest,
  submitLifecycleRequest,
  type HrLifecycleItem,
} from '../../../api/hrLifecycle'
import { fetchOaRequestDetail, type OaRequestVO } from '../../../api/oaRequest'
import {
  DIMISSION_TYPE_LABEL_KEY, EDITABLE_STATUSES, STATUS_LABEL_KEY, STATUS_TAG_COLOR,
  TYPE_LABEL_KEY, TYPE_TAG_COLOR,
} from './meta'

/** 入转调离单据详情页（四类共用，含 OA 审批节点时间线） */
export default function LifecycleDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()

  const id = Number(searchParams.get('id'))
  const [item, setItem] = useState<HrLifecycleItem | null>(null)
  const [flow, setFlow] = useState<OaRequestVO | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const type = item?.type ?? HR_LIFECYCLE_TYPE.ONBOARD
  const menuKey = HR_LIFECYCLE_MENU_KEY[type]
  const listPath = HR_LIFECYCLE_LIST_PATH[type]
  const routeBase = HR_LIFECYCLE_ROUTE[type]
  const canCreate = hasPermission(`${menuKey}:create`)
  const canEdit = hasPermission(`${menuKey}:edit`)
  const canDelete = hasPermission(`${menuKey}:delete`)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const data = await fetchLifecycleRequest(id)
      setItem(data)
      if (data.flowNo) {
        try {
          // 流程详情读取需要 oa-requests:view；无权限时静默降级（仅展示单据信息）
          setFlow(await fetchOaRequestDetail(data.flowNo))
        } catch {
          setFlow(null)
        }
      } else {
        setFlow(null)
      }
    } catch {
      // 请求层已提示
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const editable = !!item && EDITABLE_STATUSES.includes(item.status)

  const runAction = async (fn: () => Promise<unknown>, successKey: string) => {
    setActionLoading(true)
    try {
      await fn()
      message.success(t(successKey))
      await load()
    } catch {
      // 请求层已提示
    } finally {
      setActionLoading(false)
    }
  }

  /** 提交审批：统一的二次确认弹窗（规范 §B.3），提示带 OA 流程编号 */
  const handleSubmit = () => {
    if (!item) return
    const rows: Array<[string, string]> = [
      [t('hrLifecycle.reqNo'), item.reqNo],
      [t('hrLifecycle.employee'), item.empName],
    ]
    if (item.deptName) rows.push([t('hrLifecycle.dept'), item.deptName])
    if (item.effectiveDate) rows.push([t('hrLifecycle.effectiveDate'), item.effectiveDate])
    if (item.reason) rows.push([t('hrLifecycle.reason'), item.reason])
    Modal.confirm({
      title: t('hrLifecycle.confirmSubmitTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          {rows.map(([label, val]) => (
            <div className="confirm-info-row" key={label}><span>{label}：</span><b>{val}</b></div>
          ))}
        </div>
      ),
      okText: t('hrLifecycle.confirmSubmit'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setActionLoading(true)
        try {
          const result = await submitLifecycleRequest(item.id)
          message.success(t('hrLifecycle.submitted', { flowNo: result.flowNo }))
          await load()
        } finally {
          setActionLoading(false)
        }
      },
    })
  }

  const handleCancel = () => {
    if (!item) return
    runAction(() => cancelLifecycleRequest(item.id), 'hrLifecycle.cancelled')
  }

  const handleDelete = () => {
    if (!item) return
    runAction(async () => {
      await deleteLifecycleRequest(item.id)
      navigate(listPath, { replace: true })
    }, 'hrLifecycle.deleted')
  }

  const candidate = safeParse(item?.candidateInfo)
  const settlement = safeParse(item?.settlementInfo)
  const fmtDate = (v?: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '-')
  const fmtTime = (v?: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-')

  if (loading && !item) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 80 }}><Spin /></div>
  }
  if (!item) {
    return <div className="content-area">{t('common.noData')}</div>
  }

  return (
    <div className="content-area">
      <DetailPageHeader
        title={t('hrLifecycle.detailTitle')}
        tags={(
          <Space size={8}>
            <Tag color={TYPE_TAG_COLOR[type]}>{TYPE_LABEL_KEY[type] ? t(TYPE_LABEL_KEY[type]) : type}</Tag>
            <Tag color={STATUS_TAG_COLOR[item.status]}>
              {STATUS_LABEL_KEY[item.status] ? t(STATUS_LABEL_KEY[item.status]) : item.status}
            </Tag>
          </Space>
        )}
        meta={`${item.reqNo} · ${item.empName}${item.empNo ? `(${item.empNo})` : ''} · ${t('common.colUpdater')}: ${item.updatedBy || '-'}`}
        onBack={() => navigate(listPath)}
        extra={(
          <Space size={8}>
            {editable && canEdit && (
              <Button icon={<EditOutlined />} onClick={() => navigate(`${routeBase}-form?id=${item.id}`)}>
                {t('common.edit')}
              </Button>
            )}
            {editable && canCreate && (
              <Button type="primary" icon={<SendOutlined />} loading={actionLoading} onClick={handleSubmit}>
                {t('hrLifecycle.submitApproval')}
              </Button>
            )}
            {item.status === 'pending' && canEdit && (
              <Button icon={<UndoOutlined />} loading={actionLoading} onClick={handleCancel}>
                {t('hrLifecycle.revoke')}
              </Button>
            )}
            {editable && canDelete && (
              <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
                {t('common.delete')}
              </Button>
            )}
          </Space>
        )}
      />

      {/* 基础信息 */}
      <Card size="small" className="detail-card" title={t('hrLifecycle.sectionCommon')} style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label={t('hrLifecycle.reqNo')}>{item.reqNo}</Descriptions.Item>
          <Descriptions.Item label={t(type === 'onboard' ? 'hrLifecycle.empName' : 'hrLifecycle.employee')}>
            {item.empName}{item.empNo ? ` (${item.empNo})` : ''}
          </Descriptions.Item>
          {type !== 'onboard' && item.userId && (
            <Descriptions.Item label={t('hrLifecycle.linkedEmployee')}>
              {hasPermission('employee-management:view') ? (
                <Button type="link" size="small" style={{ padding: 0 }}
                  onClick={() => navigate(`/employee-detail?id=${item.userId}`)}>
                  {item.empName}
                </Button>
              ) : item.empName}
            </Descriptions.Item>
          )}
          <Descriptions.Item label={t('hrLifecycle.dept')}>{item.deptName || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('hrLifecycle.position')}>{item.positionName || '-'}</Descriptions.Item>
          <Descriptions.Item label={t(type === 'onboard' ? 'hrLifecycle.hireDate' : 'hrLifecycle.effectiveDate')}>
            {fmtDate(item.effectiveDate)}
          </Descriptions.Item>
          <Descriptions.Item label={t('hrLifecycle.reason')} span={3}>{item.reason || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('common.colCreateTime')}>{fmtTime(item.createdAt)}</Descriptions.Item>
          <Descriptions.Item label={t('common.colUpdateTime')}>{fmtTime(item.updatedAt)}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 入职明细 */}
      {type === HR_LIFECYCLE_TYPE.ONBOARD && (
        <Card size="small" className="detail-card" title={t('hrLifecycle.sectionOnboard')} style={{ marginBottom: 16 }}>
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label={t('hrLifecycle.offerDate')}>{fmtDate(item.offerDate)}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.probationMonths')}>
              {item.probationMonths != null ? `${item.probationMonths} ${t('hrLifecycle.monthUnit')}` : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.expectedRegularDate')}>{fmtDate(item.expectedRegularDate)}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.company')}>{(candidate.company as string) || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.employeeCategory')}>{(candidate.employeeCategory as string) || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.workCity')}>{(candidate.workCity as string) || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.idCardNo')}>{item.idCardNo || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.mobile')}>{item.mobile || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.email')}>{item.email || '-'}</Descriptions.Item>
          </Descriptions>
          {item.status === 'completed' && item.empNo && (
            <div style={{ marginTop: 8, color: '#52C41A', fontSize: 13 }}>
              {t('hrLifecycle.onboardDoneTip', { empNo: item.empNo })}
            </div>
          )}
        </Card>
      )}

      {/* 调动明细 */}
      {type === HR_LIFECYCLE_TYPE.TRANSFER && (
        <Card size="small" className="detail-card" title={t('hrLifecycle.sectionTransfer')} style={{ marginBottom: 16 }}>
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label={t('hrLifecycle.oldDept')}>{item.oldDeptName || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.oldPosition')}>{item.oldPositionName || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.company')}>{item.newCompany || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.newDept')}>{item.newDeptName || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.newPosition')}>{item.newPositionName || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.newSuperior')}>{item.newSuperior || '-'}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* 离职明细 */}
      {type === HR_LIFECYCLE_TYPE.DIMISSION && (
        <Card size="small" className="detail-card" title={t('hrLifecycle.sectionDimission')} style={{ marginBottom: 16 }}>
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label={t('hrLifecycle.dimissionType')}>
              {item.dimissionType && DIMISSION_TYPE_LABEL_KEY[item.dimissionType]
                ? t(DIMISSION_TYPE_LABEL_KEY[item.dimissionType]) : (item.dimissionType || '-')}
            </Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.lastWorkDate')}>{fmtDate(item.lastWorkDate)}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.assetReturn')}>{(settlement.assetReturn as string) || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.salarySettlement')} span={3}>
              {(settlement.salarySettlement as string) || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.handoverNote')} span={3}>
              {(settlement.handoverNote as string) || '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* 合同续签明细 */}
      {type === HR_LIFECYCLE_TYPE.RENEW && (
        <Card size="small" className="detail-card" title={t('hrLifecycle.sectionRenew')} style={{ marginBottom: 16 }}>
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
            <Descriptions.Item label={t('hrLifecycle.originContract')}>{item.contractNo || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.newContractNo')}>{item.newContractNo || t('hrLifecycle.newContractNoAuto')}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.newContractType')}>{item.newContractType || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.newContractCompany')}>{item.newContractCompany || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.newStartDate')}>{fmtDate(item.newContractStartDate)}</Descriptions.Item>
            <Descriptions.Item label={t('hrLifecycle.newEndDate')}>{fmtDate(item.newContractEndDate)}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* 审批流程 */}
      <Card size="small" className="detail-card" title={t('hrLifecycle.sectionFlow')} style={{ marginBottom: 16 }}>
        {!item.flowNo && <span style={{ color: '#8C8C8C' }}>{t('hrLifecycle.noFlowTip')}</span>}
        {item.flowNo && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space size={12} wrap>
              <Tag color="orange">{t('hrLifecycle.flowNo')}: {item.flowNo}</Tag>
              {flow && (
                <>
                  <Tag>{t('hrLifecycle.flowApplicant')}: {flow.applicant}</Tag>
                  {flow.currentNodeName && (
                    <Tag color="processing">{t('hrLifecycle.flowCurrentNode')}: {flow.currentNodeName}</Tag>
                  )}
                  {flow.currentApprover && (
                    <Tag color="processing">{t('hrLifecycle.flowCurrentApprover')}: {flow.currentApprover}</Tag>
                  )}
                  <Button type="link" size="small" style={{ padding: 0 }}
                    onClick={() => navigate(`/hr-flow-detail?flowNo=${encodeURIComponent(item.flowNo!)}&back=${encodeURIComponent(`${routeBase}-detail?id=${item.id}`)}`)}>
                    {t('hrLifecycle.gotoFlowDetail')}
                  </Button>
                </>
              )}
            </Space>
            {flow?.rejectReason && (
              <div style={{ color: '#FF4D4F', fontSize: 13 }}>{t('hrLifecycle.rejectReason')}: {flow.rejectReason}</div>
            )}
            {flow?.approvalTasks?.length ? (
              <Timeline
                items={flow.approvalTasks.map(task => ({
                  color: task.taskStatus === 'approved' ? 'green' : task.taskStatus === 'rejected' ? 'red' : 'blue',
                  children: (
                    <Space direction="vertical" size={0}>
                      <Space size={8}>
                        <b style={{ fontSize: 13 }}>{task.nodeName}</b>
                        {task.taskStatus === 'approved' && <Tag color="success" icon={<CheckOutlined />}>{t('hrLifecycle.flowApproved')}</Tag>}
                        {task.taskStatus === 'rejected' && <Tag color="error" icon={<CloseOutlined />}>{t('hrLifecycle.flowRejectedTag')}</Tag>}
                        {task.taskStatus === 'pending' && <Tag color="processing">{t('hrLifecycle.flowWaiting')}</Tag>}
                      </Space>
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                        {task.approver || '-'}
                        {task.approveTime ? ` · ${fmtTime(task.approveTime)}` : ''}
                        {task.comment ? ` · ${task.comment}` : ''}
                      </span>
                    </Space>
                  ),
                }))}
              />
            ) : (
              <span style={{ color: '#8C8C8C', fontSize: 13 }}>{t('hrLifecycle.flowNodeLoadingTip')}</span>
            )}
          </Space>
        )}
      </Card>

      {/* 备注/办理结果 */}
      {item.remark && (
        <Card size="small" className="detail-card" title={t('hrLifecycle.remark')}>
          <span style={{ fontSize: 13 }}>{item.remark}</span>
        </Card>
      )}
    </div>
  )
}

/** 安全解析 JSON 字段（'null'/空/非法均回退空对象） */
function safeParse(raw?: string | null): Record<string, unknown> {
  if (!raw || raw === 'null') return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}
