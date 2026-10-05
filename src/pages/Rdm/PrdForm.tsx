/**
 * PRD 编写 —— 独立表单页
 *
 * 产品经理把业务需求拆成可交付的 PRD：目标用户、功能清单、验收标准是必填三件套，
 * 验收标准会直接成为业务验收页的检查项来源（写不清 = 验收扯皮）。
 */
import { useEffect, useState } from 'react'
import { Alert, Button, Input, Modal, Select, Space, message } from 'antd'
import { BulbOutlined, SaveOutlined } from '@ant-design/icons'
import RdmFormHeader from './components/RdmFormHeader'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchDeliverySummary,
  fetchRequirementDetail,
  generatePrdDraft,
  savePrd,
  type RdmPrdItem,
} from '../../api/rdm'
import { RDM_PRD_STATUS_LABEL, type RdmPrdStatus } from '../../constants/rdm'
import './index.css'

/** 按行统计条目数（确认框里给用户看“写了多少条”，避免空有标题） */
function countLines(text: string): number {
  return text.split('\n').map(s => s.trim()).filter(Boolean).length
}

const { TextArea } = Input

export default function PrdForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const reqId = Number(searchParams.get('reqId') ?? 0)
  const prdId = Number(searchParams.get('id') ?? 0)

  const [requirement, setRequirement] = useState<{ reqNo: string; title: string; expectResult?: string | null } | null>(null)
  const [siblings, setSiblings] = useState<RdmPrdItem[]>([])
  const [saving, setSaving] = useState(false)
  /** AI 草稿生成中与提示（草稿只进表单，不自动保存） */
  const [aiLoading, setAiLoading] = useState(false)
  const [aiNotice, setAiNotice] = useState<{ text: string; ok: boolean } | null>(null)
  const [form, setForm] = useState({
    title: '',
    parentPrdId: undefined as number | undefined,
    targetUsers: '',
    featureList: '',
    acceptanceCriteria: '',
    prototypeUrl: '',
    contentRich: '',
  })

  useEffect(() => {
    if (!reqId) return
    fetchRequirementDetail(reqId).then(d => {
      if (!d) return
      setRequirement({ reqNo: d.reqNo, title: d.title, expectResult: d.expectResult })
    }).catch(() => message.error('需求資訊載入失敗'))
  }, [reqId])

  /** 编辑态回填；同时取同需求下的 PRD 作为「父 PRD」候选（逐级拆解） */
  useEffect(() => {
    if (!reqId) return
    fetchDeliverySummary(reqId).then(summary => {
      if (!summary) return
      setSiblings(summary.prds.filter(p => p.id !== prdId))
      const current = summary.prds.find(p => p.id === prdId)
      if (current) {
        setForm({
          title: current.title,
          parentPrdId: current.parentPrdId ?? undefined,
          targetUsers: current.targetUsers ?? '',
          featureList: current.featureList ?? '',
          acceptanceCriteria: current.acceptanceCriteria ?? '',
          prototypeUrl: current.prototypeUrl ?? '',
          contentRich: current.contentRich ?? '',
        })
      }
    }).catch(() => message.error('PRD 資訊載入失敗'))
  }, [reqId, prdId])

  /**
   * 生成 PRD 草稿。
   * <p>只填入表单、不自动保存：AI 产物必须经产品经理逐条确认后才能入库，
   * 否则验收标准会被不成立的描述污染，后续业务验收直接扯皮。
   */
  const handleAiDraft = async () => {
    if (!reqId) {
      message.warning('請先選擇需求')
      return
    }
    setAiLoading(true)
    setAiNotice(null)
    try {
      const draft = await generatePrdDraft(reqId)
      if (!draft) {
        setAiNotice({ text: 'AI 未返回草稿，請手工填寫', ok: false })
        return
      }
      if (!draft.aiGenerated) {
        setAiNotice({ text: draft.notice ?? 'AI 暫不可用，請手工填寫', ok: false })
        return
      }
      setForm(prev => ({
        ...prev,
        title: prev.title || draft.title || '',
        targetUsers: draft.targetUsers ?? prev.targetUsers,
        featureList: (draft.featureList ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n'),
        acceptanceCriteria: (draft.acceptanceCriteria ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n'),
        contentRich: [prev.contentRich, draft.boundary ? `【範圍邊界】${draft.boundary}` : '', draft.risks ? `【風險與依賴】${draft.risks}` : '']
          .filter(Boolean).join('\n'),
      }))
      setAiNotice({
        text: `已由 ${draft.model ?? 'AI'} 生成草稿（消耗 ${draft.tokens ?? 0} tokens），請逐條核實後再保存，尤其是驗收標準必須可判定。`,
        ok: true,
      })
    } catch {
      setAiNotice({ text: 'AI 草稿生成失敗，請手工填寫', ok: false })
    } finally {
      setAiLoading(false)
    }
  }

  const handleSave = async (advance: boolean) => {
    if (!reqId) {
      message.warning('請先選擇需求')
      return
    }
    if (!form.title.trim()) {
      message.warning('請填寫 PRD 標題')
      return
    }
    if (!form.acceptanceCriteria.trim()) {
      message.warning('請填寫驗收標準（業務驗收頁的檢查項來源）')
      return
    }
    // 验收标准会直接变成业务验收页的检查项，保存前必须让人先确认条目数
    Modal.confirm({
      title: advance ? '確認保存 PRD 並推進需求？' : '確認保存 PRD？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>需求：</span><b>{requirement ? `${requirement.reqNo} · ${requirement.title}` : `#${reqId}`}</b></div>
          <div className="confirm-info-row"><span>PRD 標題：</span><b>{form.title.trim()}</b></div>
          <div className="confirm-info-row"><span>功能清單：</span><b>{countLines(form.featureList)} 條</b></div>
          <div className="confirm-info-row"><span>驗收標準：</span><b>{countLines(form.acceptanceCriteria)} 條（將成為驗收檢查項）</b></div>
          {advance && <div className="confirm-info-row"><span>額外動作：</span><b>保存後需求將推進至下一環節</b></div>}
        </div>
      ),
      okText: '確認保存',
      cancelText: '取消',
      onOk: () => submitPrd(advance),
    })
  }

  /** 确认后才落库 */
  const submitPrd = async (advance: boolean) => {
    if (!reqId) return
    setSaving(true)
    try {
      await savePrd({
        id: prdId || undefined,
        reqId,
        parentPrdId: form.parentPrdId,
        title: form.title.trim(),
        targetUsers: form.targetUsers,
        featureList: form.featureList,
        acceptanceCriteria: form.acceptanceCriteria,
        prototypeUrl: form.prototypeUrl,
        contentRich: form.contentRich,
        advanceRequirement: advance,
      })
      message.success(prdId ? 'PRD 已更新' : 'PRD 已保存')
      navigate(`/rdm-detail?id=${reqId}`)
    } catch {
      message.error('保存失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content-area">
      <RdmFormHeader
        title={prdId ? '編輯 PRD' : '編寫 PRD'}
        backText="返回需求"
        onBack={() => navigate(-1)}
        badge={siblings.length > 0 ? (
          <span style={{ fontSize: 12, fontWeight: 400, color: '#8C8C8C' }}>同需求已有 {siblings.length} 份 PRD</span>
        ) : undefined}
        meta={requirement ? `${requirement.reqNo} · ${requirement.title}` : '寫清目標用戶、功能清單與可驗證的驗收標準'}
      />

      {aiNotice && (
        <Alert
          type={aiNotice.ok ? 'success' : 'warning'}
          showIcon
          closable
          onClose={() => setAiNotice(null)}
          style={{ marginBottom: 16 }}
          message={aiNotice.text}
        />
      )}

      <div className="rdm-form-section">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space size={8} wrap>
            <Button icon={<BulbOutlined />} loading={aiLoading} onClick={handleAiDraft}>AI 生成草稿</Button>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>
              草稿只填入表單，不會自動保存；模型只寫描述，複雜度與排期仍由人定
            </span>
          </Space>
          <LabeledField label="PRD 標題" required>
            <Input
              value={form.title}
              maxLength={200}
              placeholder="例：推薦報表自定義時間區間導出"
              onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            />
          </LabeledField>
          <LabeledField label="父 PRD（逐級拆解時選擇）">
            <Select
              style={{ width: 420 }}
              allowClear
              placeholder="不拆解則留空"
              value={form.parentPrdId}
              onChange={v => setForm(prev => ({ ...prev, parentPrdId: v }))}
              options={siblings.map(p => ({ value: p.id, label: `${p.prdNo} ${p.title}（${RDM_PRD_STATUS_LABEL[p.status as RdmPrdStatus] ?? p.status}）` }))}
            />
          </LabeledField>
          <LabeledField label="目標用戶與使用場景">
            <TextArea
              rows={2}
              value={form.targetUsers}
              placeholder="例：財務/運營在月末跨月對帳場景"
              onChange={e => setForm(prev => ({ ...prev, targetUsers: e.target.value }))}
            />
          </LabeledField>
          <LabeledField label="功能清單">
            <TextArea
              rows={4}
              value={form.featureList}
              placeholder="逐條列出功能點與優先級，例：&#10;1. 時間區間選擇器（必填）&#10;2. 導出文件名帶區間（必）"
              onChange={e => setForm(prev => ({ ...prev, featureList: e.target.value }))}
            />
          </LabeledField>
          <LabeledField label="驗收標準（逐條可驗證）" required>
            <TextArea
              rows={3}
              value={form.acceptanceCriteria}
              placeholder={requirement?.expectResult
                ? `需求原始期望：${requirement.expectResult}\n逐條轉寫為可驗證的驗收標準`
                : '例：可選任意起止日期，單次最長 90 天，導出文件名含區間'}
              onChange={e => setForm(prev => ({ ...prev, acceptanceCriteria: e.target.value }))}
            />
          </LabeledField>
          <LabeledField label="原型 / 設計稿連結">
            <Input
              value={form.prototypeUrl}
              placeholder="https://..."
              onChange={e => setForm(prev => ({ ...prev, prototypeUrl: e.target.value }))}
            />
          </LabeledField>
          <LabeledField label="PRD 正文">
            <TextArea
              rows={8}
              value={form.contentRich}
              placeholder="交互細節、字段口徑、邊界與異常處理、埋點與灰度方案（富文本編輯器後續接入）"
              onChange={e => setForm(prev => ({ ...prev, contentRich: e.target.value }))}
            />
          </LabeledField>
        </Space>
      </div>

      <div className="form-footer">
        <Button onClick={() => navigate(-1)}>取消</Button>
        <Button icon={<SaveOutlined />} loading={saving} onClick={() => handleSave(false)}>保存草稿</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => handleSave(true)}>
          保存並進入設計中
        </Button>
      </div>
    </div>
  )
}

/** 带标签的字段容器（保持表单页视觉一致，避免依赖 Form 实例的重渲染） */
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
