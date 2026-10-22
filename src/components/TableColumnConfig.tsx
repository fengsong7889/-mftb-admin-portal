/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useEffect } from 'react'
import { Drawer, Checkbox, Button, Space } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  SettingOutlined,
  ReloadOutlined,
  HolderOutlined,
  CloseOutlined,
} from '@ant-design/icons'
import './TableColumnConfig.css'

/** 字段配置项 */
export interface ColumnConfig {
  key: string
  title: string
  visible: boolean
  locked: 'head' | 'tail' | null // null = 非锁定区域
}

interface TableColumnConfigProps {
  /** 列配置列表 */
  columns: ColumnConfig[]
  /** 配置变更回调 */
  onChange: (columns: ColumnConfig[]) => void
  /** 页面唯一标识，用于 localStorage 存储 */
  storageKey?: string
}

/**
 * 合并「本地已保存的列配置」与「页面最新列定义」。
 *
 * <p>为什么必须合并而不能原样使用本地存量：页面后续新增的列（如需求清单的「所屬迭代」）
 * 不在旧配置里，列配置抽屉就永远看不到这些列；一旦在抽屉里勾选/确认，还会把缺失新列的
 * 旧配置写回，表格上的新列随之消失。
 *
 * <p>合并口径：
 * - 保留用户已保存的顺序、显隐与锁定（用户显式关闭的列不会因补齐被重新打开）；
 * - 剔除已下线的列，标题/默认锁定跟随最新定义（语言切换、锁定调整）；
 * - 新增列插在默认顺序中「前一个已存在列」之后，避免新列永远沉到表格最右侧；
 *   前驱列也找不到时才退回尾部锁定列之前。
 */
// eslint-disable-next-line react-refresh/only-export-components
export function mergeColumnConfigs(
  saved: ColumnConfig[] | null | undefined,
  defaults: ColumnConfig[],
): ColumnConfig[] {
  if (!Array.isArray(saved) || saved.length === 0) return defaults.map(c => ({ ...c }))
  const merged: ColumnConfig[] = []
  for (const item of saved) {
    const def = defaults.find(d => d.key === item.key)
    if (def) {
      merged.push({
        ...item,
        title: def.title,
        visible: item.visible ?? def.visible,
        locked: item.locked ?? def.locked ?? null,
      })
    }
  }
  defaults.forEach((def, defIdx) => {
    if (merged.some(c => c.key === def.key)) return
    let insertAt = -1
    for (let i = defIdx - 1; i >= 0; i--) {
      const pos = merged.findIndex(c => c.key === defaults[i].key)
      if (pos >= 0) { insertAt = pos + 1; break }
    }
    if (insertAt < 0) {
      const tailIdx = merged.findIndex(c => c.locked === 'tail')
      insertAt = tailIdx >= 0 ? tailIdx : merged.length
    }
    merged.splice(insertAt, 0, {
      key: def.key,
      title: def.title,
      visible: def.visible,
      locked: def.locked ?? null,
    })
  })
  return merged
}

/** 两份列配置是否等价（key 顺序 + 标题 + 显隐 + 锁定） */
export function isSameColumnConfig(a: ColumnConfig[], b: ColumnConfig[]): boolean {
  if (a.length !== b.length) return false
  return a.every((item, i) => (
    item.key === b[i].key
    && item.title === b[i].title
    && item.visible === b[i].visible
    && item.locked === b[i].locked
  ))
}

/** 默认字段配置（从 localStorage 恢复，并与最新列定义合并） */
function loadConfig(storageKey: string | undefined, defaults: ColumnConfig[]): ColumnConfig[] {
  if (!storageKey) return defaults
  try {
    const saved = localStorage.getItem(`table-config-${storageKey}`)
    if (!saved) return defaults
    return mergeColumnConfigs(JSON.parse(saved) as ColumnConfig[], defaults)
  } catch { /* ignore */ }
  return defaults
}

function saveConfig(storageKey: string | undefined, config: ColumnConfig[]) {
  if (!storageKey) return
  localStorage.setItem(`table-config-${storageKey}`, JSON.stringify(config))
}

export default function TableColumnConfig({ columns, onChange, storageKey }: TableColumnConfigProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ColumnConfig[]>(() => loadConfig(storageKey, columns))
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<{ zone: string; index: number } | null>(null)

  /**
   * 列定义发生变化（新增列 / 删除列 / 语言切换改标题）时同步草稿。
   * <p>draft 只在挂载时读取一次，页面热更新或角色切换后 columns 已变、draft 还是旧的，
   * 抽屉里就会缺列；此时点任意开关都会把旧草稿写回，等于把新列从表格上抹掉。
   * 合并口径见 mergeColumnConfigs：保留用户已有顺序与显隐，只补新列、剔旧列、刷新标题。
   */
  useEffect(() => {
    setDraft(prev => {
      const next = mergeColumnConfigs(prev, columns)
      return isSameColumnConfig(prev, next) ? prev : next
    })
  }, [columns])

  // 保存到 localStorage 并通知父组件
  const applyConfig = useCallback((newConfig: ColumnConfig[]) => {
    setDraft(newConfig)
    saveConfig(storageKey, newConfig)
    onChange(newConfig)
  }, [storageKey, onChange])

  /** 切换字段显示/隐藏 */
  const toggleVisible = (key: string) => {
    const next = draft.map(c => c.key === key ? { ...c, visible: !c.visible } : c)
    applyConfig(next)
  }

  /** 全选/取消全选（非锁定区域可见字段） */
  const toggleSelectAll = () => {
    const unlocked = draft.filter(c => !c.locked)
    const allVisible = unlocked.every(c => c.visible)
    const next = draft.map(c => !c.locked ? { ...c, visible: !allVisible } : c)
    applyConfig(next)
  }

  /** 重置为初始配置 */
  const handleReset = () => {
    applyConfig([...columns])
  }

  /** 拖拽开始 */
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  /** 拖拽经过 */
  const handleDragOver = (e: React.DragEvent, zone: string, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver({ zone, index })
  }

  /** 拖拽放置 - 非锁定区域内排序 */
  const handleDrop = (e: React.DragEvent, dropZone: string, dropIndex: number) => {
    e.preventDefault()
    if (dragIndex === null) return

    const item = draft[dragIndex]
    const newDraft = [...draft]
    newDraft.splice(dragIndex, 1)

    if (dropZone === 'head') {
      // 拖到头部锁定区域
      item.locked = 'head'
      newDraft.splice(dropIndex, 0, item)
    } else if (dropZone === 'tail') {
      // 拖到尾部锁定区域
      item.locked = 'tail'
      const tailStart = newDraft.findIndex(c => c.locked === 'tail')
      const insertAt = tailStart === -1 ? newDraft.length : tailStart + dropIndex
      newDraft.splice(insertAt, 0, item)
    } else if (dropZone === 'unlocked') {
      // 拖到非锁定区域
      item.locked = null
      // 计算实际插入位置
      const headCount = newDraft.filter(c => c.locked === 'head').length
      newDraft.splice(dropIndex + headCount, 0, item)
    } else {
      // 直接按索引插入
      newDraft.splice(dropIndex, 0, item)
    }

    applyConfig(newDraft)
    setDragIndex(null)
    setDragOver(null)
  }

  /** 解除锁定（移回非锁定区域） */
  const unlockField = (key: string) => {
    const next = draft.map(c => c.key === key ? { ...c, locked: null } : c)
    applyConfig(next)
  }

  /** 确认 */
  const handleConfirm = () => {
    saveConfig(storageKey, draft)
    onChange(draft)
    setOpen(false)
  }

  const headLocked = draft.filter(c => c.locked === 'head')
  const tailLocked = draft.filter(c => c.locked === 'tail')
  const unlocked = draft.filter(c => !c.locked)
  const unlockedVisible = unlocked.filter(c => c.visible)
  const allUnlockedVisible = unlocked.length > 0 && unlocked.every(c => c.visible)

  return (
    <>
      {/* 设置图标按钮 */}
      <Button
        type="text"
        icon={<SettingOutlined />}
        className="table-column-config-btn"
        onClick={() => setOpen(true)}
        title={t('columnConfig.btnTitle')}
      />

      {/* 配置抽屉 */}
      <Drawer
        title={
          <div className="tcc-modal-title">
            <span>{t('columnConfig.title')}</span>
          </div>
        }
        open={open}
        onClose={() => setOpen(false)}
        width={480}
        placement="right"
        className="table-column-config-drawer"
        footer={
          <div className="tcc-footer">
            <Space>
              <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              <Button type="primary" onClick={handleConfirm}>{t('common.confirm')}</Button>
            </Space>
          </div>
        }
        destroyOnClose={false}
      >
        {/* 全选 + 重置 */}
        <div className="tcc-toolbar">
          <Checkbox
            checked={allUnlockedVisible}
            indeterminate={!allUnlockedVisible && unlockedVisible.length > 0}
            onChange={toggleSelectAll}
          >
            {t('columnConfig.selectAll')}
          </Checkbox>
          <Button type="link" icon={<ReloadOutlined />} onClick={handleReset} size="small">
            {t('columnConfig.reset')}
          </Button>
        </div>

        {/* 头部锁定区域 */}
        <div className="tcc-zone">
          <div className="tcc-zone-label">{t('columnConfig.headZone')}</div>
          <div
            className={`tcc-zone-content ${headLocked.length === 0 ? 'tcc-zone-empty' : ''}`}
            onDragOver={(e) => handleDragOver(e, 'head', headLocked.length)}
            onDrop={(e) => handleDrop(e, 'head', headLocked.length)}
          >
            {headLocked.length === 0 ? (
              <div className="tcc-zone-placeholder">
                {t('columnConfig.zoneEmpty')}
              </div>
            ) : (
              headLocked.map((col) => (
                <div
                  key={col.key}
                  className="tcc-field-item tcc-field-locked"
                  draggable
                  onDragStart={(e) => {
                    const idx = draft.findIndex(c => c.key === col.key)
                    handleDragStart(e, idx)
                  }}
                >
                  <HolderOutlined className="tcc-drag-handle" />
                  <Checkbox checked={col.visible} onChange={() => toggleVisible(col.key)}>
                    {col.title}
                  </Checkbox>
                  <CloseOutlined className="tcc-unlock-btn" onClick={() => unlockField(col.key)} title={t('columnConfig.unlock')} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* 非锁定区域 */}
        <div className="tcc-zone">
          <div className="tcc-zone-label">{t('columnConfig.unlockedZone')}</div>
          <div className="tcc-zone-content tcc-zone-main">
            {unlocked.map((col, idx) => (
              <div
                key={col.key}
                className={`tcc-field-item ${dragIndex !== null && draft[dragIndex]?.key === col.key ? 'tcc-field-dragging' : ''} ${dragOver?.zone === 'unlocked' && dragOver?.index === idx ? 'tcc-field-dragover' : ''}`}
                draggable
                onDragStart={(e) => {
                  const realIdx = draft.findIndex(c => c.key === col.key)
                  handleDragStart(e, realIdx)
                }}
                onDragOver={(e) => handleDragOver(e, 'unlocked', idx)}
                onDrop={(e) => handleDrop(e, 'unlocked', idx)}
              >
                <HolderOutlined className="tcc-drag-handle" />
                <Checkbox checked={col.visible} onChange={() => toggleVisible(col.key)}>
                  {col.title}
                </Checkbox>
                <HolderOutlined className="tcc-drag-icon" />
              </div>
            ))}
          </div>
        </div>

        {/* 尾部锁定区域 */}
        <div className="tcc-zone">
          <div className="tcc-zone-label">{t('columnConfig.tailZone')}</div>
          <div
            className={`tcc-zone-content ${tailLocked.length === 0 ? 'tcc-zone-empty' : ''}`}
            onDragOver={(e) => handleDragOver(e, 'tail', tailLocked.length)}
            onDrop={(e) => handleDrop(e, 'tail', tailLocked.length)}
          >
            {tailLocked.length === 0 ? (
              <div className="tcc-zone-placeholder">
                {t('columnConfig.zoneEmpty')}
              </div>
            ) : (
              tailLocked.map((col) => (
                <div
                  key={col.key}
                  className="tcc-field-item tcc-field-locked"
                  draggable
                  onDragStart={(e) => {
                    const idx = draft.findIndex(c => c.key === col.key)
                    handleDragStart(e, idx)
                  }}
                >
                  <HolderOutlined className="tcc-drag-handle" />
                  <Checkbox checked={col.visible} onChange={() => toggleVisible(col.key)}>
                    {col.title}
                  </Checkbox>
                  <CloseOutlined className="tcc-unlock-btn" onClick={() => unlockField(col.key)} title={t('columnConfig.unlock')} />
                </div>
              ))
            )}
          </div>
        </div>
      </Drawer>
    </>
  )
}

/** 根据列配置过滤和排序 Table columns */
// eslint-disable-next-line react-refresh/only-export-components
export function applyColumnConfig(
  tableColumns: any[],
  config: ColumnConfig[]
) {
  const visibleKeys = config.filter(c => c.visible).map(c => c.key)
  const keyOrder = config.map(c => c.key)

  return tableColumns
    .filter(col => visibleKeys.includes(col.key))
    .sort((a, b) => {
      const ia = keyOrder.indexOf(a.key)
      const ib = keyOrder.indexOf(b.key)
      return ia - ib
    })
    .map(col => {
      const cfg = config.find(c => c.key === col.key)
      if (cfg?.locked === 'head') return { ...col, fixed: 'left' as const }
      if (cfg?.locked === 'tail') return { ...col, fixed: 'right' as const }
      const { fixed: _, ...rest } = col
      return rest
    })
}
