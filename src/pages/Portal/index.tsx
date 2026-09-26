/**
 * 企业门户：通过两个 Tab 分别展示已授权与未授权系统。
 *
 * 已授权系统以 `/api/portal/context` 为准；未授权展示目录仅供前端界面确认。
 * 已授权卡片整体可点击，进入对应系统首页；未授权卡片不可进入系统，
 * 卡片下方展示「我要申请」，点击弹出确认框引导用户进入权限申请流程。
 * 权限请求失败时展示重试，不将接口异常误判为全部未授权。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Empty, Input, Modal, Spin, Tabs } from 'antd'
import {
  AppstoreOutlined,
  LockOutlined, SafetyCertificateOutlined, SearchOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchPortalContext, type PortalSystem } from '../../api/portal'
import { useCurrentSystem } from '../../hooks/useCurrentSystem'
import { getPortalSystemKey } from '../../constants/portalSystems'
import SystemArtwork from './SystemArtwork'
import './index.css'

/**
 * 前端界面确认阶段的展示目录，与 SystemPortalSchemaInitializer 的十个业务系统对齐。
 * 全量目录接口目前仅权限管理员可用，暂不在门户调用；后续接入门户专用目录接口。
 * 此目录只用于展示未授权系统，不参与授权判断，不能据此放行入口。
 * 新增文案待 i18n 解耦后重构。
 */
const PORTAL_SYSTEM_CATALOG: readonly PortalSystem[] = [
  {
    code: 'ads', name: '廣告推薦系統', nameEn: 'Ads & Recommendation',
    description: '廣告銷售、商家推廣、推廣通、團購秒殺', icon: 'AimOutlined',
  },
  {
    code: 'merchant', name: '商戶運營系統', nameEn: 'Merchant Ops',
    description: '商戶集團、門店、門店數據、地圖規劃', icon: 'ShopOutlined',
  },
  {
    code: 'seller', name: '商家工作台',
  },
  {
    code: 'search', name: '搜索運營系統', nameEn: 'Search Ops',
    description: '搜索詞庫、引導、策略、校驗、報表', icon: 'SearchOutlined',
  },
  {
    code: 'finance', name: '財務系統', nameEn: 'Finance',
    description: '賬戶餘額、批次、明細、對賬、審批中心', icon: 'AccountBookOutlined',
  },
  {
    code: 'ai', name: 'AI 管理系統', nameEn: 'AI Hub',
    description: '模型、配額、授權、MCP、審計、能耗', icon: 'RobotOutlined',
  },
  {
    code: 'hr', name: 'HR 系統', nameEn: 'Human Resources',
    description: '員工、組織、職位、員工動態', icon: 'TeamOutlined',
  },
  {
    code: 'eam', name: '物資管理系統', nameEn: 'EAM',
    description: '資產、耗材、採購、庫存、盤點', icon: 'InboxOutlined',
  },
  {
    code: 'oa', name: 'OA 系統', nameEn: 'OA',
    description: '流程中心、流程事項、審批配置、員工自助', icon: 'SolutionOutlined',
  },
  {
    code: 'iam', name: '權限中心', nameEn: 'IAM',
    description: '角色、功能授權、數據授權、菜單配置', icon: 'SafetyCertificateOutlined',
  },
  {
    code: 'platform', name: '平台配置', nameEn: 'Platform',
    description: '通知、多語言、規則、版本、翻譯工作台', icon: 'SettingOutlined',
  },
  {
    code: 'i18n', name: '翻譯中心',
  },
]

export default function Portal() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setCurrentSystemCode } = useCurrentSystem()

  const [systems, setSystems] = useState<PortalSystem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [hoveredSystem, setHoveredSystem] = useState<string | null>(null)
  /** 未授权系统点击后弹出的申请确认框，记录当前待申请的系统。 */
  const [requestSystem, setRequestSystem] = useState<PortalSystem | null>(null)

  /** 授权结果完全使用后端响应；区分请求失败和成功返回空列表。 */
  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const ctx = await fetchPortalContext()
      setSystems(ctx.systems ?? [])
    } catch {
      setSystems([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const unauthorizedSystems = useMemo(() => {
    const authorizedCodes = new Set(systems.map((system) => system.code))
    return PORTAL_SYSTEM_CATALOG.filter((system) => !authorizedCodes.has(system.code))
  }, [systems])

  const handleEnter = (sys: PortalSystem) => {
    if (loading || loadError) return
    if (!systems.some((system) => system.code === sys.code)) {
      // 未授权系统不直接进入，弹窗告知用户需先申请权限
      setRequestSystem(sys)
      return
    }
    // 系统首页不依赖首个菜单；菜单权限仍由首页和侧边栏读取服务端导航。
    setCurrentSystemCode(sys.code)
    navigate('/')
  }

  /** 确认申请：进入 OA 流程中心发起权限申请（申请表单流程后续接入）。 */
  const handleConfirmRequest = () => {
    setRequestSystem(null)
    navigate('/process-center')
  }

  const renderSystemPanel = (group: readonly PortalSystem[], hasAccess: boolean) => {
    if (loading) {
      return <div className="portal-loading"><Spin size="large" /></div>
    }
    if (loadError) {
      return (
        <div className="portal-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('portal.loadError')}>
            <Button type="primary" onClick={() => void load()}>{t('portal.retry')}</Button>
          </Empty>
        </div>
      )
    }

    const kw = keyword.trim().toLowerCase()
    const filtered = group.map((system) => {
      const translationKey = getPortalSystemKey(system.code, system.name) ?? system.code
      return {
        ...system,
        artworkName: system.name,
        name: t(`portal.systems.${translationKey}.name`, { defaultValue: system.name }),
        description: t(`portal.systems.${translationKey}.description`, { defaultValue: system.description ?? '' }),
      }
    }).filter((system) =>
      `${system.name} ${system.description} ${system.code}`.toLowerCase().includes(kw),
    )
    if (filtered.length === 0) {
      return (
        <div className="portal-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={kw
              ? t('portal.noMatch', '未匹配到系統')
              : hasAccess
                ? t('portal.noSystem', '暫未分配系統權限，請聯繫管理員')
                : t('portal.noUnauthorized')}
          >
            {hasAccess && group.length === 0 && (
              <Button type="primary" onClick={() => navigate('/')}>
                {t('portal.backToWorkbench', '返回個人工作台')}
              </Button>
            )}
          </Empty>
        </div>
      )
    }

    return (
      <div className="portal-grid">
        {filtered.map((sys) => (
          <div
            key={sys.code}
            className="portal-card-shell"
            onPointerEnter={(event) => { if (event.pointerType !== 'touch') setHoveredSystem(sys.code) }}
            onPointerLeave={() => setHoveredSystem(current => current === sys.code ? null : current)}
            onPointerCancel={() => setHoveredSystem(current => current === sys.code ? null : current)}
          >
            <button
              type="button"
              className={`portal-card${hasAccess ? '' : ' is-locked'}`}
              data-system={sys.code}
              title={!hasAccess ? t('portal.requestAccess') : undefined}
              onClick={() => handleEnter(sys)}
              aria-label={`${sys.name} · ${hasAccess ? t('portal.enter') : t('portal.requestAccess')}`}
            >
              <span className="portal-card-cover">
                <SystemArtwork code={sys.code} name={sys.artworkName} active={hoveredSystem === sys.code} />
                {!hasAccess && <span className="portal-card-lock" aria-hidden="true"><LockOutlined /></span>}
              </span>
              <span className="portal-card-body">
                <span className="portal-card-title">{sys.name}</span>
                {sys.description ? <span className="portal-card-desc">{sys.description}</span> : null}
                {!hasAccess && (
                  <span className="portal-card-locked-prompt">
                    <SafetyCertificateOutlined aria-hidden="true" />
                    <span>{t('portal.requestAccess')}</span>
                  </span>
                )}
              </span>
            </button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="portal-page">
      <div className="portal-header">
        <div className="portal-header-left">
          <h1 className="portal-title">{t('portal.appCenter')}</h1>
          <p className="portal-subtitle">{t('portal.subtitle')}</p>
        </div>
        <div className="portal-search-wrap">
          <Input
            className="portal-search"
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('portal.search', '搜尋系統')}
            aria-label={t('portal.search', '搜尋系統')}
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setHoveredSystem(null) }}
          />
        </div>
      </div>

      <Tabs
        className="portal-tabs"
        defaultActiveKey="authorized"
        onChange={() => setHoveredSystem(null)}
        items={[
          {
            key: 'authorized',
            label: (
              <span className="portal-tab-label">
                <AppstoreOutlined aria-hidden="true" />
                <span>{t('portal.authorized')}</span>
                {!loading && !loadError && <span className="portal-tab-count">{systems.length}</span>}
              </span>
            ),
            children: renderSystemPanel(systems, true),
          },
          {
            key: 'unauthorized',
            label: (
              <span className="portal-tab-label">
                <LockOutlined aria-hidden="true" />
                <span>{t('portal.unauthorized')}</span>
                {!loading && !loadError && <span className="portal-tab-count">{unauthorizedSystems.length}</span>}
              </span>
            ),
            children: renderSystemPanel(unauthorizedSystems, false),
          },
        ]}
      />
      <p className="portal-access-note">
        <SafetyCertificateOutlined aria-hidden="true" />
        <span>{t('portal.accessNote')}</span>
      </p>

      {/* 未授权系统点击后的申请引导弹窗：关闭或进入权限申请流程二选一 */}
      <Modal
        open={!!requestSystem}
        centered
        onCancel={() => setRequestSystem(null)}
        footer={
          <div className="portal-request-footer">
            <Button onClick={() => setRequestSystem(null)}>{t('common.cancel')}</Button>
            <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={handleConfirmRequest}>
              {t('portal.requestApplyBtn')}
            </Button>
          </div>
        }
      >
        <div className="portal-request-body">
          <span className="portal-request-icon"><LockOutlined /></span>
          <div className="portal-request-text">
            <h3 className="portal-request-title">{t('portal.requestTitle')}</h3>
            <p className="portal-request-desc">
              {t('portal.requestDesc', { system: requestSystem?.name ?? '' })}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
