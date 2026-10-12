/**
 * 考勤异常处理 —— 独立表单页（不使用弹窗）
 *
 * 定位：这是**管理员处理入口**，三种动作都直接生效并留痕：
 * ① 补录打卡（来源码单独记为「人工補錄」，事后可与真实打卡区分）
 * ② 关联已核准假单抵扣（后端回查同人/区间/审批状态，前端传的只有假单 ID）
 * ③ 确认异常无误（不抵扣，说明落 handle_remark）
 *
 * 员工自助的补卡/请假/加班申请仍在流程中心发起，审批通过后由 OA 回调自动回写本页状态，
 * 因此这里不复制审批操作区（遵守流程入口统一原则）。
 *
 * 交互口径：提交类按钮必须走「表单校验 → Modal.confirm 二次确认 → 调接口」的固定顺序，
 * 三种动作都会改变薪酬扣减口径，不能点了就生效。
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Alert, Button, Descriptions, Form, Modal, Radio, Select, Tag, TimePicker, message,
} from 'antd'
import {
  ArrowLeftOutlined, ExclamationCircleOutlined, FileProtectOutlined, SendOutlined,
  SolutionOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import RemarkTextArea from '../../components/RemarkTextArea'
import {
  EXCEPTION_STATUS, EXCEPTION_TYPE, confirmExceptions, deductExceptionByLeave, fetchExceptionDetail,
  fetchLeaveCandidates, reissuePunch, type ExceptionVO, type LeaveCandidate,
} from '../../api/attendance'
import { EXCEPTION_STATUS_LABEL_KEY, EXCEPTION_STATUS_TAG_COLOR, EXCEPTION_TYPE_LABEL_KEY, EXCEPTION_TYPE_TAG_COLOR } from './meta'
import '@/styles/components.css'

/** 处理方式：补录打卡 / 关联既有假单 / 确认异常无误。
 *  不含「加班抵扣」——系统内还没有加班单据，放一个选了就报错的选项比不提供更糟。 */
type HandleWay = 'reissue' | 'leave' | 'confirm'

interface HandleFormValues {
  way: HandleWay
  onTime?: Dayjs
  offTime?: Dayjs
  leaveId?: number
  remark?: string
}

export default function AttendanceExceptionHandle() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id')

  const [form] = Form.useForm<HandleFormValues>()
  const [record, setRecord] = useState<ExceptionVO | null>(null)
  const [candidates, setCandidates] = useState<LeaveCandidate[]>([])
  const [way, setWay] = useState<HandleWay>('reissue')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const detail = await fetchExceptionDetail(Number(id))
      setRecord(detail)
      setLoadFailed(false)
      // 只有缺卡/旷工可以被假单抵扣（迟到早退是分钟级偏差），据此决定是否加载候选
      if (detail.status === EXCEPTION_STATUS.PENDING) {
        fetchLeaveCandidates(Number(id)).then(setCandidates).catch(() => setCandidates([]))
      }
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const handleBack = () => navigate('/attendance-exception')

  const typeLabel = (code?: number | null) => {
    const key = code == null ? undefined : EXCEPTION_TYPE_LABEL_KEY[code]
    return key ? t(key) : String(code ?? '-')
  }
  const statusLabel = (code?: number | null) => {
    const key = code == null ? undefined : EXCEPTION_STATUS_LABEL_KEY[code]
    return key ? t(key) : String(code ?? '-')
  }

  /** 三种动作的确认文案与执行体：先校验、再弹框、最后调接口，顺序不可颠倒 */
  const buildAction = (values: HandleFormValues) => {
    if (!record) return null
    const numericId = Number(id)
    if (values.way === 'reissue') {
      const workDate = record.workDate
      const onTime = values.onTime ? `${workDate} ${values.onTime.format('HH:mm:ss')}` : ''
      /*
       * TimePicker 只给时分，日期必须由考勤日推导：直接用控件值会拿到「今天」，
       * 补录历史日期时就会被后端“补卡时间必须落在考勤日当天”拦住。
       * 下班时刻早于上班时刻 = 跨天夜班，归次日凌晨（与后端校验口径一致）。
       */
      let offTime: string | null = null
      if (values.offTime) {
        const crossDay = values.onTime ? values.offTime.isBefore(values.onTime) : false
        const offDate = crossDay ? dayjs(workDate).add(1, 'day').format('YYYY-MM-DD') : workDate
        offTime = `${offDate} ${values.offTime.format('HH:mm:ss')}`
      }
      return {
        title: t('attendance.reissueConfirmTitle'),
        rows: [
          [t('attendance.reissueOnTime'), onTime],
          [t('attendance.reissueOffTime'), offTime ?? t('attendance.reissueOffOptional')],
          [t('attendance.reissueEffect'), t('attendance.reissueEffectHint')],
        ] as Array<[string, string]>,
        run: () => reissuePunch(numericId, { onTime, offTime, reason: (values.remark ?? '').trim() }),
        success: t('attendance.reissueSuccess'),
      }
    }
    if (values.way === 'leave') {
      const leave = candidates.find(c => c.id === values.leaveId)
      return {
        title: t('attendance.leaveConfirmTitle'),
        rows: [
          [t('attendance.leaveReqNo'), leave?.reqNo ?? '-'],
          [t('attendance.leavePeriod'), `${leave?.startDate ?? '-'} ~ ${leave?.endDate ?? '-'}`],
          [t('attendance.leaveEffect'), t('attendance.leaveEffectHint')],
        ] as Array<[string, string]>,
        run: () => deductExceptionByLeave(numericId, Number(values.leaveId)),
        success: t('attendance.leaveSuccess'),
      }
    }
    return {
      title: t('attendance.confirmDialogTitle'),
      rows: [
        [t('attendance.confirmCountLabel'), t('common.selectedCount', { count: 1 })],
        [t('attendance.confirmConsequence'), ''],
      ] as Array<[string, string]>,
      run: () => confirmExceptions([numericId], (values.remark ?? '').trim() || undefined),
      success: t('attendance.confirmedSuccess', { affected: 1 }),
    }
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const action = buildAction(values)
    if (!action) return
    Modal.confirm({
      title: action.title,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('attendance.colEmpName')}：</span>
            <b>{record?.empName}（{record?.empNo}）</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('attendance.colWorkDate')}：</span><b>{record?.workDate}</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('attendance.colExceptionType')}：</span>
            <b>{typeLabel(record?.exceptionType)} · {record?.detail}</b>
          </div>
          {action.rows.map(([label, value]) => (
            <div className="confirm-info-row" key={label}>
              <span>{label}：</span><b>{value}</b>
            </div>
          ))}
        </div>
      ),
      onOk: async () => {
        setSubmitting(true)
        try {
          await action.run()
          message.success(action.success)
          handleBack()
        } catch {
          // 请求层已统一提示（月份已冻结、假单区间不符、补卡时间重复等）
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  if (loadFailed) {
    return (
      <div className="content-area" style={{ padding: '20px 24px' }}>
        <Alert
          type="error"
          showIcon
          message={t('common.loadFailed')}
          action={<Button size="small" onClick={load}>{t('common.reset')}</Button>}
        />
      </div>
    )
  }

  if (!record) {
    return (
      <div className="content-area" style={{ padding: '20px 24px' }}>
        <div style={{ padding: 40, textAlign: 'center', color: '#8C8C8C' }}>
          {loading ? t('common.loading') : t('attendance.exceptionNotFound')}
        </div>
      </div>
    )
  }

  // 已处理的异常只读：状态是审批与薪酬的依据，不允许二次改写
  const alreadyHandled = record.status !== EXCEPTION_STATUS.PENDING
  // 只有缺卡与旷工可以被假单抵扣（与后端 LEAVE_DEDUCTIBLE_TYPES 一致），迟到/早退必须走确认或补卡
  const leaveDeductible = record.exceptionType === EXCEPTION_TYPE.MISSING_CARD
    || record.exceptionType === EXCEPTION_TYPE.ABSENT

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button
            type="primary"
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36,
              padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
            }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
            {t('attendance.handlePageTitle')}
          </h2>
          <Tag color={EXCEPTION_STATUS_TAG_COLOR[record.status] ?? 'default'} style={{ marginLeft: 8 }}>
            {statusLabel(record.status)}
          </Tag>
        </div>
      </div>

      <Alert type="info" showIcon message={t('attendance.handlePageHint')} style={{ marginBottom: 16 }} />
      {alreadyHandled && (
        <Alert
          type="warning"
          showIcon
          message={t('attendance.alreadyHandledHint', {
            handler: record.handler ?? '-',
            handledAt: record.handledAt ?? '-',
          })}
          style={{ marginBottom: 16 }}
        />
      )}

      <div style={{
        borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <Descriptions column={3} size="small" bordered>
          <Descriptions.Item label={t('attendance.colEmpNo')}>{record.empNo}</Descriptions.Item>
          <Descriptions.Item label={t('attendance.colEmpName')}>{record.empName}</Descriptions.Item>
          <Descriptions.Item label={t('attendance.colDept')}>{record.deptName || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('attendance.colGroup')}>{record.groupName || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('attendance.colWorkDate')}>{record.workDate}</Descriptions.Item>
          <Descriptions.Item label={t('attendance.colExceptionType')}>
            <Tag color={EXCEPTION_TYPE_TAG_COLOR[record.exceptionType] ?? 'default'}>
              {typeLabel(record.exceptionType)}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('attendance.colExceptionDetail')} span={2}>
            {record.detail || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('common.colFlowNo')}>{record.flowNo || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('attendance.colHandler')}>{record.handler || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('attendance.colHandledAt')}>{record.handledAt || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('attendance.colHandleRemark')}>{record.handleRemark || '-'}</Descriptions.Item>
        </Descriptions>
      </div>

      <Form
        form={form}
        layout="vertical"
        disabled={alreadyHandled}
        initialValues={{ way: 'reissue' }}
      >
        <div style={{
          borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <Form.Item label={t('attendance.wayLabel')} name="way" rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              onChange={e => setWay(e.target.value as HandleWay)}
              options={[
                { value: 'reissue', label: t('attendance.wayReissue') },
                // 迟到/早退不能用假单抵扣：选项直接不出现，比选了再报错更清楚
                ...(leaveDeductible ? [{ value: 'leave', label: t('attendance.wayLeave') }] : []),
                { value: 'confirm', label: t('attendance.wayConfirm') },
              ]}
            />
          </Form.Item>

          {way === 'reissue' && (
            <>
              <Alert type="info" showIcon message={t('attendance.reissueHint')} style={{ marginBottom: 16 }} />
              <Form.Item
                label={t('attendance.reissueOnTime')}
                name="onTime"
                rules={[{ required: true, message: t('attendance.reissueOnRequired') }]}
                extra={t('attendance.reissueDateFixed', { date: record.workDate })}
              >
                <TimePicker format="HH:mm" style={{ width: 220 }} placeholder={t('common.pleaseSelect')} />
              </Form.Item>
              <Form.Item
                label={t('attendance.reissueOffTime')}
                name="offTime"
                extra={t('attendance.reissueOffHint')}
              >
                <TimePicker format="HH:mm" style={{ width: 220 }} placeholder={t('common.placeholderSelect')} />
              </Form.Item>
            </>
          )}

          {way === 'leave' && (
            <>
              <Alert type="info" showIcon message={t('attendance.leaveHint')} style={{ marginBottom: 16 }} />
              <Form.Item
                label={t('attendance.leaveReqNo')}
                name="leaveId"
                rules={[{ required: true, message: t('attendance.leaveRequired') }]}
                extra={candidates.length === 0 ? t('attendance.leaveNoCandidate') : undefined}
              >
                <Select
                  style={{ width: 420 }}
                  placeholder={t('common.pleaseSelect')}
                  options={candidates.map(c => ({
                    value: c.id,
                    label: `${c.reqNo} · ${c.startDate} ~ ${c.endDate} · ${c.days ?? '-'} ${t('attendance.dayUnit')}`,
                  }))}
                />
              </Form.Item>
            </>
          )}

          {way === 'confirm' && (
            <Alert type="warning" showIcon message={t('attendance.confirmWayHint')} style={{ marginBottom: 16 }} />
          )}

          {/* 补录与确认都必须留说明：这是事后唯一的合规解释凭据 */}
          {way !== 'leave' && (
            <Form.Item
              label={t('attendance.colHandleRemark')}
              name="remark"
              rules={way === 'reissue' ? [{ required: true, message: t('attendance.reissueReasonRequired') }] : []}
              style={{ marginBottom: 0 }}
            >
              <RemarkTextArea placeholder={t('attendance.handleRemarkPlaceholder')} />
            </Form.Item>
          )}
        </div>
      </Form>

      {!alreadyHandled && (
        <div className="form-footer">
          <Button onClick={handleBack}>{t('common.cancel')}</Button>
          <Button
            type="primary"
            icon={way === 'confirm' ? <ExclamationCircleOutlined /> : <SendOutlined />}
            loading={submitting}
            onClick={handleSubmit}
          >
            {t('attendance.submitHandle')}
          </Button>
        </div>
      )}

      {/* 员工自助申请的入口留在流程中心，本页不复制审批操作区 */}
      <div style={{ marginTop: 16, color: '#8C8C8C', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <SolutionOutlined />
        <span>{t('attendance.handleFlowHint')}</span>
        <Button type="link" size="small" icon={<FileProtectOutlined />} onClick={() => navigate('/process-center')}>
          {t('attendance.goProcessCenter')}
        </Button>
        {record.flowNo && (
          <Button type="link" size="small" onClick={() => navigate(`/hr-flow-detail?flowNo=${record.flowNo}`)}>
            {t('attendance.viewFlowDetail')}
          </Button>
        )}
      </div>
    </div>
  )
}
