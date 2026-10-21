/**
 * 发起评审 —— 独立表单页（需求评审 / 研发评审 / UI 评审 / 测试评审，支持多选）
 *
 * 设计口径：评审是需求从「方案」走向「排期」的质量闸门，因此必须留下
 * 评审对象（哪份 PRD）、时间、参与人和评审要点；结论由评审人在详情页录入，
 * 通过/退回会联动需求状态（评审通过→进入开发，退回→回到 PRD 编写）。
 *
 * 评审类型多选口径：现实中研发/测试/UI 常一起组织评审，拆成多条记录会造成
 * 重复通知与重复排期；故前端以逗号拼接写入既有 reviewType 字符串字段
 * （VARCHAR(24)，四类全选恰好容纳），展示统一走 formatRdmReviewTypes 反查标签。
 */
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, Modal, Select, message } from 'antd'
import { AuditOutlined, SendOutlined } from '@ant-design/icons'
import RdmFormHeader from './components/RdmFormHeader'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import EmployeeSelect from '../MeetingManagement/EmployeeSelect'
import RemarkTextArea from '../../components/RemarkTextArea'
import {
  createReview,
  fetchDeliverySummary,
  fetchRequirementDetail,
  type RdmPrdItem,
} from '../../api/rdm'
import {
  RDM_REVIEW_TYPE_LABEL,
  RDM_STATUS,
  formatRdmReqNo,
  formatRdmReviewTypes,
  type RdmReviewType,
} from '../../constants/rdm'
import './index.css'

/**
 * PRD / 評審可寫的需求狀態：受理之後（含受理當下）、排期之前。
 * <p>與後端 RdmDeliveryServiceImpl.PRD_PHASE_STATUSES 同源；評估中就發評審，
 * 會出現「需求還沒接受，評審已通過」的自相矛盾流轉。
 */
const PRD_PHASE_STATUSES: string[] = [
  RDM_STATUS.ACCEPTED,
  RDM_STATUS.PRD_DESIGNING,
  RDM_STATUS.REVIEWING,
  RDM_STATUS.REVIEW_PASSED,
]

/** 表单字段值：评审类型多选，提交时逗号拼接适配既有接口契约 */
interface ReviewFormValues {
  reviewTypes: RdmReviewType[]
  reviewTime: dayjs.Dayjs | null
  prdId?: number
  participantIds: number[]
  conclusionDesc?: string
}

export default function ReviewForm() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const reqId = Number(searchParams.get('reqId') ?? 0)
  const presetPrdId = Number(searchParams.get('prdId') ?? 0)

  const [form] = Form.useForm<ReviewFormValues>()
  const [requirement, setRequirement] = useState<{ reqNo: string; title: string; status: string } | null>(null)
  const [prds, setPrds] = useState<RdmPrdItem[]>([])
  /** PRD 列表是否真的拉成功：拉失败时不用空列表冒充「没有 PRD」把提交永久禁用 */
  const [prdsLoaded, setPrdsLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!reqId) return
    fetchRequirementDetail(reqId)
      .then(d => d && setRequirement({ reqNo: formatRdmReqNo(d.reqNo), title: d.title, status: String(d.status) }))
      .catch(() => message.error(t('rdm.reviewForm.reqLoadFail')))
    fetchDeliverySummary(reqId)
      .then(s => { setPrds(s?.prds ?? []); setPrdsLoaded(true) })
      .catch(() => setPrds([]))
  }, [reqId, t])

  /** 受理前不能发起评审（后端同样会拒）；PRD 列表取到且为空时也无对象可评 */
  const phaseBlocked = !!requirement && !PRD_PHASE_STATUSES.includes(requirement.status)
  const noPrd = prdsLoaded && !!requirement && prds.length === 0 && !phaseBlocked
  const submitBlocked = phaseBlocked || noPrd

  const reviewTypeOptions = useMemo(
    () => Object.entries(RDM_REVIEW_TYPE_LABEL).map(([value, label]) => ({ value, label })),
    [],
  )

  /** 发起评审：会通知参与人并推动状态流转，先校验→再二次确认→确认后才调接口 */
  const handleSubmit = async () => {
    if (!reqId) {
      message.warning(t('rdm.reviewForm.needReq'))
      return
    }
    if (phaseBlocked) {
      message.warning('需求尚未受理，請先接受需求後再發起評審')
      return
    }
    if (noPrd) {
      message.warning('請先編寫 PRD，再發起評審')
      return
    }
    let values: ReviewFormValues
    try {
      values = await form.validateFields()
    } catch {
      // 字段级错误已由 Form.Item 红字提示，不再重复弹窗
      return
    }
    const targetText = requirement ? `${requirement.reqNo} · ${requirement.title}` : `#${reqId}`
    const reviewTimeText = values.reviewTime ? values.reviewTime.format('YYYY-MM-DD HH:mm') : t('rdm.reviewForm.timeTbd')
    Modal.confirm({
      title: t('rdm.reviewForm.confirmTitle'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('rdm.reviewForm.confirmReq')}</span><b>{targetText}</b></div>
          <div className="confirm-info-row"><span>{t('rdm.reviewForm.confirmType')}</span><b>{formatRdmReviewTypes(values.reviewTypes.join(','))}</b></div>
          <div className="confirm-info-row"><span>{t('rdm.reviewForm.confirmTime')}</span><b>{reviewTimeText}</b></div>
          <div className="confirm-info-row"><span>{t('rdm.reviewForm.confirmCount')}</span><b>{t('rdm.reviewForm.confirmCountValue', { count: values.participantIds.length })}</b></div>
        </div>
      ),
      okText: t('rdm.reviewForm.confirmOk'),
      cancelText: t('common:cancel'),
      onOk: () => submitReview(values),
    })
  }

  const submitReview = async (values: ReviewFormValues) => {
    setSubmitting(true)
    try {
      await createReview({
        reqId,
        prdId: values.prdId,
        reviewType: values.reviewTypes.join(','),
        reviewTime: values.reviewTime?.format('YYYY-MM-DD HH:mm'),
        participantIds: values.participantIds,
        conclusionDesc: values.conclusionDesc?.trim() || undefined,
      })
      message.success(t('rdm.reviewForm.submitSuccess'))
      navigate(`/rdm-detail?id=${reqId}`)
    } catch (err) {
      // request.ts 已统一弹错误提示，此处仅日志与状态恢复，避免双弹（§G.4）
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="content-area">
      <RdmFormHeader
        title={t('rdm.reviewForm.title')}
        backText={t('rdm.reviewForm.backToReq')}
        onBack={() => navigate(-1)}
        meta={requirement ? `${requirement.reqNo} · ${requirement.title}` : t('rdm.reviewForm.metaHint')}
      />

      {phaseBlocked && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="需求尚未受理，暫時不能發起評審"
          description="請先由產品經理在需求詳情頁「接受需求」，再按「編寫 PRD → 發起評審」的順序推進。"
        />
      )}
      {noPrd && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="尚未編寫 PRD"
          description="評審要針對具體方案給出結論，請先在需求詳情頁「編寫 PRD」，再回來發起評審。"
        />
      )}

      <div className="rdm-form-section">
        {/* 模块标题行：图标色块 + 标题 + 延伸分隔线 + 右侧说明（§C.3） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AuditOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('rdm.reviewForm.sectionTitle')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.reviewForm.sectionNote')}</span>
        </div>

        <Form
          layout="vertical"
          form={form}
          initialValues={{ reviewTypes: [], participantIds: [], prdId: presetPrdId || undefined, conclusionDesc: '' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
            <Form.Item label={t('rdm.reviewForm.reqLabel')} style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
              <Input value={requirement ? `${requirement.reqNo} ${requirement.title}` : '-'} disabled />
            </Form.Item>
            <Form.Item
              name="reviewTypes"
              label={t('rdm.reviewForm.typeLabel')}
              rules={[{ required: true, type: 'array', min: 1, message: t('rdm.reviewForm.typeRequired') }]}
              style={{ marginBottom: 0 }}
            >
              <Select
                mode="multiple"
                placeholder={t('rdm.reviewForm.typePlaceholder')}
                options={reviewTypeOptions}
                maxTagCount="responsive"
              />
            </Form.Item>
            <Form.Item name="reviewTime" label={t('rdm.reviewForm.timeLabel')} style={{ marginBottom: 0 }}>
              <DatePicker
                showTime={{ format: 'HH:mm' }}
                format="YYYY-MM-DD HH:mm"
                style={{ width: '100%' }}
                placeholder={t('rdm.reviewForm.timePlaceholder')}
              />
            </Form.Item>
            <Form.Item name="prdId" label={t('rdm.reviewForm.prdLabel')} style={{ marginBottom: 0 }}>
              <Select
                allowClear
                placeholder={prds.length ? t('rdm.reviewForm.prdPlaceholder') : t('rdm.reviewForm.prdEmptyPlaceholder')}
                options={prds.map(p => ({ value: p.id, label: `${p.prdNo} ${p.title}` }))}
              />
            </Form.Item>
            <Form.Item
              name="participantIds"
              label={t('rdm.reviewForm.participantLabel')}
              rules={[{ required: true, type: 'array', min: 1, message: t('rdm.reviewForm.participantRequired') }]}
              style={{ gridColumn: '1 / -1', marginBottom: 0 }}
            >
              <EmployeeSelect placeholder={t('rdm.reviewForm.participantPlaceholder')} />
            </Form.Item>
            <Form.Item name="conclusionDesc" label={t('rdm.reviewForm.pointsLabel')} style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
              <RemarkTextArea placeholder={t('rdm.reviewForm.pointsPlaceholder')} />
            </Form.Item>
          </div>
        </Form>
      </div>

      <div className="form-footer">
        <Button onClick={() => navigate(-1)}>{t('common:cancel')}</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} disabled={submitBlocked} onClick={handleSubmit}>
          {t('rdm.reviewForm.submitBtn')}
        </Button>
      </div>
    </div>
  )
}
