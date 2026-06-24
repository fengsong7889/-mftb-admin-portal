import { useState, useEffect, useCallback } from 'react'
import { Drawer, Checkbox, Button, Space } from 'antd'
import {
  SettingOutlined,
  ReloadOutlined,
  HolderOutlined,
  CheckSquareOutlined,
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

/** 默认字段配置（从 localStorage 恢复） */
function loadConfig(storageKey: string | undefined, defaults: ColumnConfig[]): ColumnConfig[] {
  if (!storageKey) return defaults
  try {
    const saved = localStorage.getItem(`table-config-${storageKey}`)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return defaults
}

function saveConfig(storageKey: string | undefined, config: ColumnConfig[]) {
  if (!storageKey) return
  localStorage.setItem(`table-config-${storageKey}`, JSON.stringify(config))
}

export default function TableColumnConfig({ columns, onChange, storageKey }: TableColumnConfigProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ColumnConfig[]>(() => loadConfig(storageKey, columns))
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<{ zone: string; index: number } | null>(null)

  // 同步外部 columns 变化
  useEffect(() => {
    setDraft(loadConfig(storageKey, columns))
  }, [columns, storageKey])

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
        title="表格字段設置"
      />

      {/* 配置抽屉 */}
      <Drawer
        title={
          <div className="tcc-modal-title">
            <span>表格字段排列</span>
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
              <Button onClick={() => setOpen(false)}>取消</Button>
              <Button type="primary" onClick={handleConfirm}>確認</Button>
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
            全選
          </Checkbox>
          <Button type="link" icon={<ReloadOutlined />} onClick={handleReset} size="small">
            重置
          </Button>
        </div>

        {/* 头部锁定区域 */}
        <div className="tcc-zone">
          <div className="tcc-zone-label">頭部鎖定區域</div>
          <div
            className={`tcc-zone-content ${headLocked.length === 0 ? 'tcc-zone-empty' : ''}`}
            onDragOver={(e) => handleDragOver(e, 'head', headLocked.length)}
            onDrop={(e) => handleDrop(e, 'head', headLocked.length)}
          >
            {headLocked.length === 0 ? (
              <div className="tcc-zone-placeholder">
                + 該區域無字段，可拖拽字段至此
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
                  <CloseOutlined className="tcc-unlock-btn" onClick={() => unlockField(col.key)} title="解除鎖定" />
                </div>
              ))
            )}
          </div>
        </div>

        {/* 非锁定区域 */}
        <div className="tcc-zone">
          <div className="tcc-zone-label">非鎖定區域</div>
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
          <div className="tcc-zone-label">尾部鎖定區域</div>
          <div
            className={`tcc-zone-content ${tailLocked.length === 0 ? 'tcc-zone-empty' : ''}`}
            onDragOver={(e) => handleDragOver(e, 'tail', tailLocked.length)}
            onDrop={(e) => handleDrop(e, 'tail', tailLocked.length)}
          >
            {tailLocked.length === 0 ? (
              <div className="tcc-zone-placeholder">
                + 該區域無字段，可拖拽字段至此
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
                  <CloseOutlined className="tcc-unlock-btn" onClick={() => unlockField(col.key)} title="解除鎖定" />
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
export function applyColumnConfig<T>(
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
