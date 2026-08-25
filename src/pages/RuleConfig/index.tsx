import { useState, useRef, useCallback } from 'react'
import { Switch, InputNumber, Select, Input, Tag, Button, message, Modal, Radio } from 'antd'
import {
  SettingOutlined,
  DownOutlined,
  UpOutlined,
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useSystemRules, syncIdleTimeoutToBackend } from '../../hooks/useSystemRules'
import { PAYMENT_AD_TYPES, derivePaymentMode, syncPaymentModeToBackend } from '../../hooks/usePaymentRule'
import type { RuleItem, RuleGroup } from '../../constants/ruleConfig'

/** 廣告類型子分組顯示名稱與配色 */
const SUB_GROUP_META: Record<string, { label: string; color: string }> = {
  new_store: { label: '新店廣告', color: '#52C41A' },
  revival: { label: '盤活復蘇', color: '#E8720C' },
  popular_merchant: { label: '人氣商家', color: '#722ED1' },
  golden_signboard: { label: '金字招牌', color: '#FA8C16' },
}

export default function RuleConfig() {
  const { groups, updateRule, refresh, saveAll } = useSystemRules()

  /* 每个分組獨立编辑模式 */
  const [editingGroups, setEditingGroups] = useState<Record<string, boolean>>({})
  const snapshotRef = useRef<Record<string, string>>({})

  const isEditing = (key: string) => !!editingGroups[key]

  const handleEdit = useCallback((groupKey: string) => {
    snapshotRef.current[groupKey] = JSON.stringify(groups)
    setEditingGroups(prev => ({ ...prev, [groupKey]: true }))
  }, [groups])

  const handleSave = useCallback((groupKey: string) => {
    saveAll()
    setEditingGroups(prev => ({ ...prev, [groupKey]: false }))
    delete snapshotRef.current[groupKey]
    message.success('規則配置已保存')

    // 系統安全規則保存時，同步空閒超時到後端 DB
    if (groupKey === 'system_security') {
      const group = groups.find(g => g.key === 'system_security')
      const timeoutRule = group?.rules.find(r => r.key === 'session_idle_timeout_minutes')
      if (timeoutRule && typeof timeoutRule.value === 'number') {
        syncIdleTimeoutToBackend(timeoutRule.value).catch(() => {
          message.warning('本地已保存，但同步後端失敗，請檢查網絡後重試')
        })
      }
    }

    // 廣告銷售規則保存時，同步各廣告類型支付方式到後端 DB
    if (groupKey === 'ad_sales') {
      const group = groups.find(g => g.key === 'ad_sales')
      const getVal = (key: string) => group?.rules.find(r => r.key === key)?.value
      PAYMENT_AD_TYPES.forEach(type => {
        const mode = derivePaymentMode({
          promoOnly: getVal(`payment_${type}_promo_only`),
          giftOnly: getVal(`payment_${type}_gift_only`),
          switchable: getVal(`payment_${type}_switchable`),
        })
        syncPaymentModeToBackend(type, mode).catch(() => {
          message.warning('本地已保存，但同步後端失敗，請檢查網絡後重試')
        })
      })
    }
  }, [saveAll, groups])

  const handleCancel = useCallback((groupKey: string) => {
    try {
      const snap = JSON.parse(snapshotRef.current[groupKey] || '{}') as RuleGroup[]
      const saved: Record<string, unknown> = {}
      snap.forEach(g => g.rules.forEach(r => { saved[r.key] = r.value }))
      localStorage.setItem('system_rule_config', JSON.stringify(saved))
    } catch { /* ignore */ }
    refresh()
    setEditingGroups(prev => ({ ...prev, [groupKey]: false }))
    delete snapshotRef.current[groupKey]
  }, [refresh])

  const handleReset = useCallback((groupKey: string) => {
    const group = groups.find(g => g.key === groupKey)
    Modal.confirm({
      title: '確認重置',
      content: `「${group?.title || groupKey}」的所有規則將恢復為默認值，此操作不可撤銷。`,
      okText: '確認重置',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        // 将该组规则恢复为默认值并保存
        group?.rules.forEach(r => updateRule(r.key, r.defaultValue))
        saveAll()
        message.success(`「${group?.title}」已恢復默認規則`)
      },
    })
  }, [groups, updateRule, saveAll])

  /* 每個分組獨立折疊 + 髢標記（全部默認折疊） */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map(g => [g.key, true]))
  )

  const toggleCollapse = (key: string) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  /* 編號生成表格：按菜單分組展開/收起 */
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({})
  const toggleMenu = (menu: string) =>
    setExpandedMenus(prev => ({ ...prev, [menu]: !prev[menu] }))

  /* 控件渲染（按分组编辑状态控制） */
  const renderControl = (rule: RuleItem, groupEditing: boolean) => {
    switch (rule.type) {
      case 'switch':
        return (
          <Switch
            checked={rule.value as boolean}
            checkedChildren="開"
            unCheckedChildren="關"
            disabled={!groupEditing}
            onChange={(checked) => groupEditing && updateRule(rule.key, checked)}
          />
        )
      case 'number':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <InputNumber
              value={rule.value as number}
              min={rule.min}
              max={rule.max}
              style={{ width: 120 }}
              disabled={!groupEditing}
              onChange={(v) => groupEditing && updateRule(rule.key, v ?? 0)}
            />
            {rule.unit && <span style={{ fontSize: 12, color: '#8C8C8C' }}>{rule.unit}</span>}
          </div>
        )
      case 'select':
        return (
          <Select
            value={rule.value as string | number}
            options={rule.options}
            style={{ width: 160 }}
            disabled={!groupEditing}
            onChange={(v) => groupEditing && updateRule(rule.key, v)}
          />
        )
      case 'text':
        return (
          <Input
            value={rule.value as string}
            style={{ width: 200 }}
            disabled={!groupEditing}
            onChange={(e) => groupEditing && updateRule(rule.key, e.target.value)}
          />
        )
      default:
        return null
    }
  }

  /* 將規則列表拆分為渲染單元：互斥組（同 mutexGroup 合併為一行）+ 單條規則 */
  type RenderUnit = { type: 'single'; rule: RuleItem } | { type: 'mutex'; rules: RuleItem[] }
  const toUnits = (rules: RuleItem[]): RenderUnit[] => {
    const units: RenderUnit[] = []
    const seen = new Set<string>()
    rules.forEach(r => {
      if (r.mutexGroup) {
        if (!seen.has(r.mutexGroup)) {
          seen.add(r.mutexGroup)
          units.push({ type: 'mutex', rules: rules.filter(x => x.mutexGroup === r.mutexGroup) })
        }
      } else {
        units.push({ type: 'single', rule: r })
      }
    })
    return units
  }

  /* 單條規則行 */
  const renderSingleRow = (rule: RuleItem, borderBottom: string, groupEditing: boolean, padLeft = 0) => (
    <div key={rule.key} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `14px 0 14px ${padLeft}px`, borderBottom,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#262626', marginBottom: 2 }}>{rule.label}</div>
        <div style={{ fontSize: 12, color: '#8C8C8C' }}>{rule.description || ''}</div>
      </div>
      <div style={{ marginLeft: 16, flexShrink: 0 }}>{renderControl(rule, groupEditing)}</div>
    </div>
  )

  /* 互斥組行：4 個選項並排（Radio.Group），一行展示 */
  const renderMutexRow = (rules: RuleItem[], borderBottom: string, groupEditing: boolean, padLeft = 0) => {
    const active = rules.find(r => r.value === true) || rules.find(r => r.defaultValue === true) || rules[0]
    return (
      <div key={rules[0].mutexGroup} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `14px 0 14px ${padLeft}px`, borderBottom, gap: 16,
      }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#262626', marginBottom: 2 }}>支付方式</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{active?.description || ''}</div>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Radio.Group
            value={active?.key}
            disabled={!groupEditing}
            onChange={e => updateRule(e.target.value, true)}
            optionType="button"
            buttonStyle="solid"
            size="small"
            options={rules.map(r => ({ label: r.label.replace(/^僅支持|^支持/, ''), value: r.key }))}
          />
        </div>
      </div>
    )
  }

  /* 渲染一組規則（互斥組並排、單條逐行） */
  const renderUnits = (rules: RuleItem[], groupEditing: boolean, padLeft = 0) => {
    const units = toUnits(rules)
    return units.map((u, i) => {
      const border = i < units.length - 1 ? '1px solid #f5f5f5' : 'none'
      return u.type === 'mutex'
        ? renderMutexRow(u.rules, border, groupEditing, padLeft)
        : renderSingleRow(u.rule, border, groupEditing, padLeft)
    })
  }

  return (
    <div className="content-area">
      {/* ── 頂部標題（沿用銷售定價統一規範） ── */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%',
          animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'linear-gradient(135deg, #E8720C, #F59432)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(232,114,12,0.3)',
            }}>
              <SettingOutlined style={{ fontSize: 18, color: '#fff' }} />
            </div>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                規則配置
              </h2>
              <span style={{ fontSize: 14, color: '#595959' }}>管理系統各業務模塊的規則參數</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 分組卡片 ── */}
      {groups.map(group => {
        const isCollapsed = collapsed[group.key] ?? false
        const groupEditing = isEditing(group.key)

        return (
          <div key={group.key} style={{
            border: '1px solid #e8eaed',
            borderRadius: 8, background: '#fff',
            marginBottom: 16,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            overflow: 'hidden',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          }}>
            {/* 分組標題行（可點擊折疊） */}
            <div
              onClick={() => toggleCollapse(group.key)}
              style={{
                padding: '16px 24px', display: 'flex', alignItems: 'center',
                cursor: 'pointer', userSelect: 'none',
                borderBottom: isCollapsed ? 'none' : '1px solid #f0f0f0',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FAFAFA' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: `${group.color}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 14, color: group.color }}>{group.icon}</span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#262626', marginLeft: 8 }}>
                {group.title}
              </span>
              <Tag color={group.color} style={{ marginLeft: 8, fontSize: 11 }}>
                {group.rules.length} 項
              </Tag>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: '#8C8C8C', marginRight: 4 }}>
                {group.description}
              </span>
              {isCollapsed
                ? <DownOutlined style={{ fontSize: 11, color: '#bfbfbf' }} />
                : <UpOutlined style={{ fontSize: 11, color: '#bfbfbf' }} />
              }
            </div>

            {/* 分組內容（折疊時隱藏） */}
            {!isCollapsed && (
              <>
                {/* 分組獨立操作欄（展開後可見） */}
                <div style={{
                  padding: '10px 24px', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', background: groupEditing ? '#FFF7E6' : '#FAFAFA',
                  borderBottom: '1px solid #f0f0f0', transition: 'background 0.2s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag icon={<EditOutlined />} style={{ fontSize: 11, margin: 0, color: groupEditing ? '#E8720C' : '#8C8C8C', borderColor: groupEditing ? '#E8720C40' : '#d9d9d9', background: groupEditing ? '#FFF7E6' : '#fff' }}>
                      {groupEditing ? '可編輯' : '已鎖定'}
                    </Tag>
                    {groupEditing && <span style={{ fontSize: 12, color: '#E8720C' }}>修改後點擊保存生效</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!groupEditing ? (
                      <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(group.key)}
                        style={{ borderRadius: 4, borderColor: '#E8720C', color: '#E8720C', fontSize: 12, height: 26 }}>
                        编辑
                      </Button>
                    ) : (
                      <>
                        <Button size="small" danger icon={<ReloadOutlined />} onClick={() => handleReset(group.key)}
                          style={{ borderRadius: 4, fontSize: 12, height: 26 }}>
                          重置
                        </Button>
                        <Button size="small" icon={<CloseOutlined />} onClick={() => handleCancel(group.key)}
                          style={{ borderRadius: 4, fontSize: 12, height: 26 }}>
                          取消
                        </Button>
                        <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => handleSave(group.key)}
                          style={{ borderRadius: 4, fontSize: 12, height: 26, backgroundColor: '#E8720C', borderColor: '#E8720C' }}>
                          保存
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {/* 規則列表（支持 subGroup 子分組） */}
                <div style={{ padding: '8px 24px 0' }}>
                  {(() => {
                    /* 表格類型：以表格形式展示編號生成規則 */
                    if (group.type === 'table') {
                      const computeExample = (prefix: string, df: string | undefined, sl: number | undefined) => {
                        if (prefix === '-') return ''
                        const seq = sl ? '0'.repeat(sl) : '0000'
                        const datePart = df === 'YYYYMMDD' ? '20260812' : df === 'YYMM' ? '2608' : ''
                        return `${prefix}${datePart}${seq}`
                      }

                      /* 根據 rule key / menu 推導分類標籤 */
                      const getCategoryTag = (key: string, menu?: string): { label: string; color: string } | null => {
                        if (menu === '審批中心') return { label: '流程', color: '#FF4D4F' }
                        if (menu === '明細查詢') return { label: '明細', color: '#13C2C2' }
                        if (menu === '欠款對賬') return { label: '欠款', color: '#EB2F96' }
                        if (menu === '商戶集團管理') return { label: '門店', color: '#FA8C16' }
                        if (menu === '瀑布流配置') return { label: '策略', color: '#2F54EB' }
                        if (menu === '銷售定價') return { label: '定價', color: '#E8720C' }
                        if (menu === '推廣贈送') return { label: '贈送', color: '#F5222D' }
                        if (menu === '員工管理' || menu === '組織管理' || menu === '職位管理') return { label: '人事', color: '#FAAD14' }
                        if (key.startsWith('ad_order_')) return { label: '訂單', color: '#1890FF' }
                        if (key.startsWith('config_pricing_')) return { label: '定價', color: '#E8720C' }
                        if (key.startsWith('algo_')) return { label: '算法', color: '#722ED1' }
                        if (key.startsWith('batch_')) return { label: '批次', color: '#52C41A' }
                        return null
                      }

                      /* 按 menu 字段分組，保持原始順序 */
                      const menuGroupMap = new Map<string, RuleItem[]>()
                      group.rules.forEach(rule => {
                        const menu = rule.menu || '—'
                        if (!menuGroupMap.has(menu)) menuGroupMap.set(menu, [])
                        menuGroupMap.get(menu)!.push(rule)
                      })
                      const menuGroups = Array.from(menuGroupMap.entries())

                      return (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ background: '#FAFAFA' }}>
                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#595959', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>所屬菜單</th>
                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#595959', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>業務類型</th>
                                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#595959', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>前綴</th>
                                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#595959', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>日期格式</th>
                                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#595959', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>自增序號</th>
                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#595959', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>示例</th>
                                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#595959', borderBottom: '1px solid #f0f0f0' }}>備註</th>
                              </tr>
                            </thead>
                            <tbody>
                              {menuGroups.map(([menu, menuRules]) => {
                                const isExpanded = expandedMenus[menu] ?? false
                                return (
                                  <>
                                    {/* 菜單分組行（可點擊展開/收起） */}
                                    <tr
                                      key={`menu-${menu}`}
                                      onClick={() => toggleMenu(menu)}
                                      style={{
                                        background: isExpanded ? '#E6F4FF' : '#FAFAFA',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s',
                                      }}
                                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#F0F5FF' }}
                                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = '#FAFAFA' }}
                                    >
                                      <td colSpan={7} style={{ padding: '10px 12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <span style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            width: 20, height: 20, borderRadius: 4,
                                            background: isExpanded ? '#1890FF' : '#E8E8E8',
                                            transition: 'all 0.2s',
                                          }}>
                                            {isExpanded
                                              ? <UpOutlined style={{ fontSize: 10, color: '#fff' }} />
                                              : <DownOutlined style={{ fontSize: 10, color: '#8C8C8C' }} />
                                            }
                                          </span>
                                          <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{menu}</span>
                                          <Tag color="#1890FF" style={{ fontSize: 11, marginLeft: 4, borderRadius: 10 }}>
                                            {menuRules.length} 項規則
                                          </Tag>
                                        </div>
                                      </td>
                                    </tr>
                                    {/* 展開後顯示該菜單下所有編號規則 */}
                                    {isExpanded && menuRules.map((rule, idx) => {
                                      const prefix = (rule.value as string) || '-'
                                      const isSpecial = prefix === '-'
                                      const dfValue = rule.dateFormat || 'NONE'
                                      const slValue = (rule.min != null && rule.min > 0) ? rule.min : 4
                                      const remark = isSpecial
                                        ? (rule.remark || '')
                                        : (rule.remark?.replace(/\{prefix\}/g, prefix).replace(/\{n\}/g, String(slValue)) || '')
                                      const rowBorder = idx < menuRules.length - 1 ? '1px solid #f0f0f0' : '1px solid #d6e4ff'
                                      return (
                                        <tr key={rule.key} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                                          <td style={{ padding: '8px 12px 8px 44px', borderBottom: rowBorder }}>
                                            <span style={{
                                              display: 'inline-block', width: 4, height: 4,
                                              borderRadius: '50%', background: '#1890FF', marginRight: 8,
                                            }} />
                                          </td>
                                          <td style={{ padding: '8px 12px', fontWeight: 500, color: '#262626', whiteSpace: 'nowrap', borderBottom: rowBorder }}>
                                            {(() => {
                                              const cat = getCategoryTag(rule.key, rule.menu)
                                              return cat ? (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                  <span style={{
                                                    display: 'inline-block', fontSize: 10, lineHeight: '16px',
                                                    padding: '0 4px', borderRadius: 3,
                                                    background: `${cat.color}15`, color: cat.color,
                                                    fontWeight: 600, border: `1px solid ${cat.color}30`,
                                                  }}>{cat.label}</span>
                                                  {rule.label}
                                                </span>
                                              ) : rule.label
                                            })()}
                                          </td>
                                          <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: rowBorder }}>
                                            <span style={{ fontFamily: 'monospace', color: isSpecial ? '#bfbfbf' : '#E8720C', fontWeight: 600 }}>{prefix}</span>
                                          </td>
                                          <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: rowBorder }}>
                                            <span style={{ fontSize: 12, color: '#595959' }}>
                                              {dfValue === 'YYYYMMDD' ? '年月日' : dfValue === 'YYMM' ? '年月' : isSpecial ? '—' : '无'}
                                            </span>
                                          </td>
                                          <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: rowBorder }}>
                                            <span style={{ fontSize: 12, color: '#595959' }}>
                                              {isSpecial ? '—' : `${slValue} 位`}
                                            </span>
                                          </td>
                                          <td style={{ padding: '8px 12px', color: '#E8720C', fontFamily: 'monospace', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', borderBottom: rowBorder }}>
                                            {isSpecial ? rule.unit : computeExample(prefix, rule.dateFormat, slValue)}
                                          </td>
                                          <td style={{ padding: '8px 12px', fontSize: 11, color: '#8C8C8C', maxWidth: 240, borderBottom: rowBorder }}>{remark || ''}</td>
                                        </tr>
                                      )
                                    })}
                                  </>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    }
                    const hasSubGroups = group.rules.some(r => r.subGroup)
                    if (!hasSubGroups) {
                      /* 無子分組：平鋪渲染（互斥組並排） */
                      return renderUnits(group.rules, groupEditing)
                    }
                    /* 有子分組：按 subGroup 歸類並顯示子標題 */
                    const subGroups = new Map<string, RuleItem[]>()
                    const noSubRules: RuleItem[] = []
                    group.rules.forEach(r => {
                      if (r.subGroup) {
                        if (!subGroups.has(r.subGroup)) subGroups.set(r.subGroup, [])
                        subGroups.get(r.subGroup)!.push(r)
                      } else {
                        noSubRules.push(r)
                      }
                    })
                    return (
                      <>
                        {/* 無子分組的規則先渲染 */}
                        {renderUnits(noSubRules, groupEditing)}
                        {/* 按子分組渲染 */}
                        {Array.from(subGroups.entries()).map(([sgKey, sgRules], sgIdx) => {
                          const meta = SUB_GROUP_META[sgKey]
                          const sgLabel = meta?.label ?? sgKey
                          const sgColor = meta?.color ?? group.color
                          return (
                            <div key={sgKey} style={{
                              marginTop: sgIdx > 0 || noSubRules.length > 0 ? 8 : 0,
                              marginBottom: 4,
                            }}>
                              {/* 子分組標題 */}
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 0 4px',
                              }}>
                                <div style={{
                                  width: 6, height: 6, borderRadius: '50%',
                                  background: sgColor,
                                }} />
                                <span style={{ fontSize: 13, fontWeight: 600, color: sgColor }}>
                                  {sgLabel}
                                </span>
                                <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
                              </div>
                              {/* 子分組規則（互斥組並排） */}
                              {renderUnits(sgRules, groupEditing, 14)}
                            </div>
                          )
                        })}
                      </>
                    )
                  })()}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
