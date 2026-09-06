import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Empty, Input, Modal, Segmented, Steps, Switch, Tabs, Tag, message } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchMcpTools, installMcpTool, uninstallMcpTool, type McpTool } from '../../api/mcpService'
import { TOOL_LEVEL_META, type ToolLevel } from '../../api/mock/aiPlatformMock'
import { renderMenuIcon } from '../../components/MenuIcon'

/** 內部分區分類（與後端 category 枚舉一致；notify 僅外部服務使用，內部分區不展示） */
const CATEGORY_KEYS = ['all', 'finance', 'promotion', 'merchant', 'ai'] as const

/** 安裝狀態篩選 */
type InstallFilter = 'all' | 'installed' | 'uninstalled'

/** 一級分區：內部服務（內置工具）/ 外部服務（MCP Server 規劃目錄） */
type SourceTab = 'builtin' | 'external'

export default function McpService() {
  const { t } = useTranslation()

  /* ── 數據 ── */
  const [tools, setTools] = useState<McpTool[]>([])
  const [loading, setLoading] = useState(false)

  const load = () => {
    setLoading(true)
    fetchMcpTools()
      .then(setTools)
      .catch(() => message.error(t('mcpService.loadFailed')))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── 查詢條件 ── */
  const [sourceTab, setSourceTab] = useState<SourceTab>('builtin')
  const [category, setCategory] = useState<(typeof CATEGORY_KEYS)[number]>('all')
  const [installFilter, setInstallFilter] = useState<InstallFilter>('all')
  const [query, setQuery] = useState('')

  /* ── 來源分組：內部服務 = 內置工具，外部服務 = MCP Server 規劃目錄 ── */
  const builtinTools = useMemo(() => tools.filter((tool) => tool.source !== 'external'), [tools])
  const externalTools = useMemo(() => tools.filter((tool) => tool.source === 'external'), [tools])
  const sourceTools = sourceTab === 'builtin' ? builtinTools : externalTools

  const filteredTools = useMemo(() => sourceTools.filter((tool) => {
    if (sourceTab === 'builtin' && category !== 'all' && tool.category !== category) return false
    if (installFilter === 'installed' && tool.installed !== 1) return false
    if (installFilter === 'uninstalled' && tool.installed === 1) return false
    const q = query.trim().toLowerCase()
    if (q && !tool.name.toLowerCase().includes(q) && !tool.toolKey.toLowerCase().includes(q)) return false
    return true
  }), [sourceTools, sourceTab, category, installFilter, query])

  const installedCount = sourceTools.filter((tool) => tool.installed === 1).length

  const countParams = (tool: McpTool): number => {
    try {
      const schema = JSON.parse(tool.paramsJson || '{}') as { properties?: Record<string, unknown> }
      return Object.keys(schema.properties ?? {}).length
    } catch {
      return 0
    }
  }

  const levelMeta = (tool: McpTool) => TOOL_LEVEL_META[(tool.riskLevel as ToolLevel) in TOOL_LEVEL_META ? tool.riskLevel as ToolLevel : 'L1']

  /* ── 安裝 / 卸載（二次確認；外部服務提示執行鏈路未接入） ── */
  const handleToggle = (tool: McpTool, next: boolean) => {
    const isExternal = tool.source === 'external'
    const confirm = next
      ? {
          title: isExternal ? t('mcpService.externalInstallConfirmTitle') : t('mcpService.installConfirmTitle'),
          content: isExternal
            ? t('mcpService.externalInstallConfirmDesc', { name: tool.name })
            : t('mcpService.installConfirmDesc', { name: tool.name }),
          onOk: async () => {
            await installMcpTool(tool.toolKey)
            message.success(t('mcpService.installSuccess'))
            load()
          },
        }
      : {
          title: t('mcpService.uninstallConfirmTitle'),
          content: t('mcpService.uninstallConfirmDesc', { name: tool.name }),
          onOk: async () => {
            await uninstallMcpTool(tool.toolKey)
            message.success(t('mcpService.uninstallSuccess'))
            load()
          },
        }
    Modal.confirm({ ...confirm, okText: t('mcpService.confirm'), cancelText: t('mcpService.cancel') })
  }

  /* ── 工具卡片（內部/外部共用；外部附加接入方式標籤） ── */
  const renderCard = (tool: McpTool) => {
    const meta = levelMeta(tool)
    const paramsCount = countParams(tool)
    return (
      <div
        key={tool.toolKey}
        style={{
          border: '1px solid #F0F0F0', borderRadius: 10, padding: '16px 18px',
          background: '#FFFFFF', transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.08)'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
      >
        {/* 頭部：圖標 + 名稱 + 標籤 + 安裝開關 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: 8, background: `${meta.color}14`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, color: meta.color, flexShrink: 0, overflow: 'hidden',
            }}
          >
            {renderMenuIcon(tool.icon) ?? tool.name.slice(0, 1)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tool.name}</span>
              <Tag color={meta.tagColor} style={{ borderRadius: 4, marginRight: 0 }}>
                {tool.riskLevel} · {meta.name}
              </Tag>
              {tool.source === 'external' && (
                <Tag style={{ borderRadius: 4, marginRight: 0 }}>
                  {t('mcpService.transport_' + (tool.transport === 'local-stdio' ? 'local_stdio' : 'remote_http'))}
                </Tag>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#8C8C8C', fontFamily: 'monospace', marginTop: 2 }}>{tool.toolKey}</div>
          </div>
          <Switch
            checked={tool.installed === 1}
            checkedChildren={t('mcpService.installed')}
            unCheckedChildren={t('mcpService.notInstalled')}
            onChange={(next) => handleToggle(tool, next)}
          />
        </div>

        {/* 描述 */}
        <div style={{ fontSize: 12, color: '#595959', lineHeight: 1.6, minHeight: 38 }}>
          {tool.description}
        </div>

        {/* 元信息 */}
        <div style={{ fontSize: 12, color: '#8C8C8C', display: 'flex', gap: 12, flexWrap: 'wrap', borderTop: '1px dashed #F0F0F0', paddingTop: 10, marginTop: 'auto' }}>
          <span>v{tool.version}</span>
          <span>{t('mcpService.category_' + tool.category)}</span>
          <span>{paramsCount > 0 ? t('mcpService.paramsCount', { count: paramsCount }) : t('mcpService.noParams')}</span>
          {tool.installed === 1 && tool.installedBy && (
            <span style={{ marginLeft: 'auto', color: '#52C41A' }}>
              {t('mcpService.installedBy')}: {tool.installedBy}
            </span>
          )}
        </div>
      </div>
    )
  }

  /* ── 篩選工具列（內部分區含數據域分類；兩分區共用安裝狀態/搜索/刷新/計數） ── */
  const renderToolbar = (withCategory: boolean) => (
    <div className="search-section">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {withCategory && (
          <Segmented
            value={category}
            onChange={(v) => setCategory(v as (typeof CATEGORY_KEYS)[number])}
            options={CATEGORY_KEYS.map((key) => ({ value: key, label: t(`mcpService.category_${key}`) }))}
          />
        )}
        <Segmented
          value={installFilter}
          onChange={(v) => setInstallFilter(v as InstallFilter)}
          options={[
            { value: 'all', label: t('mcpService.installAll') },
            { value: 'installed', label: t('mcpService.installed') },
            { value: 'uninstalled', label: t('mcpService.notInstalled') },
          ]}
        />
        <Input
          value={query}
          placeholder={t('mcpService.searchPlaceholder')}
          allowClear
          prefix={<SearchOutlined style={{ color: '#BFBFBF' }} />}
          style={{ width: 240 }}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>{t('mcpService.refresh')}</Button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8C8C8C' }}>
          {t('mcpService.toolCount', { total: sourceTools.length, installed: installedCount })}
        </span>
      </div>
    </div>
  )

  /* ── 卡片網格 ── */
  const renderGrid = () => {
    if (loading) {
      return <div style={{ padding: 40, textAlign: 'center', color: '#8C8C8C' }}>{t('mcpService.loading')}</div>
    }
    if (filteredTools.length === 0) {
      return <Empty description={t('mcpService.empty')} style={{ padding: 40 }} />
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {filteredTools.map(renderCard)}
      </div>
    )
  }

  return (
    <div className="content-area">
      {/* 頂部說明 */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('mcpService.alertTitle')}
        description={t('mcpService.alertDesc')}
      />

      <Tabs
        activeKey={sourceTab}
        onChange={(k) => setSourceTab(k as SourceTab)}
        items={[
          {
            key: 'builtin',
            label: `${t('mcpService.tab_builtin')}（${builtinTools.length}）`,
            children: (
              <>
                {renderToolbar(true)}
                {renderGrid()}
              </>
            ),
          },
          {
            key: 'external',
            label: `${t('mcpService.tab_external')}（${externalTools.length}）`,
            children: (
              <>
                {/* 接入說明：外部服務執行鏈路（MCP Client）規劃中 */}
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message={t('mcpService.externalAlertTitle')}
                  description={t('mcpService.externalAlertDesc')}
                />
                {/* 場景調用鏈：內部查詢 → 外部工具執行 → 發送前人工確認 */}
                <div className="search-section" style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 12 }}>{t('mcpService.scenarioTitle')}</div>
                  <Steps
                    size="small"
                    current={-1}
                    items={[
                      { title: t('mcpService.scenarioStep1Title'), description: t('mcpService.scenarioStep1Desc') },
                      { title: t('mcpService.scenarioStep2Title'), description: t('mcpService.scenarioStep2Desc') },
                      { title: t('mcpService.scenarioStep3Title'), description: t('mcpService.scenarioStep3Desc') },
                    ]}
                  />
                </div>
                {renderToolbar(false)}
                {renderGrid()}
              </>
            ),
          },
        ]}
      />
    </div>
  )
}
