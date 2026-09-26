/**
 * 規則中心 · 單版塊編輯頁
 *
 * 承載「規則中心」某个子菜单对应的规则版块：顶部标题卡片 + 版块卡片（编辑/保存/取消/重置）。
 * 规则值以后端 sys_config 为真值（后端优先加载、批量落库），localStorage 作同步缓存。
 * id_generation（编号生成规则）以表格形式展示，前缀/日期/序号可编辑并存本地（其真值由后端编号表管理）。
 */
import { useState, useEffect, useCallback } from 'react'
import { Switch, InputNumber, Select, Input, Tag, Button, message, Modal, Radio, Spin, Form } from 'antd'
import {
  SettingOutlined, EditOutlined, SaveOutlined, CloseOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons'
import { useRuleGroup } from '../../hooks/useSystemRules'
import { useAuth } from '../../contexts/AuthContext'
import type { RuleItem } from '../../constants/ruleConfig'

/** 廣告類型子分組顯示名稱與配色 */
const SUB_GROUP_META: Record<string, { label: string; color: string }> = {
  new_store: { label: '新店廣告', color: '#52C41A' },
  revival: { label: '盤活復蘇', color: '#E8720C' },
  popular_merchant: { label: '人氣商家', color: '#722ED1' },
  golden_signboard: { label: '金字招牌', color: '#FA8C16' },
  traffic_ad: { label: '投流廣告', color: '#13C2C2' },
}

interface Props {
  /** 规则中心子菜单 menuKey（rule-ad-sales / rule-gift / rule-security / rule-algorithm / rule-seq） */
  menuKey: string
}

export default function RuleGroupPage({ menuKey }: Props) {
  const { group, loading, reload, updateRule, save, resetDefaults } = useRuleGroup(menuKey)
  const { hasPermission } = useAuth()
  const canEdit = hasPermission(`${menuKey}:edit`)

  const [editing, setEditing] = useState(false)

  /* 編號生成規則搜索條件（所屬菜單 / 業務類型 / 前綴）：表单草稿 + 已应用筛选 */
  const [seqForm] = Form.useForm()
  const [seqFilters, setSeqFilters] = useState({ menu: '', type: '', prefix: '' })

  useEffect(() => {
    reload()
  }, [reload])

  const handleEdit = useCallback(() => {
    setEditing(true)
  }, [])

  const handleCancel = useCallback(() => {
    setEditing(false)
    reload()
  }, [reload])

  const handleSave = useCallback(async () => {
    try {
      await save()
      message.success('規則配置已保存')
      setEditing(false)
    } catch {
      message.error('保存失敗，請檢查網絡或權限後重試')
    }
  }, [save])

  const handleReset = useCallback(() => {
    Modal.confirm({
      title: '確認重置',
      className: 'custom-confirm-modal',
      content: `「${group?.title ?? ''}」的所有規則將恢復為默認值並保存，此操作不可撤銷。`,
      okText: '確認重置',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        resetDefaults()
        try {
          await save()
          message.success(`「${group?.title}」已恢復默認規則`)
        } catch {
          message.error('保存失敗，請檢查網絡或權限後重試')
        }
      },
    })
  }, [group, resetDefaults, save])

  /* 編號生成規則：點擊查詢將草稿條件應用到過濾；重置清空表單與條件 */
  const handleSeqSearch = useCallback(() => {
    const v = seqForm.getFieldsValue() as { menu?: string; type?: string; prefix?: string }
    setSeqFilters({ menu: v.menu ?? '', type: v.type ?? '', prefix: v.prefix ?? '' })
  }, [seqForm])

  const handleSeqReset = useCallback(() => {
    seqForm.resetFields()
    setSeqFilters({ menu: '', type: '', prefix: '' })
  }, [seqForm])

  if (!group) {
    return (
      <div className="content-area">
        <Spin style={{ display: 'block', margin: '80px auto' }} />
      </div>
    )
  }

  const groupEditing = editing && canEdit

  /* 控件渲染（按编辑状态控制） */
  const renderControl = (rule: RuleItem) => {
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

  /* 将规则列表拆分为渲染单元：互斥组（同 mutexGroup 合并为一行）+ 单条规则 */
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

  const renderSingleRow = (rule: RuleItem, borderBottom: string, padLeft = 0) => (
    <div key={rule.key} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `14px 0 14px ${padLeft}px`, borderBottom,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#262626', marginBottom: 2 }}>{rule.label}</div>
        <div style={{ fontSize: 12, color: '#8C8C8C' }}>{rule.description || ''}</div>
      </div>
      <div style={{ marginLeft: 16, flexShrink: 0 }}>{renderControl(rule)}</div>
    </div>
  )

  const renderMutexRow = (rules: RuleItem[], borderBottom: string, padLeft = 0) => {
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

  const renderUnits = (rules: RuleItem[], padLeft = 0) => {
    const units = toUnits(rules)
    return units.map((u, i) => {
      const border = i < units.length - 1 ? '1px solid #f5f5f5' : 'none'
      return u.type === 'mutex'
        ? renderMutexRow(u.rules, border, padLeft)
        : renderSingleRow(u.rule, border, padLeft)
    })
  }

  /* 编号生成规则表格（只读展示，示例由前缀/日期/序号推导） */
  const renderTable = () => {
    const computeExample = (prefix: string, df: string | undefined, sl: number | undefined) => {
      if (prefix === '-') return ''
      const seq = sl ? '0'.repeat(sl) : '0000'
      const datePart = df === 'YYYYMMDD' ? '20260812' : df === 'YYYYMM' ? '202608' : df === 'YYMM' ? '2608' : ''
      return `${prefix}${datePart}${seq}`
    }
    const menuDisplayOf = (menu: string) => {
      const idx = menu.indexOf('-')
      return idx !== -1 ? menu.substring(idx + 1) : (menu === '—' ? '—' : menu)
    }
    const kwMenu = seqFilters.menu.trim().toLowerCase()
    const kwType = seqFilters.type.trim().toLowerCase()
    const kwPrefix = seqFilters.prefix.trim().toLowerCase()
    const filtered = group.rules.filter(rule => {
      const prefix = ((rule.value as string) || '-').toLowerCase()
      const menu = rule.menu || '—'
      if (kwMenu && !(menu.toLowerCase().includes(kwMenu) || menuDisplayOf(menu).toLowerCase().includes(kwMenu))) return false
      if (kwType && !rule.label.toLowerCase().includes(kwType)) return false
      if (kwPrefix && !prefix.includes(kwPrefix)) return false
      return true
    })
    const hasFilter = !!(kwMenu || kwType || kwPrefix)
    return (
      <div>
        {/* 搜索區（全局 .search-section 規範：4 列 inline Form + 查詢/重置） */}
        <div className="search-section" style={{ padding: '16px 24px 0' }}>
          <Form layout="inline" form={seqForm} onFinish={handleSeqSearch}>
            <Form.Item label="所屬菜單" name="menu">
              <Input allowClear placeholder="請輸入所屬菜單" />
            </Form.Item>
            <Form.Item label="業務類型" name="type">
              <Input allowClear placeholder="請輸入業務類型" />
            </Form.Item>
            <Form.Item label="前綴" name="prefix">
              <Input allowClear placeholder="請輸入編號前綴" />
            </Form.Item>
            <Form.Item>
              <div className="search-actions">
                <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查詢</Button>
                <Button icon={<ReloadOutlined />} onClick={handleSeqReset}>重置</Button>
              </div>
            </Form.Item>
          </Form>
          {hasFilter && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#8C8C8C' }}>
              共 {filtered.length} / {group.rules.length} 條（已篩選）
            </div>
          )}
        </div>
        <div style={{ padding: '8px 24px 16px', overflowX: 'auto' }}>
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
            {filtered.map((rule, rIdx) => {
              const prefix = (rule.value as string) || '-'
              const isSpecial = prefix === '-'
              const dfValue = rule.dateFormat || 'NONE'
              const slValue = (rule.min != null && rule.min > 0) ? rule.min : 4
              const remark = isSpecial
                ? (rule.remark || '')
                : (rule.remark?.replace(/\{prefix\}/g, prefix).replace(/\{n\}/g, String(slValue)) || '')
              const menu = rule.menu || '—'
              const dashIdx = menu.indexOf('-')
              const menuDisplay = dashIdx !== -1 ? menu.substring(dashIdx + 1) : (menu === '—' ? '—' : menu)
              const rowBorder = '1px solid #f0f0f0'
              return (
                <tr key={rule.key} style={{ background: rIdx % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                  <td style={{ padding: '8px 12px', fontSize: 12, color: '#595959', borderBottom: rowBorder, whiteSpace: 'nowrap' }}>{menuDisplay}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 500, color: '#262626', whiteSpace: 'nowrap', borderBottom: rowBorder }}>{rule.label}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: rowBorder }}>
                    <span style={{ fontFamily: 'monospace', color: isSpecial ? '#bfbfbf' : '#E8720C', fontWeight: 600 }}>{prefix}</span>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: rowBorder }}>
                    <span style={{ fontSize: 12, color: '#595959' }}>
                      {dfValue === 'YYYYMMDD' ? '年月日' : dfValue === 'YYYYMM' || dfValue === 'YYMM' ? '年月' : isSpecial ? '—' : '无'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: rowBorder }}>
                    <span style={{ fontSize: 12, color: '#595959' }}>{isSpecial ? '—' : `${slValue} 位`}</span>
                  </td>
                  <td style={{ padding: '8px 12px', color: '#E8720C', fontFamily: 'monospace', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', borderBottom: rowBorder }}>
                    {isSpecial ? rule.unit : computeExample(prefix, rule.dateFormat, slValue)}
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 11, color: '#8C8C8C', maxWidth: 240, borderBottom: rowBorder }}>{remark || ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
    )
  }

  /* 常规版块规则列表（支持 subGroup 子分组） */
  const renderRuleList = () => {
    const hasSubGroups = group.rules.some(r => r.subGroup)
    if (!hasSubGroups) {
      return renderUnits(group.rules)
    }
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
        {renderUnits(noSubRules)}
        {Array.from(subGroups.entries()).map(([sgKey, sgRules], sgIdx) => {
          const meta = SUB_GROUP_META[sgKey]
          const sgLabel = meta?.label ?? sgKey
          const sgColor = meta?.color ?? group.color
          return (
            <div key={sgKey} style={{ marginTop: sgIdx > 0 || noSubRules.length > 0 ? 8 : 0, marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 4px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: sgColor }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: sgColor }}>{sgLabel}</span>
                <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
              </div>
              {renderUnits(sgRules, 14)}
            </div>
          )
        })}
      </>
    )
  }

  return (
    <div className="content-area">
      {/* ── 頂部標題（沿用銷售定價統一規範） ── */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
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
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: group.color }}>{group.title}</h2>
              <span style={{ fontSize: 14, color: '#595959' }}>{group.description}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 版塊卡片 ── */}
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
      }}>
        {/* 操作栏 */}
        <div style={{
          padding: '12px 24px', display: 'flex', alignItems: 'center',
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
              canEdit && (
                <Button size="small" icon={<EditOutlined />} onClick={handleEdit}
                  style={{ borderRadius: 4, borderColor: '#E8720C', color: '#E8720C', fontSize: 12, height: 28 }}>
                  編輯
                </Button>
              )
            ) : (
              <>
                <Button size="small" danger icon={<ReloadOutlined />} onClick={handleReset}
                  style={{ borderRadius: 4, fontSize: 12, height: 28 }}>重置</Button>
                <Button size="small" icon={<CloseOutlined />} onClick={handleCancel}
                  style={{ borderRadius: 4, fontSize: 12, height: 28 }}>取消</Button>
                <Button size="small" type="primary" icon={<SaveOutlined />} loading={loading} onClick={handleSave}
                  style={{ borderRadius: 4, fontSize: 12, height: 28, backgroundColor: '#E8720C', borderColor: '#E8720C' }}>
                  保存
                </Button>
              </>
            )}
          </div>
        </div>

        {/* 内容区 */}
        <div style={{ padding: group.type === 'table' ? '0' : '8px 24px 16px' }}>
          {group.type === 'table' ? renderTable() : renderRuleList()}
        </div>
      </div>
    </div>
  )
}
