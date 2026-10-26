/**
 * V3 灰度管理 —— GLOBAL 熔斷 + 項目級雙獨立開關
 *
 * 口徑鐵律（UI 必須如實呈现）：
 * 1. **默認關閉**：缺行/值為 null 一律按「關閉」呈现，不自動補行；
 * 2. **熔斷優先**：GLOBAL 的 global_write_paused / global_release_paused 一旦開啟，優先於任何項目級開啟；
 * 3. **開啟灰度 ≠ 放開發布門禁**：發布仍須過測試/驗收/缺陷/依賴/範圍全部硬門禁與四眼 —— 這類多句規則用 HelpPopover；
 * 4. **effective 僅展示**：合成結果只供展示，門禁判定以服務層讀側權威方法為準；
 * 5. **僅管理員可操作**：rdm-delivery-release:edit；非管理員禁用開關。
 *
 * 開關切換走 Modal.confirm + custom-confirm-modal；expectedVersion 只在「灰度行已存在」時帶入 update（乐观锁）：
 * 行不存在時必須以「新建」語義提交，帶 expectedVersion（哪怕 0）會被後端判為並發衝突而拒絕，
 * 項目級灰度會因此永遠開不起來。
 *
 * 文案已走 i18n（§H）：統一 `t('rdm.grayscale.*', { defaultValue: '原繁體' })`，
 * key 萬一沒進語言包，繁体界面照樣顯示原文，不會退化成頁面上出現原始 key。
 * RDM_GRAYSCALE_FLAG_LABEL（模块顶层枚举 label）暂留硬编码：它求值早于 i18n 初始化，
 * 需先把常量表改成 getter 才能纳入，属下一批次（见 .qoder/scripts/check-i18n-coverage.py 的 rdm 域注释）。
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Descriptions, Input, InputNumber, Modal, Space, Spin, Switch, Tag, message } from 'antd'
import { ControlOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import RdmFormHeader from './components/RdmFormHeader'
import { formatRdmDateTime } from './datetime'
import HelpPopover from '@/components/HelpPopover'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
  fetchGrayscaleStatus, updateGlobalFlowFlags, updateProjectFlowFlags,
  type RdmGrayscaleStatus,
} from '@/api/rdm'
import { RDM_GRAYSCALE_FLAG_COLOR, RDM_GRAYSCALE_FLAG_LABEL } from '@/constants/rdm'
import './index.css'

/** 0/1/null → 布爾（null=缺行=關閉） */
const isOn = (v: number | null | undefined) => v === 1

/**
 * 页面内文案取数器：把 t 与固定前缀收进一个函数，避免 60+ 处重复写 'rdm.grayscale.' 与 defaultValue。
 * 返回值仍是 string，所以可以直接喂给 SwitchRow 这类纯展示属性。
 */
type Txt = (key: string, original: string, options?: Record<string, unknown>) => string

/** 布爾展示標籤（txt 逐次传入，不用 factory + useCallback：那样 eslint 会报依赖不可知）*/
const flagTag = (txt: Txt, v: number | null | undefined) => (
  <Tag color={RDM_GRAYSCALE_FLAG_COLOR[String(v ?? 0)] ?? 'default'} style={{ margin: 0 }}>
    {RDM_GRAYSCALE_FLAG_LABEL[String(v ?? 0)] ?? txt('rdm.grayscale.flagOff', '關閉')}
  </Tag>
)
/** effective（boolean|null）展示 */
const effectiveTag = (txt: Txt, v: boolean | null) => (
  <Tag color={v ? 'success' : 'default'} style={{ margin: 0 }}>
    {v ? txt('rdm.grayscale.flagOn', '開啟') : txt('rdm.grayscale.flagOff', '關閉')}
  </Tag>
)

export default function GrayscaleConfig() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const txt = useCallback<Txt>((key, original, options) => t(key, { defaultValue: original, ...options }), [t])
  const { hasPermission } = useAuth()
  /** 僅管理員可操作（與後端 @RequirePermission(menu=rdm-delivery-release, action=edit) 一致） */
  const canEdit = hasPermission('rdm-delivery-release:edit')

  const [projectId, setProjectId] = useState<number | undefined>(undefined)
  const [status, setStatus] = useState<RdmGrayscaleStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)

  const load = useCallback(async (pid?: number) => {
    setLoading(true)
    try {
      const res = await fetchGrayscaleStatus(pid)
      setStatus(res)
      if (!res) message.warning(txt('rdm.grayscale.stateUnavailable', '灰度狀態不可用（後端未就緒）'))
    } catch {
      message.error(txt('rdm.grayscale.loadFail', '灰度狀態載入失敗'))
    } finally {
      setLoading(false)
    }
  }, [txt])

  useEffect(() => { load(projectId) }, [load, projectId])

  /**
   * 開關切換統一確認：Modal.confirm + custom-confirm-modal，內容含必填原因輸入。
   * onOk 返回 rejected promise 可阻止關閉（原因為空時）。
   */
  const confirmToggle = (title: string, desc: string, onOk: (reason: string) => Promise<unknown>) => {
    let reasonVal = ''
    Modal.confirm({
      title,
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>{desc}</div>
          <Input placeholder={txt('rdm.grayscale.reasonPlaceholder', '變更原因（必填，審計留痕）')} onChange={e => { reasonVal = e.target.value }} />
          <div style={{ marginTop: 8, color: '#8C8C8C', fontSize: 12 }}>
            {txt('rdm.grayscale.gateNote', '開啟灰度 ≠ 放開發布門禁：發布仍須過全部硬門禁與四眼。')}
          </div>
        </div>
      ),
      okText: txt('rdm.grayscale.confirmChange', '確認變更'),
      cancelText: t('common.cancel', '取消'),
      onOk: async () => {
        if (!reasonVal.trim()) {
          message.warning(txt('rdm.grayscale.reasonRequired', '請填寫變更原因'))
          return Promise.reject(new Error('reason required'))
        }
        setUpdating(true)
        try {
          await onOk(reasonVal.trim())
          await load(projectId)
        } catch {
          // request.ts 已统一弹后端失败原因
        } finally {
          setUpdating(false)
        }
        return undefined
      },
    })
  }

  // ── GLOBAL 開關變更（四個獨立開關，null=不變；expectedVersion 取 global.version）──
  const toggleGlobal = (field: 'v3WriteEnabled' | 'v3ReleaseEnabled' | 'globalWritePaused' | 'globalReleasePaused', next: number, label: string) => {
    const g = status?.global
    if (!g) return
    confirmToggle(
      txt('rdm.grayscale.toggleGlobalTitle', `變更 GLOBAL ${label}`, { label }),
      txt('rdm.grayscale.toggleGlobalDesc',
        `將 GLOBAL 的「${label}」設為「${RDM_GRAYSCALE_FLAG_LABEL[String(next)]}」。熔斷優先於任何項目級開啟，請確認影響面。`,
        { label, value: RDM_GRAYSCALE_FLAG_LABEL[String(next)] }),
      async (reason) => {
        await updateGlobalFlowFlags({ [field]: next, expectedVersion: g.exists ? g.version ?? undefined : undefined, reason })
        message.success(txt('rdm.grayscale.globalUpdated', 'GLOBAL 灰度開關已更新'))
      },
    )
  }

  // ── 項目級開關變更（雙獨立開關，null=不變；expectedVersion 取 project.version）──
  const toggleProject = (field: 'v3WriteEnabled' | 'v3ReleaseEnabled', next: number, label: string) => {
    const p = status?.project
    if (!p || !p.exists) {
      message.warning(txt('rdm.grayscale.projectNoRow', '該項目尚無灰度行（默認關閉）；首次開啟將由後端建項並落審計'))
    }
    if (!projectId) {
      message.warning(txt('rdm.grayscale.needProjectId', '請先指定項目 ID'))
      return
    }
    confirmToggle(
      txt('rdm.grayscale.toggleProjectTitle', `變更項目 ${label}`, { label }),
      txt('rdm.grayscale.toggleProjectDesc',
        `將項目 #${projectId} 的「${label}」設為「${RDM_GRAYSCALE_FLAG_LABEL[String(next)]}」（另一開關不變）。`,
        { projectId, label, value: RDM_GRAYSCALE_FLAG_LABEL[String(next)] }),
      async (reason) => {
        await updateProjectFlowFlags({ projectId, [field]: next, expectedVersion: p?.exists ? p.version ?? undefined : undefined, reason })
        message.success(txt('rdm.grayscale.projectUpdated', '項目灰度開關已更新'))
      },
    )
  }

  const g = status?.global
  const p = status?.project

  return (
    <div className="content-area">
      <RdmFormHeader
        title={txt('rdm.grayscale.title', 'V3 灰度管理')}
        onBack={() => navigate('/rdm-project')}
        backText={txt('rdm.grayscale.backProject', '返回項目總覽')}
        badge={<Tag color="orange" style={{ margin: 0 }}>{txt('rdm.grayscale.adminOnly', '僅管理員')}</Tag>}
        right={
          <Space>
            <InputNumber
              min={1} placeholder={txt('rdm.grayscale.projectIdPlaceholder', '項目 ID（可選）')} value={projectId} style={{ width: 160 }}
              onChange={v => setProjectId(v ?? undefined)}
            />
            <Button icon={<ReloadOutlined />} onClick={() => load(projectId)}>{txt('rdm.grayscale.refresh', '刷新')}</Button>
          </Space>
        }
      />

      {/* ── 多句規則說明：HelpPopover（不用 Tooltip）── */}
      <Alert
        type="info"
        showIcon
        icon={<ControlOutlined />}
        style={{ marginBottom: 16 }}
        message={
          <Space>
            {txt('rdm.grayscale.helpHeading', '灰度口徑說明')}
            <HelpPopover
              ariaLabel={txt('rdm.grayscale.helpAria', '灰度口徑與門禁關係說明')}
              title={txt('rdm.grayscale.helpPanelTitle', '灰度口徑（務必先讀）')}
              icon="info"
              width={420}
              content={[
                { label: txt('rdm.grayscale.labelDefaultOff', '默認關閉'), body: txt('rdm.grayscale.helpDefaultOff', '未建灰度行或值為 null，一律按「關閉」呈現，系統不會自動補行或默認開啟。'), tone: 'neutral' },
                { label: txt('rdm.grayscale.labelFusePriority', '熔斷優先'), body: txt('rdm.grayscale.helpFuse', 'GLOBAL 的 global_write_paused / global_release_paused 一旦開啟，優先於任何項目級開啟，對應全局立即停寫/停發。'), tone: 'danger' },
                { label: txt('rdm.grayscale.labelGateNotRelease', '開啟灰度 ≠ 放開發布門禁'), body: txt('rdm.grayscale.helpGate', '發布仍須過測試、驗收、缺陷、依賴、範圍全部硬門禁與四眼複核，灰度開啟只代表該項目被允許走 V3 寫入/發布動線。'), tone: 'warn' },
                { label: txt('rdm.grayscale.labelEffectiveOnly', 'effective 僅展示'), body: txt('rdm.grayscale.helpEffective', '合成的 effectiveV3Write / effectiveV3Release 只供展示，真正門禁判定以服務層讀側權威方法為準。'), tone: 'info' },
              ]}
            >
              <Button type="link" size="small" style={{ padding: 0 }}>{txt('rdm.grayscale.helpTrigger', '為什麼開啟灰度也不等於能發布？')}</Button>
            </HelpPopover>
          </Space>
        }
        description={txt('rdm.grayscale.helpDescription', 'GLOBAL 熔斷 + 項目級雙獨立開關（V3 寫入 / V3 發布）分別切換，null=不變；僅管理員可操作。')}
      />

      {!canEdit && (
        <Alert type="warning" showIcon icon={<WarningOutlined />} style={{ marginBottom: 16 }}
          message={txt('rdm.grayscale.noPermTitle', '僅管理員可操作灰度開關')}
          description={txt('rdm.grayscale.noPermDesc', '你當前無 rdm-delivery-release:edit 權限，以下開關僅可查看、不可切換。')} />
      )}

      {loading && !status ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : (
        <>
          {/* ── GLOBAL 熔斷 + 總閘（模块分组用 .rdm-card，不用 antd Card 彩色标题头，§B.6/§9.1）── */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#FFEBEE', color: '#FF4D4F' }}>
                <WarningOutlined />
              </span>
              {txt('rdm.grayscale.globalCard', 'GLOBAL 灰度 / 熔斷')}
              <span className="rdm-card-title-split" />
            </div>
            {g ? (
              <>
                <Descriptions size="small" column={3} bordered style={{ marginBottom: 16 }}
                  styles={{ label: { color: '#8C8C8C', fontSize: 12 }, content: { fontSize: 13 } }}>
                  <Descriptions.Item label={txt('rdm.grayscale.rowExists', '行是否存在')}>{g.exists ? txt('rdm.grayscale.rowYes', '是') : txt('rdm.grayscale.rowNo', '否（默認關閉）')}</Descriptions.Item>
                  <Descriptions.Item label="scope_key">{g.scopeKey ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label={txt('rdm.grayscale.version', '版本')}>v{g.version ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label={txt('rdm.grayscale.productDays', '產品驗收天數')}>{g.productVerificationDays ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label={txt('rdm.grayscale.businessDays', '業務驗收天數')}>{g.businessVerificationDays ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label={txt('rdm.grayscale.updatedAt', '更新時間')}>{formatRdmDateTime(g.updatedAt)}</Descriptions.Item>
                </Descriptions>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <SwitchRow label={txt('rdm.grayscale.globalWriteGate', '全局 V3 寫入總閘')} hint={txt('rdm.grayscale.globalWriteGateHint', '關閉後所有項目都不能走 V3 寫入')}
                    checked={isOn(g.v3WriteEnabled)} disabled={!canEdit || updating} tag={flagTag(txt, g.v3WriteEnabled)}
                    onChange={next => toggleGlobal('v3WriteEnabled', next ? 1 : 0, 'V3 寫入總閘')} />
                  <SwitchRow label={txt('rdm.grayscale.globalReleaseGate', '全局 V3 發布總閘')} hint={txt('rdm.grayscale.globalReleaseGateHint', '關閉後所有項目都不能走 V3 發布')}
                    checked={isOn(g.v3ReleaseEnabled)} disabled={!canEdit || updating} tag={flagTag(txt, g.v3ReleaseEnabled)}
                    onChange={next => toggleGlobal('v3ReleaseEnabled', next ? 1 : 0, 'V3 發布總閘')} />
                  <SwitchRow label={txt('rdm.grayscale.globalWriteFuse', '全局寫入熔斷')} hint={txt('rdm.grayscale.globalWriteFuseHint', '開啟=立即停寫，優先於任何項目級開啟')} danger
                    checked={isOn(g.globalWritePaused)} disabled={!canEdit || updating} tag={flagTag(txt, g.globalWritePaused)}
                    onChange={next => toggleGlobal('globalWritePaused', next ? 1 : 0, '全局寫入熔斷')} />
                  <SwitchRow label={txt('rdm.grayscale.globalReleaseFuse', '全局發布熔斷')} hint={txt('rdm.grayscale.globalReleaseFuseHint', '開啟=立即停發，優先於任何項目級開啟')} danger
                    checked={isOn(g.globalReleasePaused)} disabled={!canEdit || updating} tag={flagTag(txt, g.globalReleasePaused)}
                    onChange={next => toggleGlobal('globalReleasePaused', next ? 1 : 0, '全局發布熔斷')} />
                </Space>
              </>
            ) : (
              <Empty2 text={txt('rdm.grayscale.globalEmpty', 'GLOBAL 灰度狀態不可用')} />
            )}
          </div>

          {/* ── 項目級雙獨立開關 ── */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#e6f7ff', color: '#1890ff' }}>
                <ControlOutlined />
              </span>
              {txt('rdm.grayscale.projectCard', '項目級灰度（雙獨立開關）')}{projectId ? `· #${projectId}` : txt('rdm.grayscale.noProjectSelected', '（未指定項目）')}
              <span className="rdm-card-title-split" />
            </div>
            {status ? (
              <>
                <Descriptions size="small" column={3} bordered style={{ marginBottom: 16 }}
                  styles={{ label: { color: '#8C8C8C', fontSize: 12 }, content: { fontSize: 13 } }}>
                  <Descriptions.Item label={txt('rdm.grayscale.projectRowExists', '項目行是否存在')}>{p?.exists ? txt('rdm.grayscale.rowYes', '是') : txt('rdm.grayscale.rowNo', '否（默認關閉）')}</Descriptions.Item>
                  <Descriptions.Item label="scope_key">{p?.scopeKey ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label={txt('rdm.grayscale.projectRowVersion', '項目行版本')}>v{p?.version ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label={txt('rdm.grayscale.mergedWrite', '合成 effectiveV3Write')}>{effectiveTag(txt, status.effectiveV3Write)}</Descriptions.Item>
                  <Descriptions.Item label={txt('rdm.grayscale.mergedRelease', '合成 effectiveV3Release')}>{effectiveTag(txt, status.effectiveV3Release)}</Descriptions.Item>
                  <Descriptions.Item label={txt('rdm.grayscale.updatedAt', '更新時間')}>{formatRdmDateTime(p?.updatedAt)}</Descriptions.Item>
                </Descriptions>
                <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                  message={txt('rdm.grayscale.effectiveNote', 'effective 僅供展示：熔斷優先，且開啟灰度不代表可發布（仍須過全部硬門禁與四眼）。')} />
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <SwitchRow label={txt('rdm.grayscale.projectWrite', '項目 V3 寫入')} hint={txt('rdm.grayscale.projectWriteHint', '與發布開關完全獨立，分別切換')}
                    checked={isOn(p?.v3WriteEnabled)} disabled={!canEdit || updating || !projectId} tag={flagTag(txt, p?.v3WriteEnabled)}
                    onChange={next => toggleProject('v3WriteEnabled', next ? 1 : 0, 'V3 寫入')} />
                  <SwitchRow label={txt('rdm.grayscale.projectRelease', '項目 V3 發布')} hint={txt('rdm.grayscale.projectReleaseHint', '與寫入開關完全獨立，分別切換')}
                    checked={isOn(p?.v3ReleaseEnabled)} disabled={!canEdit || updating || !projectId} tag={flagTag(txt, p?.v3ReleaseEnabled)}
                    onChange={next => toggleProject('v3ReleaseEnabled', next ? 1 : 0, 'V3 發布')} />
                </Space>
              </>
            ) : (
              <Empty2 text={txt('rdm.grayscale.projectEmpty', '請輸入項目 ID 後查看項目級灰度')} />
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** 開關行（讀展示 + 切換觸發確認；實際值以後端返回為準，不本地乐观翻转） */
function SwitchRow({ label, hint, checked, disabled, danger, tag, onChange }: {
  label: string; hint?: string; checked: boolean; disabled?: boolean; danger?: boolean
  tag: React.ReactNode; onChange: (next: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', border: '1px solid #f0f0f0', borderRadius: 8 }}>
      <Switch checked={checked} disabled={disabled} onChange={onChange} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: danger ? '#CF1322' : '#262626' }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: '#8C8C8C' }}>{hint}</div>}
      </div>
      {tag}
    </div>
  )
}

/** 空態 */
function Empty2({ text }: { text: string }) {
  return <div style={{ textAlign: 'center', color: '#8C8C8C', padding: 16, fontSize: 13 }}>{text}</div>
}
