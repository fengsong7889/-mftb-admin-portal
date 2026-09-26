/**
 * 权限中心 · 统一授权中心（权限中心重构）。
 *
 * 合并旧「功能授權」（全量覆盖写，Modal 弹窗）与「系統授權」（按系统原子写）两个冗余入口，
 * 并补齐工业界标准能力，单页三 Tab：
 *  1. 授权配置 —— 目标(角色/部门) × 系统 × 菜单动作 的原子授权工作台；
 *  2. 员工权限透视 —— 任选员工查看最终权限并集及来源（角色 ∪ 部门）；
 *  3. 变更审计 —— 全部授权变更的落库审计（目标/系统/类型/操作人/前后快照 diff）。
 *
 * 数据授权（商家集团范围）仍为独立菜单，不在本页范围内。
 */
import { Suspense, lazy, useState } from 'react'
import { Button, Spin, Tabs } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import './index.css'

const PermissionWorkbench = lazy(() => import('./PermissionWorkbench'))
const EmployeePermTrace = lazy(() => import('./EmployeePermTrace'))
const ChangeAuditLog = lazy(() => import('./ChangeAuditLog'))

/** Tab 标识（同时用于懒加载登记） */
const TAB_KEY = {
  WORKBENCH: 'workbench',
  TRACE: 'trace',
  AUDIT: 'audit',
} as const

type TabKey = typeof TAB_KEY[keyof typeof TAB_KEY]

const TAB_LABEL_KEYS: Record<TabKey, [string, string]> = {
  [TAB_KEY.WORKBENCH]: ['authorizationCenter.tabWorkbench', '授權配置'],
  [TAB_KEY.TRACE]: ['authorizationCenter.tabTrace', '員工權限透視'],
  [TAB_KEY.AUDIT]: ['authorizationCenter.tabAudit', '變更審計'],
}

/** Tab 内容懒渲染：只渲染访问过的 Tab，避免进页即并发拉取三份数据 */
function useLazyTabs() {
  const [visited, setVisited] = useState<Set<TabKey>>(new Set([TAB_KEY.WORKBENCH]))
  const markVisited = (key: string) => {
    setVisited((prev) => (prev.has(key as TabKey) ? prev : new Set(prev).add(key as TabKey)))
  }
  return { visited, markVisited }
}

export default function AuthorizationCenter() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabKey>(TAB_KEY.WORKBENCH)
  const { visited, markVisited } = useLazyTabs()

  const renderTabContent = (key: TabKey) => {
    if (!visited.has(key)) return null
    const fallback = (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
        <Spin size="large" />
      </div>
    )
    switch (key) {
      case TAB_KEY.WORKBENCH:
        return <Suspense fallback={fallback}><PermissionWorkbench /></Suspense>
      case TAB_KEY.TRACE:
        return <Suspense fallback={fallback}><EmployeePermTrace /></Suspense>
      case TAB_KEY.AUDIT:
        return <Suspense fallback={fallback}><ChangeAuditLog /></Suspense>
      default:
        return null
    }
  }

  return (
    <div className="authz-center-page">
      {/* 页面头部：全局统一风格（橙色顶条 + 返回按钮 + 标题） */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(-1)}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {t('common.back', '返回')}
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#262626' }}>
              {t('authorizationCenter.title', '授權中心')}
            </h2>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>
              {t('authorizationCenter.subtitle', '以角色/部門 × 系統為單位維護准入與菜單動作，支持權限透視與變更審計')}
            </span>
          </div>
        </div>
      </div>

      {/* 页面主体：按全局规范用 .content-area 白底卡片承载 Tabs，避免 Tab 栏与查询区落在灰底上 */}
      <div className="content-area">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => { setActiveTab(key as TabKey); markVisited(key) }}
          items={[
            { key: TAB_KEY.WORKBENCH, label: t(...TAB_LABEL_KEYS[TAB_KEY.WORKBENCH]), children: renderTabContent(TAB_KEY.WORKBENCH) },
            { key: TAB_KEY.TRACE, label: t(...TAB_LABEL_KEYS[TAB_KEY.TRACE]), children: renderTabContent(TAB_KEY.TRACE) },
            { key: TAB_KEY.AUDIT, label: t(...TAB_LABEL_KEYS[TAB_KEY.AUDIT]), children: renderTabContent(TAB_KEY.AUDIT) },
          ]}
        />
      </div>
    </div>
  )
}
