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
 * 開關切換走 Modal.confirm + custom-confirm-modal；expectedVersion 從灰度查詢結果帶入 update（乐观锁）。
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Descriptions, Input, InputNumber, Modal, Space, Spin, Switch, Tag, message } from 'antd'
import { ControlOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons'
import RdmFormHeader from './components/RdmFormHeader'
import HelpPopover from '../../components/HelpPopover'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
  fetchGrayscaleStatus, updateGlobalFlowFlags, updateProjectFlowFlags,
  type RdmGrayscaleStatus,
} from '../../api/rdm'
import { RDM_GRAYSCALE_FLAG_COLOR, RDM_GRAYSCALE_FLAG_LABEL } from '../../constants/rdm'
import './index.css'

/** 0/1/null → 布爾（null=缺行=關閉） */
const isOn = (v: number | null | undefined) => v === 1
/** 布爾展示標籤 */
const flagTag = (v: number | null | undefined) => (
  <Tag color={RDM_GRAYSCALE_FLAG_COLOR[String(v ?? 0)] ?? 'default'} style={{ margin: 0 }}>
    {RDM_GRAYSCALE_FLAG_LABEL[String(v ?? 0)] ?? '關閉'}
  </Tag>
)
/** effective（boolean|null）展示 */
const effectiveTag = (v: boolean | null) => (
  <Tag color={v ? 'success' : 'default'} style={{ margin: 0 }}>{v ? '開啟' : '關閉'}</Tag>
)

export default function GrayscaleConfig() {
  const navigate = useNavigate()
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
      if (!res) message.warning('灰度狀態不可用（後端未就緒）')
    } catch {
      message.error('灰度狀態載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

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
          <Input placeholder="變更原因（必填，審計留痕）" onChange={e => { reasonVal = e.target.value }} />
          <div style={{ marginTop: 8, color: '#8C8C8C', fontSize: 12 }}>
            開啟灰度 ≠ 放開發布門禁：發布仍須過全部硬門禁與四眼。
          </div>
        </div>
      ),
      okText: '確認變更',
      cancelText: '取消',
      onOk: async () => {
        if (!reasonVal.trim()) {
          message.warning('請填寫變更原因')
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
      `變更 GLOBAL ${label}`,
      `將 GLOBAL 的「${label}」設為「${RDM_GRAYSCALE_FLAG_LABEL[String(next)]}」。熔斷優先於任何項目級開啟，請確認影響面。`,
      async (reason) => {
        await updateGlobalFlowFlags({ [field]: next, expectedVersion: g.version ?? 0, reason })
        message.success('GLOBAL 灰度開關已更新')
      },
    )
  }

  // ── 項目級開關變更（雙獨立開關，null=不變；expectedVersion 取 project.version）──
  const toggleProject = (field: 'v3WriteEnabled' | 'v3ReleaseEnabled', next: number, label: string) => {
    const p = status?.project
    if (!p || !p.exists) {
      message.warning('該項目尚無灰度行（默認關閉）；首次開啟將由後端建項並落審計')
    }
    if (!projectId) {
      message.warning('請先指定項目 ID')
      return
    }
    confirmToggle(
      `變更項目 ${label}`,
      `將項目 #${projectId} 的「${label}」設為「${RDM_GRAYSCALE_FLAG_LABEL[String(next)]}」（另一開關不變）。`,
      async (reason) => {
        await updateProjectFlowFlags({ projectId, [field]: next, expectedVersion: p?.version ?? 0, reason })
        message.success('項目灰度開關已更新')
      },
    )
  }

  const g = status?.global
  const p = status?.project

  return (
    <div className="content-area">
      <RdmFormHeader
        title="V3 灰度管理"
        onBack={() => navigate('/rdm-project')}
        backText="返回項目總覽"
        badge={<Tag color="orange" style={{ margin: 0 }}>僅管理員</Tag>}
        right={
          <Space>
            <InputNumber
              min={1} placeholder="項目 ID（可選）" value={projectId} style={{ width: 160 }}
              onChange={v => setProjectId(v ?? undefined)}
            />
            <Button icon={<ReloadOutlined />} onClick={() => load(projectId)}>刷新</Button>
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
            灰度口徑說明
            <HelpPopover
              ariaLabel="灰度口徑與門禁關係說明"
              title="灰度口徑（務必先讀）"
              icon="info"
              width={420}
              content={[
                { label: '默認關閉', body: '未建灰度行或值為 null，一律按「關閉」呈現，系統不會自動補行或默認開啟。', tone: 'neutral' },
                { label: '熔斷優先', body: 'GLOBAL 的 global_write_paused / global_release_paused 一旦開啟，優先於任何項目級開啟，對應全局立即停寫/停發。', tone: 'danger' },
                { label: '開啟灰度 ≠ 放開發布門禁', body: '發布仍須過測試、驗收、缺陷、依賴、範圍全部硬門禁與四眼複核，灰度開啟只代表該項目被允許走 V3 寫入/發布動線。', tone: 'warn' },
                { label: 'effective 僅展示', body: '合成的 effectiveV3Write / effectiveV3Release 只供展示，真正門禁判定以服務層讀側權威方法為準。', tone: 'info' },
              ]}
            >
              <Button type="link" size="small" style={{ padding: 0 }}>為什麼開啟灰度也不等於能發布？</Button>
            </HelpPopover>
          </Space>
        }
        description="GLOBAL 熔斷 + 項目級雙獨立開關（V3 寫入 / V3 發布）分別切換，null=不變；僅管理員可操作。"
      />

      {!canEdit && (
        <Alert type="warning" showIcon icon={<WarningOutlined />} style={{ marginBottom: 16 }}
          message="僅管理員可操作灰度開關" description="你當前無 rdm-delivery-release:edit 權限，以下開關僅可查看、不可切換。" />
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
              GLOBAL 灰度 / 熔斷
              <span className="rdm-card-title-split" />
            </div>
            {g ? (
              <>
                <Descriptions size="small" column={3} bordered style={{ marginBottom: 16 }}
                  labelStyle={{ color: '#8C8C8C', fontSize: 12 }} contentStyle={{ fontSize: 13 }}>
                  <Descriptions.Item label="行是否存在">{g.exists ? '是' : '否（默認關閉）'}</Descriptions.Item>
                  <Descriptions.Item label="scope_key">{g.scopeKey ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="版本">v{g.version ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="產品驗收天數">{g.productVerificationDays ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="業務驗收天數">{g.businessVerificationDays ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="更新時間">{g.updatedAt?.slice(0, 16).replace('T', ' ') || '-'}</Descriptions.Item>
                </Descriptions>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <SwitchRow label="全局 V3 寫入總閘" hint="關閉後所有項目都不能走 V3 寫入"
                    checked={isOn(g.v3WriteEnabled)} disabled={!canEdit || updating} tag={flagTag(g.v3WriteEnabled)}
                    onChange={next => toggleGlobal('v3WriteEnabled', next ? 1 : 0, 'V3 寫入總閘')} />
                  <SwitchRow label="全局 V3 發布總閘" hint="關閉後所有項目都不能走 V3 發布"
                    checked={isOn(g.v3ReleaseEnabled)} disabled={!canEdit || updating} tag={flagTag(g.v3ReleaseEnabled)}
                    onChange={next => toggleGlobal('v3ReleaseEnabled', next ? 1 : 0, 'V3 發布總閘')} />
                  <SwitchRow label="全局寫入熔斷" hint="開啟=立即停寫，優先於任何項目級開啟" danger
                    checked={isOn(g.globalWritePaused)} disabled={!canEdit || updating} tag={flagTag(g.globalWritePaused)}
                    onChange={next => toggleGlobal('globalWritePaused', next ? 1 : 0, '全局寫入熔斷')} />
                  <SwitchRow label="全局發布熔斷" hint="開啟=立即停發，優先於任何項目級開啟" danger
                    checked={isOn(g.globalReleasePaused)} disabled={!canEdit || updating} tag={flagTag(g.globalReleasePaused)}
                    onChange={next => toggleGlobal('globalReleasePaused', next ? 1 : 0, '全局發布熔斷')} />
                </Space>
              </>
            ) : (
              <Empty2 text="GLOBAL 灰度狀態不可用" />
            )}
          </div>

          {/* ── 項目級雙獨立開關 ── */}
          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#e6f7ff', color: '#1890ff' }}>
                <ControlOutlined />
              </span>
              項目級灰度（雙獨立開關）{projectId ? `· #${projectId}` : '（未指定項目）'}
              <span className="rdm-card-title-split" />
            </div>
            {status ? (
              <>
                <Descriptions size="small" column={3} bordered style={{ marginBottom: 16 }}
                  labelStyle={{ color: '#8C8C8C', fontSize: 12 }} contentStyle={{ fontSize: 13 }}>
                  <Descriptions.Item label="項目行是否存在">{p?.exists ? '是' : '否（默認關閉）'}</Descriptions.Item>
                  <Descriptions.Item label="scope_key">{p?.scopeKey ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="項目行版本">v{p?.version ?? '-'}</Descriptions.Item>
                  <Descriptions.Item label="合成 effectiveV3Write">{effectiveTag(status.effectiveV3Write)}</Descriptions.Item>
                  <Descriptions.Item label="合成 effectiveV3Release">{effectiveTag(status.effectiveV3Release)}</Descriptions.Item>
                  <Descriptions.Item label="更新時間">{p?.updatedAt?.slice(0, 16).replace('T', ' ') || '-'}</Descriptions.Item>
                </Descriptions>
                <Alert type="warning" showIcon style={{ marginBottom: 12 }}
                  message="effective 僅供展示：熔斷優先，且開啟灰度不代表可發布（仍須過全部硬門禁與四眼）。" />
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <SwitchRow label="項目 V3 寫入" hint="與發布開關完全獨立，分別切換"
                    checked={isOn(p?.v3WriteEnabled)} disabled={!canEdit || updating || !projectId} tag={flagTag(p?.v3WriteEnabled)}
                    onChange={next => toggleProject('v3WriteEnabled', next ? 1 : 0, 'V3 寫入')} />
                  <SwitchRow label="項目 V3 發布" hint="與寫入開關完全獨立，分別切換"
                    checked={isOn(p?.v3ReleaseEnabled)} disabled={!canEdit || updating || !projectId} tag={flagTag(p?.v3ReleaseEnabled)}
                    onChange={next => toggleProject('v3ReleaseEnabled', next ? 1 : 0, 'V3 發布')} />
                </Space>
              </>
            ) : (
              <Empty2 text="請輸入項目 ID 後查看項目級灰度" />
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
