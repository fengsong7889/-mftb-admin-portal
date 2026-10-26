/**
 * 系統權限申請（企業門戶「我要申請」的落地页）
 *
 * 链路：门户未授权系统卡片 →「我要申請」→ 本页 → 提交后发起 OA `system_access` 流程
 * （编号 XTSQ + 年月日 + 2 位日流水）→ 审批人在审批详情页指定授权角色 → 通过后自动绑定，权限立即生效。
 *
 * 申请内容是「使用诉求」而不是「勾选菜单」（2026-10 改口径，对齐 Entra Access Packages /
 * SailPoint business role）：本页使用者对所申请系统零权限，给他一棵菜单勾选树等于把该系统的
 * 功能全貌摊开（架构泄露），而且「全选」按钮与最小权限原则反向（诱导过度授权）。
 * 现在申请人只说清「要做什么、做到什么时候」，可选地从管理员开放的角色目录里指一个参考角色，
 * 最终授予哪个角色由审批人决定。目录为空时参考角色卡整块不渲染，页面退化为纯诉求制。
 *
 * 到期处理：选「至指定日期」的授权，到期当天仍可用、次日起由后端 SystemAccessExpiryJob 自动收回
 * 本单新绑的角色（选「长期」则不回收）——这条规则必须如实写在期限下方的提示里，不能只当审批依据。
 *
 * 刻意不做成受控菜单页：本页的使用者正是「对所申请系统没有任何权限」的员工，
 * 挂上菜单权限（CONTROLLED_MENU_KEYS / ROUTE_MENU_KEY_MAP）会让门户的「我要申請」变成 403 死链。
 * 补偿控制在后端：申请人只取登录态、系统/场景/期限/参考角色/凭证全部服务端校验、
 * 提交只产生一张待审批单据而不改变任何权限。
 *
 * 界面遵循全局表单页规范（.qoder/rules/form-page-style.md）：橙色渐变头部 + 白色模块卡片 + 底部 form-footer。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Checkbox, DatePicker, Image, Input, Modal, Radio, Select, Spin, Upload, message } from 'antd'
import {
  ArrowLeftOutlined, CheckCircleOutlined, FilePdfOutlined, FormOutlined,
  InboxOutlined, ProfileOutlined, SendOutlined, TeamOutlined, UploadOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import { useAuth } from '@/contexts/AuthContext'
import type { PortalSystem } from '@/api/portal'
import {
  fetchMySystemAccessRequests, fetchRequestableSystems, fetchSelfServiceRoles,
  submitSystemAccessRequest,
  type SystemAccessAttachment, type SystemAccessDurationType, type SystemAccessRoleOption,
} from '@/api/systemAccessRequest'
import { getSystemDisplayName } from '@/constants/portalSystems'
import { SYSTEM_ACCESS_SCENARIOS, getScenarioLabel } from '@/constants/systemAccess'
import HelpPopover from '@/components/HelpPopover'

/** 凭证数量上限（与后端 SystemAccessConstants.MAX_ATTACHMENTS 一致） */
const ATTACHMENT_MAX_COUNT = 5
/** 单个凭证上限 2MB（与后端一致；后端按 Data URL 实际体积复核，前端提示只为省一次往返） */
const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024
/** 诉求说明长度上限（与后端 REASON_MAX_LENGTH 一致） */
const REASON_MAX_LENGTH = 1000
/** 期限最远可选年数（与后端 MAX_DURATION_YEARS 一致） */
const MAX_DURATION_YEARS = 10
/**
 * 参考角色的「不指定」哨兵值。
 * <p>用 0 而不是 null：antd Radio.Group 的受控值混用 null 时，取消选中与未选中无法区分，
 * 提交前统一把 0 折成 undefined（后端 preferredRoleId 可空）。
 */
const ROLE_NONE = 0

/** 凭证项（客户端转 base64 Data URL，随申请一并提交） */
interface CredentialItem extends SystemAccessAttachment {
  dataUrl: string
}

/** 读文件为 Data URL：与其它流程一致，服务端不落盘、不引入对象存储 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export default function SystemAccessApply() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user, hasMenuPermission } = useAuth()
  const [searchParams] = useSearchParams()

  /**
   * 申请的系统编码：门户跳转时由 ?system= 带入并锁定；直接打开本页（如流程中心入口）
   * 时由申请人从「可申请系统」下拉里选，目录取后端（当前人尚未获得准入的启用系统），不用前端硬编码。
   */
  const paramSystem = (searchParams.get('system') ?? '').trim()
  const [systemCode, setSystemCode] = useState(paramSystem)
  const [systemOptions, setSystemOptions] = useState<PortalSystem[]>([])
  const [systemOptionsError, setSystemOptionsError] = useState(false)
  /** 名称参数只作语言包缺失时的兜底展示，授权判定一律以后端为准 */
  const systemNameParam = searchParams.get('name') ?? ''
  const systemName = useMemo(() => {
    if (!systemCode) return ''
    const fallback = systemNameParam
      || systemOptions.find((item) => item.code === systemCode)?.name
      || systemCode
    return getSystemDisplayName(t, { code: systemCode, name: fallback }, i18n.language)
  }, [systemCode, systemNameParam, systemOptions, t, i18n.language])

  /* ---- 使用诉求：场景（多选枚举）+ 期限 + 说明 ---- */
  const [scenarios, setScenarios] = useState<string[]>([])
  const [durationType, setDurationType] = useState<SystemAccessDurationType>('permanent')
  const [durationUntil, setDurationUntil] = useState<Dayjs | null>(null)
  const [reason, setReason] = useState('')

  /* ---- 参考角色目录（管理员开放自助申请的角色；为空时整卡不渲染） ---- */
  const [roleOptions, setRoleOptions] = useState<SystemAccessRoleOption[]>([])
  const [rolesLoading, setRolesLoading] = useState(false)
  const [rolesError, setRolesError] = useState(false)
  const [rolesReloadToken, setRolesReloadToken] = useState(0)
  const [preferredRoleId, setPreferredRoleId] = useState<number>(ROLE_NONE)

  const [credentials, setCredentials] = useState<CredentialItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  /** 同系统已有在途申请：提示并禁止重复提交（后端同样会拒，这里只是省一次失败往返） */
  const [pendingFlowNo, setPendingFlowNo] = useState<string | null>(null)

  /* ---- 提交成功弹窗（与充值/AI 申请等流程统一规范：全屏遮罩 + 绿色 ✓ + 倒计时） ---- */
  const [successVisible, setSuccessVisible] = useState(false)
  const [submittedFlowNo, setSubmittedFlowNo] = useState('')
  const [countdown, setCountdown] = useState(5)

  /** 场景选项：code 走常量、文案走 i18n，语言切换时重建（getScenarioLabel 内部读 t） */
  const scenarioOptions = useMemo(
    () => SYSTEM_ACCESS_SCENARIOS.map((code) => ({ value: code, label: getScenarioLabel(t, code) })),
    [t],
  )

  /**
   * 可申请系统目录：只在没有门户带入参数时拉（带参时系统已锁定，下拉不渲染）。
   * <p>拉不到时给错误态 + 重试，不降级成空下拉：空下拉看起来像「没有系统可申请」，
   * 而真实原因可能只是后端不可用，两者对用户的指引完全不同。
   */
  useEffect(() => {
    if (paramSystem) return
    let cancelled = false
    setSystemOptionsError(false)
    fetchRequestableSystems()
      .then((rows) => { if (!cancelled) setSystemOptions(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (!cancelled) { setSystemOptions([]); setSystemOptionsError(true) } })
    return () => { cancelled = true }
  }, [paramSystem])

  /**
   * 参考角色目录：按系统拉，目录口径（开放自助申请 + 已持该系统准入 + 启用 + 非 admin）全在后端。
   * <p>目录为空是正常态而不是错误：此时整张卡不渲染，页面退化为「只陈述诉求」。
   * 加载失败要给重试入口，否则申请人无从判断「是没有可选角色，还是接口坏了」。
   */
  useEffect(() => {
    if (!systemCode) {
      setRoleOptions([])
      setRolesError(false)
      return
    }
    let cancelled = false
    setRolesLoading(true)
    setRolesError(false)
    fetchSelfServiceRoles(systemCode)
      .then((rows) => { if (!cancelled) setRoleOptions(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (!cancelled) { setRoleOptions([]); setRolesError(true) } })
      .finally(() => { if (!cancelled) setRolesLoading(false) })
    return () => { cancelled = true }
  }, [systemCode, rolesReloadToken])

  /** 在途申请检测：门户卡片与本页都可能被重复点开，先把「已申请过」讲清楚 */
  useEffect(() => {
    if (!systemCode) return
    let cancelled = false
    fetchMySystemAccessRequests(systemCode)
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return
        const pending = rows.find((row) => row.status === 'pending')
        setPendingFlowNo(pending ? pending.flowNo : null)
      })
      .catch(() => { /* 查不到在途单不阻断填写，后端提交时会再拦一次 */ })
    return () => { cancelled = true }
  }, [systemCode])

  useEffect(() => {
    if (!successVisible) return
    if (countdown <= 0) {
      navigate('/portal')
      return
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [successVisible, countdown, navigate])

  const handleBack = useCallback(() => {
    // 门户是本页唯一自然入口；没有历史记录时直接回门户，不停在空白页
    if (window.history.length > 1) navigate(-1)
    else navigate('/portal')
  }, [navigate])

  /**
   * 在途上传计数：一次选多个文件时 antd 会在同一轮里逐个回调 beforeUpload，
   * 只看 credentials.length 会读到未提交的旧值、一次突破上限（后端有 fail-closed 但错误很硬）。
   */
  const inflightUploads = useRef(0)

  /** 上传凭证：客户端转 base64，返回 false 阻止 antd 自动上传 */
  const handleUpload = useCallback((file: File) => {
    if (credentials.length + inflightUploads.current >= ATTACHMENT_MAX_COUNT) {
      message.warning(t('systemAccessApply.attachmentMax', { count: ATTACHMENT_MAX_COUNT }))
      return false
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      message.warning(t('systemAccessApply.attachmentTooLarge'))
      return false
    }
    inflightUploads.current += 1
    setUploading(true)
    readFileAsDataUrl(file)
      .then((dataUrl) => {
        setCredentials((prev) => {
          // 再守一次上限：多个文件同轮回调时只有这里能拿到最新 state
          if (prev.length >= ATTACHMENT_MAX_COUNT) return prev
          return [...prev, {
            name: file.name,
            type: file.type === 'application/pdf' ? 'pdf' : 'image',
            contentType: file.type,
            size: file.size,
            dataUrl,
          }]
        })
      })
      .catch(() => message.error(t('systemAccessApply.attachmentFailed')))
      .finally(() => {
        inflightUploads.current -= 1
        setUploading(inflightUploads.current > 0)
      })
    return false
  }, [credentials.length, t])

  const removeCredential = useCallback((index: number) => {
    setCredentials((prev) => prev.filter((_, i) => i !== index))
  }, [])

  /** 期限截止日：只能选「今天之后、不超过 10 年」，与后端校验同口径（省一次失败往返） */
  const disabledDurationDate = useCallback((current: Dayjs) => {
    if (!current) return false
    return current.isBefore(dayjs().endOf('day'))
      || current.isAfter(dayjs().add(MAX_DURATION_YEARS, 'year').endOf('day'))
  }, [])

  /**
   * 提交：先过前端校验（§B.3 校验 → 确认 → 提交），再弹二次确认。
   * <p>确认弹窗里把「申请哪个系统 / 使用场景 / 使用期限 / 参考角色 / 诉求摘要 / 凭证数」列清楚：
   * 提交就开审批流、发流程编号并打扰审批人，不该一点就飞。
   * <p>后端错误原样展示：它给的是可操作原因（已有权限 / 重复申请 / 参考角色未开放自助申请）。
   */
  const handleSubmit = useCallback(() => {
    if (!systemCode) {
      message.warning(t('systemAccessApply.systemRequired'))
      return
    }
    if (scenarios.length === 0) {
      message.warning(t('systemAccessApply.scenarioRequired'))
      return
    }
    if (durationType === 'until' && !durationUntil) {
      message.warning(t('systemAccessApply.durationDateRequired'))
      return
    }
    if (!reason.trim()) {
      message.warning(t('systemAccessApply.reasonRequired'))
      return
    }

    const trimmedReason = reason.trim()
    const untilText = durationType === 'until' && durationUntil ? durationUntil.format('YYYY-MM-DD') : undefined
    const preferredRoleName = roleOptions.find((item) => item.roleId === preferredRoleId)?.roleName
    Modal.confirm({
      title: t('systemAccessApply.confirmTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      centered: true,
      width: 520,
      okText: t('common.confirmSubmit'),
      cancelText: t('common.cancel'),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span className="confirm-info-label">{t('systemAccessApply.targetSystem')}</span>
            <span className="confirm-info-value">{systemName}</span>
          </div>
          <div className="confirm-info-row">
            <span className="confirm-info-label">{t('systemAccessApply.scenarioLabel')}</span>
            <span className="confirm-info-value">
              {scenarios.map((code) => getScenarioLabel(t, code)).join('、')}
            </span>
          </div>
          <div className="confirm-info-row">
            <span className="confirm-info-label">{t('systemAccessApply.durationLabel')}</span>
            <span className="confirm-info-value">
              {durationType === 'until' && untilText
                ? t('systemAccessApply.durationUntilDate', { date: untilText })
                : t('systemAccessApply.durationPermanent')}
            </span>
          </div>
          {preferredRoleName && (
            <div className="confirm-info-row">
              <span className="confirm-info-label">{t('systemAccessApply.preferredRoleSection')}</span>
              <span className="confirm-info-value">{preferredRoleName}</span>
            </div>
          )}
          <div className="confirm-info-row">
            <span className="confirm-info-label">{t('systemAccessApply.reasonLabel')}</span>
            <span className="confirm-info-value">
              {trimmedReason.length > 50 ? `${trimmedReason.slice(0, 50)}...` : trimmedReason}
            </span>
          </div>
          {credentials.length > 0 && (
            <div className="confirm-info-row">
              <span className="confirm-info-label">{t('systemAccessApply.attachmentSection')}</span>
              <span className="confirm-info-value">
                {t('systemAccessApply.attachmentCount', { count: credentials.length })}
              </span>
            </div>
          )}
        </div>
      ),
      onOk: async () => {
        setSubmitting(true)
        try {
          const flowNo = await submitSystemAccessRequest({
            systemCode,
            scenarios,
            durationType,
            durationUntil: untilText,
            // 0 是「不指定」哨兵，不能原样提交：后端会当成角色 ID 去回查
            preferredRoleId: preferredRoleId === ROLE_NONE ? undefined : preferredRoleId,
            reason: trimmedReason,
            attachments: credentials.length > 0 ? credentials : undefined,
          })
          setSubmittedFlowNo(flowNo)
          setCountdown(5)
          setSuccessVisible(true)
        } catch (err) {
          // request.ts 拦截器已统一弹后端 message（它给的是可操作原因：已有权限/重复申请/
          // 参考角色未开放自助申请），这里再弹一次就是双 toast（§G.4 禁止），只留日志与状态复位
          console.error('系統權限申請提交失败', err)
        } finally {
          setSubmitting(false)
        }
      },
    })
  }, [systemCode, systemName, scenarios, durationType, durationUntil, reason,
    roleOptions, preferredRoleId, credentials, t])

  /** 模块卡片标题行（表单页规范：28×28 色块图标 + 15px/600 标题 + 延伸分隔线 + 右侧说明） */
  const renderCardTitle = (icon: React.ReactNode, bg: string, color: string, title: string, extra?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {extra}
    </div>
  )

  /** 卡片内行内小标题（12px 灰 + 必填红星），与基本信息卡的字段标签同一视觉语言 */
  const renderFieldLabel = (label: string, required?: boolean) => (
    <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>
      {label}
      {required && <span style={{ color: '#ff4d4f', marginLeft: 2 }}>*</span>}
    </div>
  )

  const cardStyle: React.CSSProperties = {
    border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
    padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }

  /**
   * 参考角色卡片基底样式（直接给 antd Radio，它渲染的就是一个 label）。
   * <p>width 100% + margin 0 是必要的：.ant-radio-wrapper 默认是 inline-flex 且带 margin-inline-end，
   * 不改就会溢出一截；alignItems 改成 flex-start 让「角色名 + 说明」两行顶对齐。
   */
  const roleCardStyle: React.CSSProperties = {
    width: '100%', margin: 0, borderRadius: 8, padding: '10px 14px',
    alignItems: 'flex-start', cursor: 'pointer',
  }

  const applyDate = dayjs().format('YYYY-MM-DD')
  const showRoleCard = !!systemCode && (rolesLoading || rolesError || roleOptions.length > 0)

  return (
    <div className="content-area">
      {/* ====== 页面头部 ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%',
          animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>
              {t('common.back')}
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {t('systemAccessApply.pageTitle')}
            </h2>
          </div>
          <HelpPopover
            title={t('systemAccessApply.helpTitle')}
            ariaLabel={t('systemAccessApply.helpAria')}
            placement="bottomRight"
            width={420}
            content={[
              { tone: 'info', label: t('systemAccessApply.helpStep1Label'), body: t('systemAccessApply.helpStep1') },
              { tone: 'neutral', label: t('systemAccessApply.helpStep2Label'), body: t('systemAccessApply.helpStep2') },
              { tone: 'success', label: t('systemAccessApply.helpStep3Label'), body: t('systemAccessApply.helpStep3') },
              { tone: 'warn', label: t('systemAccessApply.helpScopeLabel'), body: t('systemAccessApply.helpScope') },
            ]}
          />
        </div>
      </div>

      {pendingFlowNo && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('systemAccessApply.pendingTitle')}
          description={t('systemAccessApply.pendingDesc', { flowNo: pendingFlowNo })}
          action={
            <Button size="small" onClick={() => navigate('/portal')}>
              {t('systemAccessApply.backPortal')}
            </Button>
          }
        />
      )}

      {/* ====== 基本信息 ====== */}
      <div style={cardStyle}>
        {renderCardTitle(
          <ProfileOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
          '#e6f7ff', '#1890ff', t('systemAccessApply.basicSection'),
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { label: t('systemAccessApply.applicant'), value: user?.name || '--' },
            { label: t('systemAccessApply.empId'), value: user?.empId || '--' },
            { label: t('systemAccessApply.department'), value: user?.department || '--' },
            { label: t('systemAccessApply.position'), value: user?.position || '--' },
            { label: t('systemAccessApply.applyDate'), value: applyDate },
          ].map((item) => (
            <div key={item.label}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 13, color: '#262626', fontWeight: 500 }}>{item.value}</div>
            </div>
          ))}
          {/* 申請系統：門戶帶參進入時已鎖定（只讀）；直接打開本页時由申請人自選 */}
          <div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
              {t('systemAccessApply.targetSystem')}
              <span style={{ color: '#ff4d4f', marginLeft: 2 }}>*</span>
            </div>
            {paramSystem ? (
              <div style={{ fontSize: 13, color: '#262626', fontWeight: 500 }}>{systemName}</div>
            ) : (
              <Select
                style={{ width: '100%' }}
                value={systemCode || undefined}
                placeholder={t('systemAccessApply.systemPlaceholder')}
                onChange={(value: string) => {
                  setSystemCode(value)
                  // 参考角色目录按系统裁剪：换系统后原选择属于上一个系统，留着会被后端拒掉
                  setPreferredRoleId(ROLE_NONE)
                  setPendingFlowNo(null)
                }}
                notFoundContent={systemOptionsError
                  ? t('systemAccessApply.systemLoadError')
                  : t('systemAccessApply.systemEmpty')}
                options={systemOptions.map((item) => ({
                  value: item.code,
                  label: getSystemDisplayName(t, item, i18n.language),
                }))}
              />
            )}
          </div>
        </div>
        {!paramSystem && systemOptionsError && (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 16 }}
            message={t('systemAccessApply.systemLoadError')}
            action={
              <Button size="small" onClick={() => navigate('/portal?tab=unauthorized')}>
                {t('systemAccessApply.goPortal')}
              </Button>
            }
          />
        )}
      </div>

      {/* ====== 使用诉求（场景 + 期限 + 说明）====== */}
      <div style={cardStyle}>
        {renderCardTitle(
          <FormOutlined style={{ fontSize: 14, color: '#722ed1' }} />,
          '#f9f0ff', '#722ed1', t('systemAccessApply.demandSection'),
          <HelpPopover
            title={t('systemAccessApply.demandHelpTitle')}
            ariaLabel={t('systemAccessApply.demandHelpAria')}
            placement="bottomRight"
            width={420}
            content={[
              { tone: 'info', label: t('systemAccessApply.demandHelpWhyLabel'), body: t('systemAccessApply.demandHelpWhy') },
              { tone: 'neutral', label: t('systemAccessApply.demandHelpWriteLabel'), body: t('systemAccessApply.demandHelpWrite') },
            ]}
          />,
        )}

        <div style={{ marginBottom: 20 }}>
          {renderFieldLabel(t('systemAccessApply.scenarioLabel'), true)}
          <Checkbox.Group
            options={scenarioOptions}
            value={scenarios}
            onChange={(values) => setScenarios(values.map(String))}
            style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 0' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          {renderFieldLabel(t('systemAccessApply.durationLabel'), true)}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Radio.Group
              value={durationType}
              onChange={(event) => {
                const next = event.target.value as SystemAccessDurationType
                setDurationType(next)
                // 切回「长期」时清掉日期：留着会让确认弹窗与提交体出现「长期但带截止日」的矛盾
                if (next === 'permanent') setDurationUntil(null)
              }}
            >
              <Radio value="permanent">{t('systemAccessApply.durationPermanent')}</Radio>
              <Radio value="until">{t('systemAccessApply.durationUntil')}</Radio>
            </Radio.Group>
            {durationType === 'until' && (
              <DatePicker
                value={durationUntil}
                onChange={(value) => setDurationUntil(value)}
                disabledDate={disabledDurationDate}
                placeholder={t('systemAccessApply.durationDatePlaceholder')}
                allowClear={false}
                style={{ width: 180 }}
              />
            )}
          </div>
          {/* 回收规则必须写在界面上：选了「至指定日期」就是承诺到期次日自动收回角色，
              不能只当审批人参考——否则申请人会以为权限是永久的。 */}
          <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 8 }}>
            {t('systemAccessApply.durationHint')}
          </div>
        </div>

        <div>
          {renderFieldLabel(t('systemAccessApply.reasonLabel'), true)}
          {/* 与 AI 使用申请的「用途說明」同口径（rows=4 / maxLength=1000 / showCount）：
              它是本流程的主输入项而不是備註，故不走 RemarkTextArea（那个是 200 字備註标准） */}
          <Input.TextArea
            rows={4}
            maxLength={REASON_MAX_LENGTH}
            showCount
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('systemAccessApply.reasonPlaceholder')}
          />
        </div>
      </div>

      {/* ====== 参考角色（选填；目录为空时整卡不渲染，页面退化为纯诉求制）====== */}
      {showRoleCard && (
        <div style={cardStyle}>
          {renderCardTitle(
            <TeamOutlined style={{ fontSize: 14, color: '#fa8c16' }} />,
            '#fff7e6', '#fa8c16', t('systemAccessApply.preferredRoleSection'),
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>
              {t('systemAccessApply.preferredRoleOptional')}
            </span>,
          )}
          {rolesError ? (
            <Alert
              type="error"
              showIcon
              message={t('systemAccessApply.preferredRoleLoadError')}
              action={
                <Button size="small" onClick={() => setRolesReloadToken((value) => value + 1)}>
                  {t('portal.retry')}
                </Button>
              }
            />
          ) : rolesLoading ? (
            <div style={{ padding: '16px 0', textAlign: 'center' }}><Spin /></div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 12 }}>
                {t('systemAccessApply.preferredRoleHint')}
              </div>
              <Radio.Group
                value={preferredRoleId}
                /* antd 把原生 DOM 事件透传上来，event.target.value 永远是字符串（input.value 只能是字符串），
                   写 `as number` 只是骗过类型检查：不 Number() 一下，下面按 roleId 找角色名会永远找不到，
                   提交体里也会变成字符串 ID */
                onChange={(event) => setPreferredRoleId(Number(event.target.value))}
                style={{ width: '100%' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/*
                   * 卡片就是 antd Radio 自己渲染的那个 label（样式直接给 Radio），不再外套一层 <label>：
                   * 嵌套 label 不是合法 HTML，而且点击会被两层 label 各转发一次，行为不可控。
                   */}
                  <Radio
                    value={ROLE_NONE}
                    style={{
                      ...roleCardStyle,
                      border: `1px solid ${preferredRoleId === ROLE_NONE ? '#E8720C' : '#e8eaed'}`,
                      background: preferredRoleId === ROLE_NONE ? '#fff7e6' : '#fff',
                    }}
                  >
                    <span style={{ fontSize: 13, color: '#262626' }}>
                      {t('systemAccessApply.preferredRoleNone')}
                    </span>
                  </Radio>
                  {roleOptions.map((role) => {
                    const selected = role.roleId === preferredRoleId
                    return (
                      <Radio
                        key={role.roleId}
                        value={role.roleId}
                        style={{
                          ...roleCardStyle,
                          border: `1px solid ${selected ? '#E8720C' : '#e8eaed'}`,
                          background: selected ? '#fff7e6' : '#fff',
                        }}
                      >
                        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <TeamOutlined style={{ color: selected ? '#E8720C' : '#8C8C8C' }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>{role.roleName}</span>
                          </span>
                          {/* 只展示管理员写的业务说明：不列菜单、不列权限数，自助入口不能变成系统结构地图 */}
                          {role.description && (
                            <span style={{ fontSize: 12, color: '#8c8c8c' }}>{role.description}</span>
                          )}
                        </span>
                      </Radio>
                    )
                  })}
                </div>
              </Radio.Group>
              <div style={{
                marginTop: 12, fontSize: 12, color: '#8c8c8c', lineHeight: 1.7,
                borderTop: '1px dashed #f0f0f0', paddingTop: 10,
              }}>
                {t('systemAccessApply.preferredRoleFooter')}
              </div>
            </>
          )}
        </div>
      )}

      {/* ====== 相关凭证 ====== */}
      <div style={cardStyle}>
        {renderCardTitle(
          <UploadOutlined style={{ fontSize: 14, color: '#52c41a' }} />,
          '#f6ffed', '#52c41a', t('systemAccessApply.attachmentSection'),
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('systemAccessApply.attachmentHint')}</span>,
        )}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {credentials.map((item, index) => (
            <div key={`${item.name}_${index}`} style={{
              width: 88, height: 88, border: '1px solid #e8e8e8', borderRadius: 8,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              position: 'relative', background: '#fafafa', overflow: 'hidden',
            }}>
              {/* 图片给真实缩略图（antd Image 自带点击预览），与审批端口径一致，
                  也让人提交前就能确认传的是不是那张；PDF 无法内嵌预览，继续给图标 */}
              {item.type === 'pdf'
                ? <FilePdfOutlined style={{ fontSize: 28, color: '#E53935' }} />
                : (
                  <Image
                    src={item.dataUrl}
                    alt={item.name}
                    width={86}
                    height={64}
                    style={{ objectFit: 'cover' }}
                  />
                )}
              <span style={{
                fontSize: 10, color: '#999', marginTop: 4, maxWidth: 76,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{item.name}</span>
              <Button type="text" size="small" danger
                aria-label={`${t('common.delete')} ${item.name}`}
                style={{
                  position: 'absolute', top: -6, right: -6, width: 20, height: 20,
                  borderRadius: '50%', background: '#ff4d4f', color: '#fff',
                  fontSize: 12, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onClick={() => removeCredential(index)}
              >×</Button>
            </div>
          ))}
          {credentials.length < ATTACHMENT_MAX_COUNT ? (
            <Upload multiple accept="image/*,application/pdf" showUploadList={false} beforeUpload={handleUpload}>
              <div style={{
                width: 88, height: 88, border: '1px dashed #d9d9d9', borderRadius: 8,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: uploading ? 'wait' : 'pointer', color: '#999', fontSize: 12, background: '#fafafa',
              }}>
                {uploading ? <Spin size="small" /> : <UploadOutlined style={{ fontSize: 22, marginBottom: 4 }} />}
                <span>{t('systemAccessApply.attachmentUpload')}</span>
              </div>
            </Upload>
          ) : (
            /* 满额时不能只隐藏上传入口就完事：用户会以为上传坏了，必须明说原因与怎么办 */
            <div style={{
              width: 88, height: 88, border: '1px dashed #e8e8e8', borderRadius: 8, background: '#fafafa',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, color: '#8c8c8c', fontSize: 11, textAlign: 'center', padding: '0 6px',
            }}>
              <InboxOutlined style={{ fontSize: 20 }} />
              <span>{t('systemAccessApply.attachmentLimitReached', { count: ATTACHMENT_MAX_COUNT })}</span>
            </div>
          )}
        </div>
      </div>

      {/* ====== 底部操作按钮 ====== */}
      <div className="form-footer">
        <Button onClick={handleBack}>{t('common.cancel')}</Button>
        <Button
          type="primary"
          icon={<SendOutlined />}
          loading={submitting}
          disabled={!systemCode || !!pendingFlowNo}
          onClick={() => handleSubmit()}
        >
          {t('systemAccessApply.submit')}
        </Button>
      </div>

      {/* ====== 提交成功弹窗 ====== */}
      {successVisible && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: '32px 28px', width: 420, textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          }}>
            <div style={{
              width: 64, height: 64, margin: '0 auto 20px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #52C41A, #73D13D)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(82,196,26,0.3)',
            }}>
              <CheckCircleOutlined style={{ fontSize: 32, color: '#fff' }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: '#262626', marginBottom: 12 }}>
              {t('systemAccessApply.submitSuccessTitle')}
            </h3>
            <p style={{ fontSize: 14, color: '#595959', lineHeight: 1.8, marginBottom: 24 }}>
              {submittedFlowNo && (
                <>
                  {t('systemAccessApply.flowNoLabel')}
                  <span style={{ color: '#E8720C', fontWeight: 500 }}>{submittedFlowNo}</span>
                  <br />
                </>
              )}
              {t(hasMenuPermission('oa-requests')
                ? 'systemAccessApply.submitSuccessDescTrackable'
                : 'systemAccessApply.submitSuccessDescPortal')}
            </p>
            <Button type="primary" size="large" style={{ minWidth: 140, height: 40, borderRadius: 8 }}
              onClick={() => navigate('/portal')}>
              {t('systemAccessApply.backToPortalCountdown', { count: countdown })}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
