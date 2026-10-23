/**
 * PRD 编写 —— 独立表单页
 *
 * 表单只保留两个录入项：「需求说明」（富文本）与「原型 / 設計稿連結」，
 * 目标用户 / 功能清单 / 验收标准等口径统一写进需求说明的富文本里。
 * 标题不再手填：新建 PRD 取需求标题作为列表展示名（编辑态保留原标题），
 * 后端 savePrd 仍强校验 title 非空，故提交前自动兜底。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Input, Modal, Space, Tag, message } from 'antd'
import { BulbOutlined, LockOutlined, SaveOutlined } from '@ant-design/icons'
import DOMPurify from 'dompurify'
import { useTranslation } from 'react-i18next'
import RdmFormHeader from './components/RdmFormHeader'
import RichTextEditor from '../../components/RichTextEditor'
import { useSearchParams } from 'react-router-dom'
import {
  fetchDeliverySummary,
  fetchPrdSnapshots,
  fetchRequirementDetail,
  generatePrdDraft,
  savePrd,
  type RdmPrdItem,
  type RdmPrdSnapshotItem,
} from '../../api/rdm'
import { formatRdmReqNo, RDM_STATUS } from '../../constants/rdm'
import { buildRdmDetailPath } from '../../constants/menuDataSource'
import { useAuth } from '../../contexts/AuthContext'
import { useUnsavedGuard } from '../../contexts/UnsavedChangesContext'
import { clearPrdDraft, loadPrdDraft, prdDraftOwner, savePrdDraft } from './prdDraftStore'
import { useRdmBack } from './useRdmBack'
import './index.css'

/**
 * PRD / 評審可寫的需求狀態：受理之後（含受理當下）、排期之前。
 * <p>與後端 RdmDeliveryServiceImpl.PRD_PHASE_STATUSES 同源：評估中就寫 PRD，
 * 會被評估階段的駁回直接作廢，並造成「評審已通過但頁面還讓人接受需求」。
 */
const PRD_PHASE_STATUSES: string[] = [
  RDM_STATUS.ACCEPTED,
  RDM_STATUS.PRD_DESIGNING,
  RDM_STATUS.REVIEWING,
  RDM_STATUS.REVIEW_PASSED,
]

/** HTML 转义，用于把纯文本旧数据 / AI 草稿文字拼进 HTML 片段 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 旧 PRD 正文是纯文本（老 TextArea 产物），按行转段落 HTML 才能在富文本编辑器回显；已是 HTML 的原样返回 */
function toEditorHtml(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return ''
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed
  return trimmed.split('\n').map(line => `<p>${escapeHtml(line)}</p>`).join('')
}

/** 去标签取纯文本（需求说明判空与确认框字数展示） */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

export default function PrdForm() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const reqId = Number(searchParams.get('reqId') ?? 0)
  const prdId = Number(searchParams.get('id') ?? 0)
  const draftId = searchParams.get('draftId') ?? undefined
  /** 保存/取消后能回退就回来源页，直接打开才 replace 到详情（带上 from 保持侧栏高亮） */
  const goBack = useRdmBack(reqId ? buildRdmDetailPath({ id: reqId, from: searchParams.get('from') }) : '/rdm-requirement')

  /** 需求头部展示信息：reqNo 存的是展示串（准入前行本就没有编号，不能拼出 null） */
  const { user } = useAuth()
  /** 本机暂存归属：环境 + 用户；不同账号绝不共用 */
  const draftOwner = prdDraftOwner(user?.id)
  const { register: registerUnsaved } = useUnsavedGuard()

  const [requirement, setRequirement] = useState<{
    reqNo: string; title: string; expectResult?: string | null
    /** 需求状态 / 交付流程：决定能不能新建 PRD、能不能「保存并推进」 */
    status: string; flowVersion?: number | null
  } | null>(null)
  const [siblings, setSiblings] = useState<RdmPrdItem[]>([])
  const [saving, setSaving] = useState(false)
  /**
   * 当前 PRD 状态（阶段 3）：评审中/已通过的定稿内容不可原地改，
   * 否则会出现「开发按新版做、验收按旧版查」。
   */
  const [currentStatus, setCurrentStatus] = useState<string | null>(null)
  const [newVersion, setNewVersion] = useState(false)
  const [changeReason, setChangeReason] = useState('')
  /** 定稿快照（版本链）：让「谁在哪一版上批过」看得见 */
  const [snapshots, setSnapshots] = useState<RdmPrdSnapshotItem[]>([])
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

  /**
   * 脏状态基线：服务端加载/正式保存成功后更新。
   * <p>用内容比较而不是"输入即脏"：用户打开就离开不应该被拦；
   * 输入后又改回原样也不应继续提示。
   */
  const [baseline, setBaseline] = useState<string>('')
  const dirty = useMemo(() => baseline !== '' && (JSON.stringify(form) !== baseline
    || newVersion || !!changeReason.trim()), [form, baseline, newVersion, changeReason])
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const formRef = useRef(form)
  formRef.current = form
  /** 服务端当前行的 updatedAt：恢复本机暂存时用于识别"服务器已变化" */
  const serverUpdatedAt = useRef<string | null>(null)
  /**
   * 服务端当前行的并发版本号：保存时原样回传，后端据此拒绝覆盖他人刚写入的内容。
   * <p>不能拿 updatedAt 代替：它精度到秒，同一秒内的两次保存看起来完全一样。
   */
  const serverRowVersion = useRef<number | null>(null)
  const [draftNotice, setDraftNotice] = useState<{ savedAt: number; failed: boolean } | null>(null)
  /** 本机暂存恢复只尝试一次，避免每次重渲染反复弹确认框 */
  const draftChecked = useRef(false)

  /** 定稿（评审中/已通过）且未勾选以新版本修改 → 表单只读 */
  const isLocked = currentStatus === 'reviewing' || currentStatus === 'approved'
  /**
   * 新建 PRD 的状态闸门：需求未受理时不允许写。
   * <p>后端同样会拒（savePrd → requirePrdPhase），前端提前拦住，避免写完一大篇才报错。
   * <p>已有 PRD 的编辑不受限：它已经是既成事实，改它不会改变“受理与否”的事实。
   */
  const phaseBlocked = !prdId && !!requirement?.status && !PRD_PHASE_STATUSES.includes(requirement.status)
  /** 「保存并推进」只在“已受理、且非 V3 分批交付”时有意义：V3 需求状态不因 PRD 而推进 */
  const canAdvance = !prdId && requirement?.status === RDM_STATUS.ACCEPTED && requirement?.flowVersion !== 3
  /** 定稿后未开新版本 → 保存按钮禁用（不让用户点完才被拒） */
  const saveBlocked = !requirement || baseline === '' || (isLocked && !newVersion) || phaseBlocked

  useEffect(() => {
    if (!reqId) return
    fetchRequirementDetail(reqId).then(d => {
      if (!d) return
      setRequirement({
        reqNo: formatRdmReqNo(d.reqNo),
        title: d.title,
        expectResult: d.expectResult,
        status: String(d.status),
        flowVersion: d.flowVersion,
      })
    }).catch(() => message.error('需求資訊載入失敗'))
  }, [reqId])

  /**
   * 恢复本机暂存：必须等服务器内容先落地，否则后到的 setForm 会把恢复内容盖掉。
   * <p>服务器 updatedAt 与暂存基线不一致时仍允许恢复，但明确提示"服务器已变化"，
   * 由用户自己决定保留哪一份；本实现不自动合并富文本。
   */
  const offerDraftRestore = (
    serverForm: typeof form,
    serverUpdatedAtValue: string | null,
    serverHadCurrent: boolean,
  ) => {
    if (draftChecked.current || !reqId) return
    draftChecked.current = true
    const draft = loadPrdDraft(draftOwner, reqId, prdId || null, draftId)
    if (!draft) return
    const restored = {
      title: draft.title ?? serverForm.title,
      parentPrdId: draft.parentPrdId,
      targetUsers: draft.targetUsers ?? '',
      featureList: draft.featureList ?? '',
      acceptanceCriteria: draft.acceptanceCriteria ?? '',
      prototypeUrl: draft.prototypeUrl ?? '',
      contentRich: DOMPurify.sanitize(draft.contentRich ?? ''),
    }
    if (JSON.stringify(restored) === JSON.stringify(serverForm)) {
      // 与服务器内容一致：没有恢复价值，直接清掉，避免下次再问
      clearPrdDraft(draftOwner, reqId, prdId || null, draftId)
      return
    }
    const changedOnServer = serverHadCurrent && (draft.baseRowVersion == null
      || draft.baseRowVersion !== serverRowVersion.current
      || (!!serverUpdatedAtValue && !!draft.baseUpdatedAt && draft.baseUpdatedAt !== serverUpdatedAtValue))
    Modal.confirm({
      title: t('rdm.prd.draftFoundTitle'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('rdm.prd.draftTimeLabel')}</span><b>{new Date(draft.savedAt).toLocaleString()}</b></div>
          <div className="confirm-info-row"><span>{t('rdm.prd.draftLengthLabel')}</span><b>{plainText(draft.contentRich ?? '').length} 字</b></div>
          {changedOnServer && (
            <div className="confirm-info-row">
              <span>注意：</span><b>{t('rdm.prd.draftServerChanged')}</b>
            </div>
          )}
        </div>
      ),
      okText: t('rdm.prd.draftRestoreAction'),
      cancelText: t('rdm.prd.draftDiscardAction'),
      onOk: () => {
        // 保留草稿原版本；不能把旧内容套上新版本号后覆盖服务器的新内容。
        if (prdId) serverRowVersion.current = draft.baseRowVersion ?? null
        setForm(restored)
        setDraftNotice({ savedAt: draft.savedAt, failed: false })
        message.info(t('rdm.prd.draftRestoredMsg'))
      },
      onCancel: () => {
        clearPrdDraft(draftOwner, reqId, prdId || null, draftId)
      },
    })
  }

  /** 编辑态回填；同时取同需求下的 PRD 作为「父 PRD」候选（逐级拆解） */
  useEffect(() => {
    if (!reqId) return
    let alive = true
    fetchDeliverySummary(reqId).then(summary => {
      if (!alive || !summary) return
      setSiblings(summary.prds.filter(p => p.id !== prdId))
      const current = summary.prds.find(p => p.id === prdId)
      if (current) {
        setCurrentStatus(current.status)
        serverUpdatedAt.current = current.updatedAt ?? null
        serverRowVersion.current = current.rowVersion ?? null
        if (prdId) {
          fetchPrdSnapshots(prdId).then(setSnapshots).catch(() => setSnapshots([]))
        }
        const loaded = {
          title: current.title,
          parentPrdId: current.parentPrdId ?? undefined,
          targetUsers: current.targetUsers ?? '',
          featureList: current.featureList ?? '',
          acceptanceCriteria: current.acceptanceCriteria ?? '',
          prototypeUrl: current.prototypeUrl ?? '',
          contentRich: toEditorHtml(current.contentRich ?? ''),
        }
        setForm(loaded)
        // 服务端内容就是基线：只有之后真正改动才算脏
        setBaseline(JSON.stringify(loaded))
        offerDraftRestore(loaded, current.updatedAt ?? null, true)
      } else if (!prdId) {
        // 新建 PRD：基线是空表单，服务器没有可覆盖的内容
        offerDraftRestore(formRef.current, null, false)
      }
    }).catch(() => { if (alive) message.error('PRD 資訊載入失敗') })
    return () => { alive = false }
    // offerDraftRestore 只依赖当前挂载参数；刻意不进依赖，避免每次渲染重复询问
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqId, prdId])

  /** 新建 PRD 的初始基线：空表单不算脏 */
  useEffect(() => {
    if (prdId || baseline) return
    setBaseline(JSON.stringify(formRef.current))
  }, [prdId, baseline])

  /**
   * 脏内容 500ms 防抖暂存。
   * <p>只写 sessionStorage，不发正式保存请求；存储失败要显式提示，
   * 不能让用户以为内容已经安全。
   */
  useEffect(() => {
    if (!reqId || !dirty) return
    const timer = setTimeout(() => {
      const ok = savePrdDraft(draftOwner, reqId, prdId || null, {
        ...formRef.current,
        baseUpdatedAt: serverUpdatedAt.current,
        baseRowVersion: serverRowVersion.current ?? undefined,
      }, draftId)
      setDraftNotice({ savedAt: Date.now(), failed: !ok })
    }, 500)
    return () => clearTimeout(timer)
  }, [form, dirty, reqId, prdId, draftOwner, draftId])

  /** 离开保护：页签切换/关闭等导航入口统一询问；stash 用最新表单内容 */
  useEffect(() => registerUnsaved({
    isDirty: () => dirtyRef.current,
    stash: () => {
      if (!reqId) return false
      const ok = savePrdDraft(draftOwner, reqId, prdId || null, {
        ...formRef.current,
        baseUpdatedAt: serverUpdatedAt.current,
        baseRowVersion: serverRowVersion.current ?? undefined,
      }, draftId)
      setDraftNotice({ savedAt: Date.now(), failed: !ok })
      return ok
    },
    discard: () => {
      if (reqId) clearPrdDraft(draftOwner, reqId, prdId || null, draftId)
      setBaseline(JSON.stringify(formRef.current))
      setDraftNotice(null)
    },
    describe: () => (requirement ? `${requirement.reqNo} · ${requirement.title}` : 'PRD 內容'),
  }), [registerUnsaved, reqId, prdId, draftOwner, draftId, requirement])

  /** 刷新/关闭浏览器：浏览器允许的最小提示（自定义文案无法保证展示） */
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

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
      // AI 草稿全部写进可见的需求说明富文本：不写隐藏字段，避免用户看不到的数据流进验收检查项
      const blocks: string[] = []
      if (draft.targetUsers) blocks.push(`<p><b>${t('rdm.prdForm.sectionTargetUsers')}</b>${escapeHtml(draft.targetUsers)}</p>`)
      if (draft.featureList?.length) {
        blocks.push(`<p><b>${t('rdm.prdForm.sectionFeatureList')}</b></p><ol>${draft.featureList.map(li => `<li>${escapeHtml(li)}</li>`).join('')}</ol>`)
      }
      if (draft.acceptanceCriteria?.length) {
        blocks.push(`<p><b>${t('rdm.prdForm.sectionAcceptance')}</b></p><ol>${draft.acceptanceCriteria.map(li => `<li>${escapeHtml(li)}</li>`).join('')}</ol>`)
      }
      if (draft.boundary) blocks.push(`<p><b>${t('rdm.prdForm.sectionBoundary')}</b>${escapeHtml(draft.boundary)}</p>`)
      if (draft.risks) blocks.push(`<p><b>${t('rdm.prdForm.sectionRisks')}</b>${escapeHtml(draft.risks)}</p>`)
      setForm(prev => ({
        ...prev,
        title: prev.title || draft.title || '',
        contentRich: [prev.contentRich, ...blocks].filter(Boolean).join(''),
      }))
      setAiNotice({
        text: t('rdm.prdForm.aiDraftDone', {
          model: draft.model ?? 'AI',
          tokens: draft.tokens ?? 0,
          defaultValue: '已由 {{model}} 生成草稿（消耗 {{tokens}} tokens），內容已填入需求說明，請核實後再保存。',
        }),
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
    // 标题不再手填：新建取需求标题作列表展示名，编辑态保留原标题
    const effectiveTitle = form.title.trim() || requirement?.title?.trim() || 'PRD'
    if (!plainText(form.contentRich)) {
      message.warning(t('rdm.prdForm.descRequired', { defaultValue: '請填寫需求說明' }))
      return
    }
    // 需求说明是评审与验收的唯一正文事实，保存前必须让人先确认内容体量
    Modal.confirm({
      title: advance ? '確認保存 PRD 並推進需求？' : '確認保存 PRD？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>需求：</span><b>{requirement ? `${requirement.reqNo} · ${requirement.title}` : `#${reqId}`}</b></div>
          <div className="confirm-info-row"><span>{t('rdm.prdForm.confirmPrdTitle')}</span><b>{effectiveTitle}</b></div>
          <div className="confirm-info-row"><span>{t('rdm.prdForm.confirmDescLabel', { defaultValue: '需求說明：' })}</span><b>{t('rdm.prdForm.confirmDescValue', { count: plainText(form.contentRich).length, defaultValue: '{{count}} 字' })}</b></div>
          <div className="confirm-info-row"><span>{t('rdm.prdForm.confirmProtoLabel', { defaultValue: '原型 / 設計稿：' })}</span><b>{form.prototypeUrl.trim() ? t('rdm.prdForm.confirmProtoFilled', { defaultValue: '已填連結' }) : t('rdm.prdForm.confirmProtoEmpty', { defaultValue: '未填' })}</b></div>
          {advance && <div className="confirm-info-row"><span>額外動作：</span><b>保存後需求將推進至下一環節</b></div>}
        </div>
      ),
      okText: '確認保存',
      cancelText: '取消',
      onOk: () => submitPrd(advance, effectiveTitle),
    })
  }

  /**
   * 页面内返回/取消：不再自己弹确认。
   * <p>导航统一由 Data Router 的 blocker 拦截并询问，避免“页内先问一次、路由再问一次”
   * 的双弹框；暂存动作仍由同一个 guard 承担，保护没有减弱。
   */
  const handleLeave = () => { goBack() }

  /** 确认后才落库 */
  const submitPrd = async (advance: boolean, title: string) => {
    if (!reqId || saveBlocked) return
    if (isLocked && !newVersion) {
      message.warning('該 PRD 已定稿，請先勾選「以新版本修改」')
      return
    }
    if (newVersion && !changeReason.trim()) {
      message.warning('以新版本修改必須填寫變更原因')
      return
    }
    setSaving(true)
    try {
      await savePrd({
        id: prdId || undefined,
        reqId,
        parentPrdId: form.parentPrdId,
        title,
        targetUsers: form.targetUsers,
        featureList: form.featureList,
        acceptanceCriteria: form.acceptanceCriteria,
        prototypeUrl: form.prototypeUrl,
        // 富文本入库前统一净化，防粘贴内容携带脚本标签（UI 规范 B.6）
        contentRich: DOMPurify.sanitize(form.contentRich),
        advanceRequirement: advance,
        newVersion: newVersion || undefined,
        changeReason: newVersion ? changeReason.trim() : undefined,
        // 编辑与另存新版本都校验来源版本，暂存恢复后仍沿用暂存时的旧基线。
        expectedRowVersion: prdId ? serverRowVersion.current ?? undefined : undefined,
      })
      // 正式保存成功：本机暂存已完成使命，清掉避免下次重复询问
      clearPrdDraft(draftOwner, reqId, prdId || null, draftId)
      setBaseline(JSON.stringify(formRef.current))
      dirtyRef.current = false
      message.success(prdId ? (newVersion ? '已存為新版本草稿' : 'PRD 已更新') : 'PRD 已保存')
      // 不能用 navigate(详情URL)：那会再 push 一条，连点返回来回穿越表单页
      goBack()
    } catch (err) {
      // request.ts 已统一弹后端真实文案，这里不再重复 message.error（§G.4 禁止双弹）
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content-area">
      <RdmFormHeader
        title={prdId ? '編輯 PRD' : '編寫 PRD'}
        backText="返回需求"
        onBack={handleLeave}
        badge={siblings.length > 0 ? (
          <span style={{ fontSize: 12, fontWeight: 400, color: '#8C8C8C' }}>同需求已有 {siblings.length} 份 PRD</span>
        ) : undefined}
        meta={requirement ? `${requirement.reqNo} · ${requirement.title}` : t('rdm.prdForm.metaFallback', { defaultValue: '需求說明支援富文本編輯' })}
      />

      {dirty && draftNotice && (
        <div
          style={{
            marginBottom: 16, padding: '8px 12px', borderRadius: 6, fontSize: 12,
            background: draftNotice.failed ? '#FFF1F0' : '#FFF7F0',
            border: `1px solid ${draftNotice.failed ? '#FFCCC7' : '#FFE7D1'}`,
            color: draftNotice.failed ? '#CF1322' : '#8C8C8C',
          }}
          role="status"
        >
          {draftNotice.failed
            ? t('rdm.prd.draftFailedHint')
            : t('rdm.prd.draftSavedHint', { time: new Date(draftNotice.savedAt).toLocaleTimeString() })}
        </div>
      )}

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

      {/* 受理前不允许新建 PRD：后端会拒，前端先把入口说清楚，避免白写 */}
      {phaseBlocked && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="需求尚未受理，暫時不能編寫 PRD"
          description="請先由產品經理在需求詳情頁「接受需求」（給出承諾出 PRD 日期），再回來編寫；已寫過的 PRD 仍可繼續編輯。"
        />
      )}

      {/*
        定稿不可原地改（阶段 3）：评审中/已通过的正文已经是评审结论与验收标准的事实，
        要改只能开新版本，原版与当时的评审记录一起留着。
      */}
      {isLocked && (
        <Alert
          type="warning"
          showIcon
          icon={<LockOutlined />}
          style={{ marginBottom: 16 }}
          message={`本版 PRD 已${currentStatus === 'approved' ? '評審通過' : '進入評審'}，內容已凍結`}
          description={(
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <span>需要修改請勾選下方「以新版本修改」：新版本會生成一份草稿并保留原版，開發與驗收才不會各認一版。</span>
              <Checkbox checked={newVersion} onChange={e => setNewVersion(e.target.checked)}>
                以新版本修改
              </Checkbox>
              {newVersion && (
                <Input.TextArea
                  rows={2}
                  placeholder="變更原因（必填，會寫進版本鏈）"
                  value={changeReason}
                  onChange={e => setChangeReason(e.target.value)}
                  maxLength={200}
                  showCount
                />
              )}
            </Space>
          )}
        />
      )}

      {snapshots.length > 0 && (
        <div className="rdm-card" style={{ marginBottom: 16 }}>
          <div className="rdm-card-title">
            版本鏈（定稿快照）
            <span className="rdm-card-title-split" />
            <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>共 {snapshots.length} 次定稿</span>
          </div>
          {snapshots.map(s => (
            <div key={s.id} className="rdm-delivery-row">
              <Tag color={s.conclusion === 'passed' ? 'success' : 'error'} style={{ margin: 0 }}>{s.versionNo}</Tag>
              <span className="rdm-delivery-row-main">
                {s.title}
                <div className="rdm-delivery-row-desc">
                  {s.conclusion === 'passed' ? '評審通過' : '評審退回'}
                  {s.reviewerNames ? ` · 評審 ${s.reviewerNames}` : ''}
                  {s.snapshotTime ? ` · ${s.snapshotTime}` : ''}
                  {s.conclusionDesc ? ` · ${s.conclusionDesc}` : ''}
                </div>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 定稿且未勾选新版本时整块禁用：不让人改完才发现提交不了 */}
      <fieldset disabled={isLocked && !newVersion} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
      <div className="rdm-form-section">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space size={8} wrap>
            <Button icon={<BulbOutlined />} loading={aiLoading} onClick={handleAiDraft}>AI 生成草稿</Button>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>
              草稿只填入表單，不會自動保存；模型只寫描述，複雜度與排期仍由人定
            </span>
          </Space>
          {/* fieldset 的 disabled 管不到 contentEditable，锁定态必须显式传 disabled */}
          <LabeledField label={t('rdm.prdForm.descLabel', { defaultValue: '需求說明' })} required>
            <RichTextEditor
              value={form.contentRich}
              minHeight={360}
              disabled={isLocked && !newVersion}
              ariaLabel={t('rdm.prdForm.descLabel', { defaultValue: '需求說明' })}
              placeholder={t('rdm.prdForm.descPlaceholder', { defaultValue: '目標用戶、功能清單、驗收標準、交互細節與邊界異常都寫在這裡；支援標題 / 清單 / 粗體等富文本格式' })}
              onChange={html => setForm(prev => ({ ...prev, contentRich: html }))}
            />
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>
              {t('rdm.prdForm.descHint', { defaultValue: '以「驗收標準」為獨立標題寫成一節（清單尤佳），保存時自動抽取為業務驗收檢查項' })}
            </div>
          </LabeledField>
          <LabeledField label={t('rdm.prdForm.protoLabel', { defaultValue: '原型 / 設計稿連結' })}>
            <Input
              value={form.prototypeUrl}
              placeholder="https://..."
              onChange={e => setForm(prev => ({ ...prev, prototypeUrl: e.target.value }))}
            />
          </LabeledField>
        </Space>
      </div>
      </fieldset>

      <div className="form-footer">
        <Button onClick={handleLeave}>取消</Button>
        {/* 只有「已受理的 V2 需求」才有推进语义：其余场景只保存，避免按钮暗示一次不会发生的状态变化 */}
        {canAdvance && (
          <Button icon={<SaveOutlined />} loading={saving} disabled={saveBlocked} onClick={() => handleSave(false)}>保存草稿</Button>
        )}
        <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={saveBlocked} onClick={() => handleSave(canAdvance)}>
          {canAdvance ? '保存並進入設計中' : '保存 PRD'}
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
