/**
 * 发起评审 —— 独立表单页（需求评审 / 研发评审 / UI 评审 / 测试评审）
 *
 * 设计口径：评审是需求从「方案」走向「排期」的质量闸门，因此必须留下
 * 评审对象（哪份 PRD）、时间、参与人和评审要点；结论由评审人在详情页录入，
 * 通过/退回会联动需求状态（评审通过→进入开发，退回→回到 PRD 编写）。
 */
import { useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Input, Modal, Select, Space, message } from 'antd'
import { SendOutlined } from '@ant-design/icons'
import RdmFormHeader from './components/RdmFormHeader'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { fetchEmployees } from '../../api/employee'
import {
  createReview,
  fetchDeliverySummary,
  fetchRequirementDetail,
  type RdmPrdItem,
} from '../../api/rdm'
import { RDM_REVIEW_TYPE_LABEL, type RdmReviewType } from '../../constants/rdm'
import './index.css'

const { TextArea } = Input

/** 员工下拉选项（value 为员工 id，后端参与人字段存 id） */
interface EmployeeOption {
  value: number
  label: string
}

export default function ReviewForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const reqId = Number(searchParams.get('reqId') ?? 0)
  const presetPrdId = Number(searchParams.get('prdId') ?? 0)

  const [requirement, setRequirement] = useState<{ reqNo: string; title: string } | null>(null)
  const [prds, setPrds] = useState<RdmPrdItem[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    prdId: (presetPrdId || undefined) as number | undefined,
    reviewType: undefined as RdmReviewType | undefined,
    reviewTime: null as dayjs.Dayjs | null,
    participantIds: [] as number[],
    conclusionDesc: '',
  })

  useEffect(() => {
    if (!reqId) return
    fetchRequirementDetail(reqId)
      .then(d => d && setRequirement({ reqNo: d.reqNo, title: d.title }))
      .catch(() => message.error('需求資訊載入失敗'))
    fetchDeliverySummary(reqId).then(s => setPrds(s?.prds ?? [])).catch(() => setPrds([]))
  }, [reqId])

  /** 参与人候选：在职员工前 200 人（产研团队规模内可直选，后续可换远程搜索） */
  useEffect(() => {
    fetchEmployees({ page: 1, size: 200, employmentStatus: 'active' })
      .then(res => setEmployees((res.records ?? []).map(e => ({
        value: e.id,
        label: `${e.name}（${e.empId}${e.department ? ` · ${e.department}` : ''}）`,
      }))))
      .catch(() => setEmployees([]))
  }, [])

  const reviewTypeOptions = useMemo(
    () => Object.entries(RDM_REVIEW_TYPE_LABEL).map(([value, label]) => ({ value, label })),
    [],
  )

  /** 发起评审：会通知参与人并推动状态流转，先校验→再二次确认→确认后才调接口 */
  const handleSubmit = async () => {
    if (!reqId) {
      message.warning('請先選擇需求')
      return
    }
    if (!form.reviewType) {
      message.warning('請選擇評審類型')
      return
    }
    if (form.participantIds.length === 0) {
      message.warning('請至少選擇一位評審參與人')
      return
    }
    const reviewTypeLabel = RDM_REVIEW_TYPE_LABEL[form.reviewType] ?? form.reviewType
    const targetText = requirement ? `${requirement.reqNo} · ${requirement.title}` : `#${reqId}`
    const reviewTimeText = form.reviewTime ? form.reviewTime.format('YYYY-MM-DD HH:mm') : '未定（待與參與人協調）'
    const participantCount = form.participantIds.length
    Modal.confirm({
      title: '確認發起評審？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>需求：</span><b>{targetText}</b></div>
          <div className="confirm-info-row"><span>評審類型：</span><b>{reviewTypeLabel}</b></div>
          <div className="confirm-info-row"><span>評審時間：</span><b>{reviewTimeText}</b></div>
          <div className="confirm-info-row"><span>參與人數：</span><b>{participantCount} 人</b></div>
        </div>
      ),
      okText: '確認發起',
      cancelText: '取消',
      onOk: () => submitReview(),
    })
  }

  const submitReview = async () => {
    // 拆成独立函数后类型收窄会丢失，这里重新守卫（校验已在 handleSubmit 做过，此处只做类型收窄）
    if (!reqId || !form.reviewType) return
    setSubmitting(true)
    try {
      await createReview({
        reqId,
        prdId: form.prdId,
        reviewType: form.reviewType,
        reviewTime: form.reviewTime?.format('YYYY-MM-DD HH:mm'),
        participantIds: form.participantIds,
        conclusionDesc: form.conclusionDesc.trim() || undefined,
      })
      message.success('評審已發起，參與人將收到待辦提醒')
      navigate(`/rdm-detail?id=${reqId}`)
    } catch {
      message.error('發起失敗，請重試')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="content-area">
      <RdmFormHeader
        title="發起評審"
        backText="返回需求"
        onBack={() => navigate(-1)}
        meta={requirement ? `${requirement.reqNo} · ${requirement.title}` : '評審對象、時間與參與人要寫全，避免開會才發現人齊不了'}
      />

      <div className="rdm-form-section">
        <div className="rdm-form-section-title">評審安排</div>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <LabeledField label="所屬需求">
            <Input value={requirement ? `${requirement.reqNo} ${requirement.title}` : '-'} disabled />
          </LabeledField>
          <Space size={16} wrap align="end">
            <LabeledField label="評審類型" required>
              <Select
                style={{ width: 200 }}
                placeholder="選擇評審類型"
                value={form.reviewType}
                onChange={v => setForm(prev => ({ ...prev, reviewType: v }))}
                options={reviewTypeOptions}
              />
            </LabeledField>
            <LabeledField label="計劃評審時間">
              <DatePicker
                showTime={{ format: 'HH:mm' }}
                format="YYYY-MM-DD HH:mm"
                style={{ width: 220 }}
                placeholder="可選，稍後再定"
                value={form.reviewTime}
                onChange={v => setForm(prev => ({ ...prev, reviewTime: v }))}
              />
            </LabeledField>
          </Space>
          <LabeledField label="關聯 PRD">
            <Select
              style={{ width: 460 }}
              allowClear
              placeholder={prds.length ? '可選，默認針對整體需求' : '該需求暫無 PRD'}
              value={form.prdId}
              onChange={v => setForm(prev => ({ ...prev, prdId: v }))}
              options={prds.map(p => ({ value: p.id, label: `${p.prdNo} ${p.title}` }))}
            />
          </LabeledField>
          <LabeledField label="參與人" required>
            <Select
              mode="multiple"
              style={{ width: '100%', maxWidth: 720 }}
              placeholder="搜索姓名/工號選擇評審參與人"
              value={form.participantIds}
              onChange={v => setForm(prev => ({ ...prev, participantIds: v }))}
              options={employees}
              optionFilterProp="label"
              maxTagCount="responsive"
            />
          </LabeledField>
          <LabeledField label="評審要點 / 待確認問題">
            <TextArea
              rows={4}
              value={form.conclusionDesc}
              placeholder="例：1. 導出上限是否與權限體系衝突；2. 跨月口徑由誰確認；3. 是否需要灰度"
              onChange={e => setForm(prev => ({ ...prev, conclusionDesc: e.target.value }))}
            />
          </LabeledField>
        </Space>
      </div>

      <div className="form-footer">
        <Button onClick={() => navigate(-1)}>取消</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>發起評審</Button>
      </div>
    </div>
  )
}

/** 带标签的字段容器（与 PRD/任务/变更表单页保持同一视觉口径） */
function LabeledField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>
        {required && <span style={{ color: '#FF4D4F', marginRight: 4 }}>*</span>}
        {label}
      </div>
      {children}
    </div>
  )
}
