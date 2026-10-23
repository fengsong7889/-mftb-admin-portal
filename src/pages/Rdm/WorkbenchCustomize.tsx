/**
 * 產研交付个人工作台 —— 个性化配置面板
 *
 * 为什么不照抄云效的「完全自定义」：那种做法首次进入是一张空白板，业务方和中层
 * 根本不知道该拖什么进来，反而比平铺更差。这里是「系统按身份推荐 + 个人有限调整」：
 * 只允许显隐与排序，且候选集就是当前有菜单权限的区块 —— 用户点不出自己进不去的页面。
 *
 * 为什么不用 useColumnConfig：那个 hook 与 Table 列绑定（localStorage 键 table-config-*、
 * 依赖 columnMeta 的显隐/锁定语义），本面板管理的是页面区块顺序，不是表格列。
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Popover, Space, Tag } from 'antd'
import { ArrowDownOutlined, ArrowUpOutlined, SettingOutlined } from '@ant-design/icons'
import type { HelpSection } from '../../components/HelpPopover'
import HelpPopover from '../../components/HelpPopover'
import { RDM_IDENTITY_LABEL, type WorkbenchLayout } from './workbenchLayout'
import { DEFAULT_SECTION_ICON, RDM_SECTION_ICON } from './workbenchSectionIcons'

/** 面板底部的说明：把「谁决定区块」讲清楚，避免用户以为是自己权限不够 */
const LAYOUT_HELP = (t: (key: string) => string): HelpSection[] => [
  { tone: 'info', label: t('rdm.workbenchCustomize.helpFromLabel'), body: t('rdm.workbenchCustomize.helpFromBody') },
  { tone: 'neutral', label: t('rdm.workbenchCustomize.helpCandidatesLabel'), body: t('rdm.workbenchCustomize.helpCandidatesBody') },
  { tone: 'success', label: t('rdm.workbenchCustomize.helpScopeLabel'), body: t('rdm.workbenchCustomize.helpScopeBody') },
  { tone: 'success', label: t('rdm.workbenchCustomize.helpPermLabel'), body: t('rdm.workbenchCustomize.helpPermBody') },
]

export default function WorkbenchCustomize({ layout }: { layout: WorkbenchLayout }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { visibleKeys, candidates, toggle, move, reset, customized, identities } = layout

  /**
   * 面板顺序固定按候选注册表渲染，只切换显隐。
   * <p>历史实现把隐藏项沉到末尾：用户取消勾选后，该项立刻跳到列表最下方，
   * 上移/下移按钮的位置也跟着变，连续操作很容易误关其它区块。
   * 排序仍只作用于 visibleKeys（上移/下移按钮），不改动面板本身的阅读顺序。
   */
  const rows = useMemo(() => candidates, [candidates])

  const content = (
    <div style={{ width: 380 }}>
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#8C8C8C', marginRight: 6 }}>識別到的工作身份</span>
        {identities.map(identity => (
          <Tag key={identity} color="orange" style={{ margin: '0 4px 4px 0' }}>
            {RDM_IDENTITY_LABEL[identity]}
          </Tag>
        ))}
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {rows.map((meta, index) => {
          const checked = visibleKeys.includes(meta.key)
          const visibleIndex = visibleKeys.indexOf(meta.key)
          return (
            <div
              key={meta.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
                borderBottom: index < rows.length - 1 ? '1px dashed #f0f0f0' : 'none',
              }}
            >
              <Checkbox
                checked={checked}
                onChange={e => toggle(meta.key, e.target.checked)}
                aria-label={`${meta.label}顯示開關`}
              />
              <span style={{ color: checked ? '#E8720C' : '#BFBFBF', fontSize: 14 }}>
                {RDM_SECTION_ICON[meta.key] ?? DEFAULT_SECTION_ICON}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#262626' }}>{meta.label}</div>
                <div style={{ fontSize: 12, color: '#8C8C8C' }}>{meta.hint}</div>
              </div>
              <Space size={2}>
                <Button
                  type="text"
                  size="small"
                  icon={<ArrowUpOutlined />}
                  disabled={!checked || visibleIndex <= 0}
                  onClick={() => move(meta.key, -1)}
                  aria-label={`上移${meta.label}`}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<ArrowDownOutlined />}
                  disabled={!checked || visibleIndex < 0 || visibleIndex >= visibleKeys.length - 1}
                  onClick={() => move(meta.key, 1)}
                  aria-label={`下移${meta.label}`}
                />
              </Space>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <HelpPopover
          title="工作台佈局說明"
          ariaLabel="工作台佈局說明"
          placement="topLeft"
          width={360}
          content={LAYOUT_HELP(t)}
        />
        <Button size="small" disabled={!customized} onClick={reset} style={{ marginLeft: 'auto' }}>
          恢復推薦佈局
        </Button>
      </div>
    </div>
  )

  return (
    <Popover
      content={content}
      title="個性化配置工作台"
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
    >
      <Button icon={<SettingOutlined />}>
        個性化配置
        {customized && <Tag color="orange" style={{ margin: '0 0 0 6px' }}>已自定義</Tag>}
      </Button>
    </Popover>
  )
}
