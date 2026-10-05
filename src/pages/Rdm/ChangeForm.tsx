/**
 * 需求变更申请 —— 独立表单页（走 OA 审批）
 *
 * 设计口径：变更不是「口头改需求」，必须留痕并让审批人一眼看清代价。
 * 因此表单强制：变更后内容 + 变更原因必填；勾选「影响排期」时必须给出新的计划上线日期，
 * 审批通过后系统会回填计划上线日期并累加变更次数（是否回炉重排由产品经理显式决定）。
 * 提交顺序：表单校验 → 二次确认弹窗 → 调接口（禁止先弹框后校验）。
 */
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Checkbox, DatePicker, Input, InputNumber, Modal, Select, Space, message } from 'antd'
import { SendOutlined } from '@ant-design/icons'
import RdmFormHeader from './components/RdmFormHeader'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../../contexts/AuthContext'
import {
  applyChange,
  fetchDeliverySummary,
  fetchRequirementDetail,
  type RdmPrdItem,
} from '../../api/rdm'
import { RDM_CHANGE_TYPE, RDM_CHANGE_TYPE_LABEL, type RdmChangeType } from '../../constants/rdm'
import './index.css'

const { TextArea } = Input

/** 变更类型选项（顺序按发生频率：范围 > 排期 > 验收标准 > 优先级） */
const CHANGE_TYPE_OPTIONS = [
  RDM_CHANGE_TYPE.SCOPE,
  RDM_CHANGE_TYPE.SCHEDULE,
  RDM_CHANGE_TYPE.CRITERION,
  RDM_CHANGE_TYPE.PRIORITY,
  RDM_CHANGE_TYPE.OTHER,
].map(value => ({ value, label: RDM_CHANGE_TYPE_LABEL[value] }))

export default function ChangeForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const reqId = Number(searchParams.get('reqId') ?? 0)
  const { user } = useAuth()

  const [requirement, setRequirement] = useState<{ reqNo: string; title: string; planReleaseDate?: string | null } | null>(null)
  const [prds, setPrds] = useState<RdmPrdItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    prdId: undefined as number | undefined,
    changeType: RDM_CHANGE_TYPE.SCOPE as RdmChangeType,
    afterContent: '',
    reason: '',
    impactDesc: '',
    affectsSchedule: false,
    addedHours: undefined as number | undefined,
    newPlanReleaseDate: null as dayjs.Dayjs | null,
  })

  useEffect(() => {
    if (!reqId) return
    fetchRequirementDetail(reqId)
      .then(d => d && setRequirement({ reqNo: d.reqNo, title: d.title, planReleaseDate: d.planReleaseDate }))
      .catch(() => message.error('需求資訊載入失敗'))
    fetchDeliverySummary(reqId).then(summary => setPrds(summary?.prds ?? [])).catch(() => setPrds([]))
  }, [reqId])

  const changeTypeLabel = useMemo(
    () => RDM_CHANGE_TYPE_LABEL[form.changeType] ?? form.changeType,
    [form.changeType],
  )

  /** 校验：先表单后弹框，避免用户在确认框里点提交才发现漏填 */
  const validate = (): boolean => {
    if (!reqId) {
      message.warning('請先選擇需求')
      return false
    }
    if (!form.afterContent.trim()) {
      message.warning('請填寫變更後的內容（審批人以此判斷影響）')
      return false
    }
    if (!form.reason.trim()) {
      message.warning('請填寫變更原因')
      return false
    }
    if (form.affectsSchedule && !form.newPlanReleaseDate) {
      message.warning('勾選「影響排期」後必須選擇新的計劃上線日期')
      return false
    }
    return true
  }

  const handleSubmit = () => {
    if (!validate()) return
    Modal.confirm({
      title: '確認提交變更申請？',
      className: 'custom-confirm-modal',
      icon: (
        <div className="confirm-icon-wrapper">
          <span className="confirm-icon-text">!</span>
        </div>
      ),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>申請人：</span><b>{user?.name ?? '-'}（{user?.empId ?? '-'}）</b></div>
          <div className="confirm-info-row"><span>需求：</span><b>{requirement ? `${requirement.reqNo} ${requirement.title}` : '-'}</b></div>
          <div className="confirm-info-row"><span>變更類型：</span><b>{changeTypeLabel}</b></div>
          <div className="confirm-info-row"><span>影響排期：</span><b>{form.affectsSchedule ? `是，新計劃上線 ${form.newPlanReleaseDate?.format('YYYY-MM-DD')}` : '否'}</b></div>
          {form.addedHours != null && (
            <div className="confirm-info-row"><span>增加工時：</span><b>{form.addedHours} 小時</b></div>
          )}
          <div className="confirm-info-row"><span>變更原因：</span><b>{form.reason.trim()}</b></div>
        </div>
      ),
      okText: '確認提交',
      cancelText: '返回修改',
      onOk: async () => {
        setSubmitting(true)
        try {
          const res = await applyChange({
            reqId,
            prdId: form.prdId,
            changeType: form.changeType,
            afterContent: form.afterContent.trim(),
            reason: form.reason.trim(),
            impactDesc: form.impactDesc.trim() || undefined,
            affectsSchedule: form.affectsSchedule,
            addedHours: form.addedHours,
            newPlanReleaseDate: form.affectsSchedule ? form.newPlanReleaseDate?.format('YYYY-MM-DD') : undefined,
          })
          message.success(`變更申請已提交審批${res?.changeNo ? `（${res.changeNo}）` : ''}`)
          navigate(`/rdm-detail?id=${reqId}`)
        } catch {
          message.error('提交失敗，請重試')
          throw new Error('submit failed') // 保持弹窗打开，便于用户重试
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  return (
    <div className="content-area">
      {/* ── 页面头部（统一组件，保证渐变条/标题色/返回钮与规范一致）── */}
      <RdmFormHeader
        title="需求變更申請"
        backText="返回需求"
        onBack={() => navigate(-1)}
        meta={requirement ? `${requirement.reqNo} · ${requirement.title}` : '變更需經審批，通過後系統才承認新的口徑與排期'}
      />

      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="變更會累計到需求的變更次數，並進入交付風險統計；若已開發的範圍被改動，請務必寫清返工內容，方便審批人判斷代價。"
      />

      <div className="rdm-form-section">
        <div className="rdm-form-section-title">變更信息</div>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <LabeledField label="所屬需求">
            <Input value={requirement ? `${requirement.reqNo} ${requirement.title}` : '-'} disabled />
          </LabeledField>
          <LabeledField label="變更類型" required>
            <Select
              style={{ width: 240 }}
              value={form.changeType}
              onChange={v => setForm(prev => ({ ...prev, changeType: v }))}
              options={CHANGE_TYPE_OPTIONS}
            />
          </LabeledField>
          <LabeledField label="關聯 PRD（改哪份方案就選哪個）">
            <Select
              style={{ width: 460 }}
              allowClear
              placeholder={prds.length ? '可選，默認針對整體需求' : '該需求暫無 PRD'}
              value={form.prdId}
              onChange={v => setForm(prev => ({ ...prev, prdId: v }))}
              options={prds.map(p => ({ value: p.id, label: `${p.prdNo} ${p.title}` }))}
            />
          </LabeledField>
          <LabeledField label="變更後的內容" required>
            <TextArea
              rows={4}
              value={form.afterContent}
              maxLength={2000}
              showCount
              placeholder="寫成可執行的新口徑，例：導出區間上限由 90 天調整為 180 天，並增加按月快捷選擇"
              onChange={e => setForm(prev => ({ ...prev, afterContent: e.target.value }))}
            />
          </LabeledField>
          <LabeledField label="變更原因" required>
            <TextArea
              rows={3}
              value={form.reason}
              placeholder="例：財務月末對賬需跨月一次性導出，90 天限制導致需多次拼接"
              onChange={e => setForm(prev => ({ ...prev, reason: e.target.value }))}
            />
          </LabeledField>
        </Space>
      </div>

      <div className="rdm-form-section">
        <div className="rdm-form-section-title">影響評估</div>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <LabeledField label="影響說明（返工內容 / 依賴方 / 風險）">
            <TextArea
              rows={3}
              value={form.impactDesc}
              placeholder="例：後端導出接口需改造，前端選擇器需調整，預計影響 2 人日；已聯調的報表模組需回歸"
              onChange={e => setForm(prev => ({ ...prev, impactDesc: e.target.value }))}
            />
          </LabeledField>
          <Space size={16} wrap align="end">
            <div>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>增加工時（小時）</div>
              <InputNumber
                min={0}
                step={1}
                style={{ width: 150 }}
                placeholder="例：16"
                value={form.addedHours}
                onChange={v => setForm(prev => ({ ...prev, addedHours: v ?? undefined }))}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>計劃上線（現）</div>
              <Input style={{ width: 150 }} value={requirement?.planReleaseDate ?? '-'} disabled />
            </div>
          </Space>
          <Checkbox
            checked={form.affectsSchedule}
            onChange={e => setForm(prev => ({ ...prev, affectsSchedule: e.target.checked }))}
          >
            本次變更影響排期（勾選後需填寫新的計劃上線日期）
          </Checkbox>
          {form.affectsSchedule && (
            <LabeledField label="新的計劃上線日期" required>
              <DatePicker
                style={{ width: 220 }}
                value={form.newPlanReleaseDate}
                onChange={v => setForm(prev => ({ ...prev, newPlanReleaseDate: v }))}
              />
            </LabeledField>
          )}
        </Space>
      </div>

      <div className="form-footer">
        <Button onClick={() => navigate(-1)}>取消</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>提交變更申請</Button>
      </div>
    </div>
  )
}

/** 带标签的字段容器（与 PRD/任务表单页保持同一视觉口径） */
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
