import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Switch, InputNumber, Select, Input, Tag, Button, message } from 'antd'
import {
  SaveOutlined,
  UndoOutlined,
  SettingOutlined,
  DownOutlined,
  UpOutlined,
  EditOutlined,
  CloseOutlined,
  LockOutlined,
} from '@ant-design/icons'
import { useSystemRules } from '../../hooks/useSystemRules'
import type { RuleItem, RuleGroup } from '../../constants/ruleConfig'

/** 廣告類型子分組顯示名稱與配色 */
const SUB_GROUP_META: Record<string, { label: string; color: string }> = {
  new_store: { label: '新店廣告', color: '#52C41A' },
  revival: { label: '盤活復蘇', color: '#E8720C' },
  popular_merchant: { label: '人氣商家', color: '#722ED1' },
}

export default function RuleConfig() {
  const { t } = useTranslation()
  const { groups, updateRule, saveAll, resetAll } = useSystemRules()

  /* 每個分組獨立折疊 + 髢標記（全部默認折疊） */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map(g => [g.key, true]))
  )
  const [dirty, setDirty] = useState<Record<string, boolean>>({})

  /* 編輯模式：每個分組獨立控制，默認全部只讀 */
  const [editing, setEditing] = useState<Record<string, boolean>>({})
  /* 進入編輯模式前的快照，用於取消時恢復 */
  const [snapshot, setSnapshot] = useState<Record<string, Record<string, unknown>>>({})

  const toggleCollapse = (key: string) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  const markDirty = (groupKey: string) =>
    setDirty(prev => ({ ...prev, [groupKey]: true }))

  /** 進入編輯模式：快照當前值 */
  const handleEnterEdit = (group: RuleGroup) => {
    const snap: Record<string, unknown> = {}
    group.rules.forEach(r => { snap[r.key] = r.value })
    setSnapshot(prev => ({ ...prev, [group.key]: snap }))
    setEditing(prev => ({ ...prev, [group.key]: true }))
  }

  /** 取消編輯：恢復快照值 */
  const handleCancelEdit = (group: RuleGroup) => {
    const snap = snapshot[group.key]
    if (snap) {
      group.rules.forEach(r => {
        if (r.key in snap) updateRule(r.key, snap[r.key])
      })
    }
    setEditing(prev => ({ ...prev, [group.key]: false }))
  }

  const handleUpdate = useCallback((groupKey: string, ruleKey: string, value: unknown) => {
    updateRule(ruleKey, value)
    markDirty(groupKey)
  }, [updateRule])

  /* 分組級保存 */
  const handleSaveGroup = (group: RuleGroup) => {
    saveAll()
    setDirty(prev => ({ ...prev, [group.key]: false }))
    setEditing(prev => ({ ...prev, [group.key]: false }))
    message.success(`${group.title} 已保存`)
  }

  /* 分組級恢復默認 */
  const handleResetGroup = (group: RuleGroup) => {
    group.rules.forEach(r => updateRule(r.key, r.defaultValue))
    setDirty(prev => ({ ...prev, [group.key]: false }))
    message.info(`${group.title} 已恢復默認`)
  }

  /* 控件渲染 */
  const renderControl = (rule: RuleItem, groupKey: string, disabled: boolean) => {
    switch (rule.type) {
      case 'switch':
        return (
          <Switch
            checked={rule.value as boolean}
            onChange={v => handleUpdate(groupKey, rule.key, v)}
            checkedChildren="開"
            unCheckedChildren="關"
            disabled={disabled}
          />
        )
      case 'number':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <InputNumber
              value={rule.value as number}
              onChange={v => handleUpdate(groupKey, rule.key, v ?? rule.defaultValue)}
              min={rule.min}
              max={rule.max}
              style={{ width: 120 }}
              disabled={disabled}
            />
            {rule.unit && <span style={{ fontSize: 12, color: '#8C8C8C' }}>{rule.unit}</span>}
          </div>
        )
      case 'select':
        return (
          <Select
            value={rule.value as string | number}
            onChange={v => handleUpdate(groupKey, rule.key, v)}
            options={rule.options}
            style={{ width: 160 }}
            disabled={disabled}
          />
        )
      case 'text':
        return (
          <Input
            value={rule.value as string}
            onChange={e => handleUpdate(groupKey, rule.key, e.target.value)}
            style={{ width: 200 }}
            disabled={disabled}
          />
        )
      default:
        return null
    }
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
        const isDirty = dirty[group.key] ?? false
        const isEditing = editing[group.key] ?? false

        return (
          <div key={group.key} style={{
            border: `1px solid ${isEditing ? '#E8720C' : '#e8eaed'}`,
            borderRadius: 8, background: '#fff',
            marginBottom: 16,
            boxShadow: isEditing
              ? '0 2px 12px rgba(232,114,12,0.12)'
              : '0 2px 8px rgba(0,0,0,0.04)',
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
              {isDirty && (
                <Tag color="warning" style={{ marginLeft: 4, fontSize: 11 }}>未保存</Tag>
              )}
              {isEditing && (
                <Tag color="processing" style={{ marginLeft: 4, fontSize: 11 }}>編輯中</Tag>
              )}
              {!isEditing && !isDirty && (
                <Tag icon={<LockOutlined />} style={{ marginLeft: 4, fontSize: 11, color: '#8C8C8C', borderColor: '#d9d9d9', background: '#FAFAFA' }}>已鎖定</Tag>
              )}
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
                {/* 規則列表（支持 subGroup 子分組） */}
                <div style={{ padding: '8px 24px 0' }}>
                  {(() => {
                    const hasSubGroups = group.rules.some(r => r.subGroup)
                    if (!hasSubGroups) {
                      /* 無子分組：平鋪渲染 */
                      return group.rules.map((rule, idx) => (
                        <div key={rule.key} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '14px 0',
                          borderBottom: idx < group.rules.length - 1 ? '1px solid #f5f5f5' : 'none',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: '#262626', marginBottom: 2 }}>
                              {rule.label}
                            </div>
                            <div style={{ fontSize: 12, color: '#8C8C8C' }}>{rule.description}</div>
                          </div>
                          <div style={{ marginLeft: 16, flexShrink: 0 }}>
                            {renderControl(rule, group.key, !isEditing)}
                          </div>
                        </div>
                      ))
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
                        {noSubRules.map(rule => (
                          <div key={rule.key} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '14px 0', borderBottom: '1px solid #f5f5f5',
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, color: '#262626', marginBottom: 2 }}>
                                {rule.label}
                              </div>
                              <div style={{ fontSize: 12, color: '#8C8C8C' }}>{rule.description}</div>
                            </div>
                            <div style={{ marginLeft: 16, flexShrink: 0 }}>
                              {renderControl(rule, group.key, !isEditing)}
                            </div>
                          </div>
                        ))}
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
                              {/* 子分組規則 */}
                              {sgRules.map((rule, idx) => (
                                <div key={rule.key} style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '12px 0 12px 14px',
                                  borderBottom: idx < sgRules.length - 1 ? '1px solid #f5f5f5' : 'none',
                                }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: '#262626', marginBottom: 2 }}>
                                      {rule.label}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#8C8C8C' }}>{rule.description}</div>
                                  </div>
                                  <div style={{ marginLeft: 16, flexShrink: 0 }}>
                                    {renderControl(rule, group.key, !isEditing)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        })}
                      </>
                    )
                  })()}
                </div>

                {/* 分組底部操作欄 */}
                <div style={{
                  padding: '12px 24px', display: 'flex', justifyContent: 'flex-end', gap: 8,
                  borderTop: '1px solid #f0f0f0',
                  background: isEditing ? '#FFF7E6' : '#FAFAFA',
                  transition: 'background 0.25s',
                }}>
                  {isEditing ? (
                    <>
                      <Button
                        size="small"
                        icon={<UndoOutlined />}
                        onClick={() => handleResetGroup(group)}
                        style={{ borderRadius: 6 }}
                      >
                        恢復默認
                      </Button>
                      <Button
                        size="small"
                        icon={<CloseOutlined />}
                        onClick={() => handleCancelEdit(group)}
                        style={{ borderRadius: 6 }}
                      >
                        取消
                      </Button>
                      <Button
                        type="primary"
                        size="small"
                        icon={<SaveOutlined />}
                        onClick={() => handleSaveGroup(group)}
                        style={{
                          borderRadius: 6,
                          background: '#E8720C',
                          borderColor: '#E8720C',
                        }}
                      >
                        保存
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleEnterEdit(group)}
                      style={{
                        borderRadius: 6,
                        color: '#E8720C',
                        borderColor: '#E8720C',
                      }}
                    >
                      編輯
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
