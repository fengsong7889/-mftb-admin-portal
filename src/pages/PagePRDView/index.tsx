/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Tag, message, Input } from 'antd'
import { ArrowLeftOutlined, EditOutlined, SaveOutlined, UndoOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { getPagePRD, type PagePRD } from '../../components/PageDescriptions'
import { getCustomTips, saveCustomTips, deleteCustomTips, type CustomPageTips } from '../../utils/customTipsStorage'
import { useAuth } from '../../contexts/AuthContext'

/** 样式常量 */
const thStyle: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid #E8E8E8', color: '#666', fontWeight: 600 }
const tdLabel: React.CSSProperties = { padding: '10px 14px', fontWeight: 500, color: '#333' }
const tdValue: React.CSSProperties = { padding: '10px 14px', color: '#555' }
const sectionTitle: React.CSSProperties = { fontSize: 15, color: '#262626', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }
const titleBar: React.CSSProperties = { display: 'inline-block', width: 4, height: 16, background: '#E8720C', borderRadius: 2 }

export default function PagePRDView() {
  const { t } = useTranslation('common')
  const location = useLocation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()

  // 从来源页面路径参数获取目标页面，如果没有则使用来源页面
  const searchParams = new URLSearchParams(location.search)
  const fromPath = searchParams.get('from') || '/'
  const targetPath = fromPath

  const [defaultPrd, setDefaultPrd] = useState<PagePRD | null>(null)
  const [customTips, setCustomTips] = useState<CustomPageTips | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState<{
    description?: string
    features?: { label: string; desc: string }[]
    searchConditions?: { label: string; desc: string }[]
    fields?: { label: string; desc: string }[]
    actions?: string[]
    interaction?: string[]
    rules?: string[]
    formulas?: string[]
    notes?: string[]
  } | undefined>(undefined)
  const [editTips, setEditTips] = useState('')

  // 加载数据
  useEffect(() => {
    const prd = getPagePRD(targetPath)
    const custom = getCustomTips(targetPath)
    setDefaultPrd(prd)
    setCustomTips(custom)
  }, [targetPath])

  // 当前展示的合并数据：将自定义 prdContent 各模块覆盖到扁平字段上，
  // 确保编辑界面有数据的模块，查看界面都能对应展示
  const displayPrd: PagePRD | null = (() => {
    const custom = customTips?.prdContent
    const hasCustomObj = custom && typeof custom === 'object'
    if (!defaultPrd && !hasCustomObj) return null

    const base: PagePRD = defaultPrd || { title: '', module: '', description: '', features: [] }
    const merged: PagePRD = { ...base }

    if (hasCustomObj) {
      const c = custom as Exclude<typeof custom, string>
      if (c.description !== undefined) merged.description = c.description
      // features 编辑态为 {label, desc}，展示态为字符串：拼接 label 与 desc
      if (c.features !== undefined) {
        merged.features = c.features
          .map(f => (f.desc ? `${f.label}：${f.desc}` : f.label))
          .filter(s => s && s.trim())
      }
      if (c.fields !== undefined) merged.fields = c.fields
      if (c.actions !== undefined) merged.actions = c.actions
      if (c.interaction !== undefined) merged.interaction = c.interaction
      if (c.rules !== undefined) merged.rules = c.rules
      if (c.formulas !== undefined) merged.formulas = c.formulas
      if (c.notes !== undefined) merged.notes = c.notes
    }

    // 智能提示：自定义优先
    if (customTips?.tips && customTips.tips.length > 0) {
      merged.tips = customTips.tips
    }
    return merged
  })()

  // 进入编辑模式
  const handleStartEdit = () => {
    if (customTips?.prdContent && typeof customTips.prdContent === 'object') {
      setEditContent(customTips.prdContent)
    } else if (defaultPrd) {
      setEditContent({
        description: defaultPrd.description || '',
        features: (defaultPrd.features || []).map(f => ({ label: f, desc: '' })),
        fields: defaultPrd.fields || [],
        actions: defaultPrd.actions || [],
        interaction: defaultPrd.interaction || [],
        rules: defaultPrd.rules || [],
        formulas: defaultPrd.formulas || [],
        notes: defaultPrd.notes || [],
      })
    } else {
      setEditContent({})
    }
    const tips = customTips?.tips || defaultPrd?.tips || []
    setEditTips(tips.join('\n'))
    setIsEditing(true)
  }

  // 保存
  const handleSave = () => {
    const tips: CustomPageTips = {
      prdContent: editContent,
      tips: editTips ? editTips.split('\n').filter((s: string) => s.trim()) : undefined,
    }
    saveCustomTips(targetPath, tips)
    setCustomTips(tips)
    setIsEditing(false)
    message.success(t('saveSuccess'))
  }

  // 取消
  const handleCancelEdit = () => {
    setIsEditing(false)
  }

  // 恢复默认
  const handleReset = () => {
    deleteCustomTips(targetPath)
    setCustomTips(null)
    if (defaultPrd) {
      setEditContent({
        description: defaultPrd.description || '',
        features: (defaultPrd.features || []).map(f => ({ label: f, desc: '' })),
        fields: defaultPrd.fields || [],
        actions: defaultPrd.actions || [],
        interaction: defaultPrd.interaction || [],
        rules: defaultPrd.rules || [],
        formulas: defaultPrd.formulas || [],
        notes: defaultPrd.notes || [],
      })
      setEditTips(defaultPrd.tips?.join('\n') || '')
    }
    message.success(t('resetToDefault'))
  }

  // 编辑模式下的通用更新方法
  const updateField = (key: string, value: any) => {
    setEditContent(prev => ({ ...prev, [key]: value }))
  }

  // 列表项增删
  const addListItem = (key: string, defaultVal: any) => {
    const list = (editContent as Record<string, any>)?.[key] || []
    updateField(key, [...list, defaultVal])
  }
  const removeListItem = (key: string, index: number) => {
    const list = [...((editContent as Record<string, any>)?.[key] || [])]
    list.splice(index, 1)
    updateField(key, list)
  }
  const updateListItem = (key: string, index: number, value: any) => {
    const list = [...((editContent as Record<string, any>)?.[key] || [])]
    list[index] = value
    updateField(key, list)
  }

  // 返回
  const handleBack = () => {
    navigate(-1)
  }

  // 编辑模式下的通用样式
  const editTd: React.CSSProperties = { padding: '6px 10px' }
  const editSectionWrap: React.CSSProperties = { marginBottom: 24 }

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {/* 页面头部 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              }}
            >{t('back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                🐝 {isEditing ? t('editUiDescTitle') : t('uiRequirementDesc')}
              </h2>
              <span style={{ fontSize: 14, color: '#595959' }}>
                - {displayPrd?.title || t('pageLabel')}
              </span>
              {customTips && !isEditing && <Tag color="orange">{t('customTag')}</Tag>}
              {isEditing && <Tag color="blue">{t('editingTag')}</Tag>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isEditing && (
              <Button danger icon={<UndoOutlined />} onClick={handleReset}>{t('resetDefault')}</Button>
            )}
            {isEditing ? (
              <>
                <Button onClick={handleCancelEdit} style={{ borderRadius: 8, height: 36, padding: '0 18px' }}>{t('cancel')}</Button>
                <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}
                  style={{
                    backgroundColor: '#E8720C', borderColor: '#E8720C',
                    borderRadius: 8, height: 36, padding: '0 18px',
                    boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                  }}
                >{t('save')}</Button>
              </>
            ) : hasPermission('edit') ? (
              <Button type="primary" icon={<EditOutlined />} onClick={handleStartEdit}
                style={{
                  backgroundColor: '#E8720C', borderColor: '#E8720C',
                  borderRadius: 8, height: 36, padding: '0 18px',
                  boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                }}
              >{t('editDesc')}</Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      {displayPrd || isEditing ? (
        <div style={{ background: '#fff', borderRadius: 8, padding: '24px 28px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          {/* 模块路径 */}
          <div style={{ marginBottom: 20, padding: '10px 16px', background: '#FFF7ED', borderRadius: 8, borderLeft: '3px solid #E8720C' }}>
            <span style={{ color: '#999', fontSize: 12 }}>{t('modulePathLabel')}</span>
            <span style={{ color: '#333', fontSize: 14, fontWeight: 500 }}>{displayPrd?.module || '-'}</span>
            <span style={{ color: '#ccc', margin: '0 12px' }}>|</span>
            <span style={{ color: '#999', fontSize: 12 }}>{t('pagePathLabel2')}</span>
            <span style={{ color: '#666', fontSize: 13 }}>{targetPath}</span>
          </div>

          {/* 功能描述 */}
          {(isEditing || displayPrd?.description) && (
            <div style={editSectionWrap}>
              <h4 style={sectionTitle}><span style={titleBar} />{t('funcDesc')}</h4>
              {isEditing ? (
                <Input.TextArea
                  autoSize={{ minRows: 2, maxRows: 8 }}
                  value={editContent?.description || ''}
                  onChange={e => updateField('description', e.target.value)}
                  placeholder={t('funcDescPlaceholder')}
                  style={{ fontSize: 14, color: '#555', lineHeight: 1.9, border: '1px solid #d9d9d9', borderRadius: 6, padding: '8px 12px' }}
                />
              ) : (
                <p style={{ fontSize: 14, color: '#555', lineHeight: 1.9, margin: 0, paddingLeft: 14 }}>{displayPrd?.description}</p>
              )}
            </div>
          )}

          {/* 功能要点 */}
          {(isEditing || (displayPrd?.features && displayPrd.features.length > 0)) && (
            <div style={editSectionWrap}>
              <h4 style={sectionTitle}>
                <span style={titleBar} />{t('funcPoints')}
                {isEditing && <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => addListItem('features', { label: '', desc: '' })} style={{ fontSize: 12, marginLeft: 4 }}>{t('addField')}</Button>}
              </h4>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(editContent?.features || []).map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color: '#999', fontSize: 13, marginTop: 6, minWidth: 20 }}>{i + 1}.</span>
                      <Input value={f.label} onChange={e => updateListItem('features', i, { ...f, label: e.target.value })} placeholder={t('namePlaceholder')} style={{ flex: 1 }} />
                      <Input value={f.desc} onChange={e => updateListItem('features', i, { ...f, desc: e.target.value })} placeholder={t('descPlaceholder')} style={{ flex: 2 }} />
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeListItem('features', i)} />
                    </div>
                  ))}
                </div>
              ) : (
                <ul style={{ paddingLeft: 22, margin: 0 }}>
                  {(displayPrd?.features || []).map((f, i) => (
                    <li key={i} style={{ fontSize: 14, color: '#555', lineHeight: 2.2 }}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* 字段说明 */}
          {(isEditing || (displayPrd?.fields && displayPrd.fields.length > 0)) && (
            <div style={editSectionWrap}>
              <h4 style={sectionTitle}>
                <span style={titleBar} />{t('fieldDesc')}
                {isEditing && <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => addListItem('fields', { label: '', desc: '' })} style={{ fontSize: 12, marginLeft: 4 }}>{t('addField')}</Button>}
              </h4>
              {isEditing ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead><tr style={{ background: '#FAFAFA' }}><th style={thStyle}>{t('fieldName')}</th><th style={thStyle}>{t('fieldExplain')}</th><th style={{ ...thStyle, width: 40 }} /></tr></thead>
                  <tbody>
                    {(editContent?.fields || []).map((f, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F0F0F0' }}>
                        <td style={editTd}><Input value={f.label} onChange={e => updateListItem('fields', i, { ...f, label: e.target.value })} placeholder={t('fieldPlaceholder')} /></td>
                        <td style={editTd}><Input value={f.desc} onChange={e => updateListItem('fields', i, { ...f, desc: e.target.value })} placeholder={t('descPlaceholder')} /></td>
                        <td style={editTd}><Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeListItem('fields', i)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead><tr style={{ background: '#FAFAFA' }}><th style={thStyle}>{t('fieldName')}</th><th style={thStyle}>{t('fieldExplain')}</th></tr></thead>
                  <tbody>{(displayPrd?.fields || []).map((f, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F0F0F0' }}><td style={tdLabel}>{f?.label}</td><td style={tdValue}>{f?.desc}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          )}

          {/* 操作说明 */}
          {(isEditing || (displayPrd?.actions && displayPrd.actions.length > 0)) && (
            <div style={editSectionWrap}>
              <h4 style={sectionTitle}>
                <span style={titleBar} />{t('operationDesc')}
                {isEditing && <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => addListItem('actions', '')} style={{ fontSize: 12, marginLeft: 4 }}>{t('addField')}</Button>}
              </h4>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(editContent?.actions || []).map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: '#999', fontSize: 13 }}>•</span>
                      <Input value={a} onChange={e => updateListItem('actions', i, e.target.value)} placeholder={t('opPlaceholder')} style={{ flex: 1 }} />
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeListItem('actions', i)} />
                    </div>
                  ))}
                </div>
              ) : (
                <ul style={{ paddingLeft: 22, margin: 0 }}>
                  {(displayPrd?.actions || []).map((a, i) => (
                    <li key={i} style={{ fontSize: 14, color: '#555', lineHeight: 2.2 }}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* 交互说明 */}
          {(isEditing || (displayPrd?.interaction && displayPrd.interaction.length > 0)) && (
            <div style={editSectionWrap}>
              <h4 style={sectionTitle}>
                <span style={titleBar} />{t('interactionDesc')}
                {isEditing && <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => addListItem('interaction', '')} style={{ fontSize: 12, marginLeft: 4 }}>{t('addField')}</Button>}
              </h4>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(editContent?.interaction || []).map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: '#999', fontSize: 13 }}>•</span>
                      <Input value={item} onChange={e => updateListItem('interaction', i, e.target.value)} placeholder={t('interactPlaceholder')} style={{ flex: 1 }} />
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeListItem('interaction', i)} />
                    </div>
                  ))}
                </div>
              ) : (
                <ul style={{ paddingLeft: 22, margin: 0 }}>
                  {(displayPrd?.interaction || []).map((item, i) => (
                    <li key={i} style={{ fontSize: 14, color: '#555', lineHeight: 2.2 }}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* 取值规则 */}
          {(isEditing || (displayPrd?.rules && displayPrd.rules.length > 0)) && (
            <div style={editSectionWrap}>
              <h4 style={sectionTitle}>
                <span style={titleBar} />{t('valueRule')}
                {isEditing && <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => addListItem('rules', '')} style={{ fontSize: 12, marginLeft: 4 }}>{t('addField')}</Button>}
              </h4>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(editContent?.rules || []).map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: '#999', fontSize: 13 }}>•</span>
                      <Input value={r} onChange={e => updateListItem('rules', i, e.target.value)} placeholder={t('valueRulePlaceholder')} style={{ flex: 1 }} />
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeListItem('rules', i)} />
                    </div>
                  ))}
                </div>
              ) : (
                <ul style={{ paddingLeft: 22, margin: 0 }}>
                  {(displayPrd?.rules || []).map((r, i) => (
                    <li key={i} style={{ fontSize: 14, color: '#555', lineHeight: 2.2 }}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* 公式计算 */}
          {(isEditing || (displayPrd?.formulas && displayPrd.formulas.length > 0)) && (
            <div style={editSectionWrap}>
              <h4 style={sectionTitle}>
                <span style={titleBar} />{t('formulaCalc')}
                {isEditing && <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => addListItem('formulas', '')} style={{ fontSize: 12, marginLeft: 4 }}>{t('addField')}</Button>}
              </h4>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(editContent?.formulas || []).map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: '#999', fontSize: 13 }}>•</span>
                      <Input value={f} onChange={e => updateListItem('formulas', i, e.target.value)} placeholder={t('formula')} style={{ flex: 1, fontFamily: 'monospace' }} />
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeListItem('formulas', i)} />
                    </div>
                  ))}
                </div>
              ) : (
                <ul style={{ paddingLeft: 22, margin: 0 }}>
                  {(displayPrd?.formulas || []).map((f, i) => (
                    <li key={i} style={{ fontSize: 14, color: '#555', lineHeight: 2.2, fontFamily: 'monospace' }}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* 注意事项 */}
          {(isEditing || (displayPrd?.notes && displayPrd.notes.length > 0)) && (
            <div style={editSectionWrap}>
              <h4 style={sectionTitle}>
                <span style={titleBar} />{t('notesLabel')}
                {isEditing && <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => addListItem('notes', '')} style={{ fontSize: 12, marginLeft: 4 }}>{t('addField')}</Button>}
              </h4>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(editContent?.notes || []).map((n, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: '#999', fontSize: 13 }}>•</span>
                      <Input value={n} onChange={e => updateListItem('notes', i, e.target.value)} placeholder={t('notesPlaceholder')} style={{ flex: 1 }} />
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeListItem('notes', i)} />
                    </div>
                  ))}
                </div>
              ) : (
                <ul style={{ paddingLeft: 22, margin: 0 }}>
                  {(displayPrd?.notes || []).map((n, i) => (
                    <li key={i} style={{ fontSize: 14, color: '#555', lineHeight: 2.2 }}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* 智能提示 */}
          {(isEditing || (displayPrd?.tips && displayPrd.tips.length > 0)) && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={sectionTitle}><span style={titleBar} />{t('smartTips')}</h4>
              {isEditing ? (
                <textarea
                  rows={4}
                  value={editTips}
                  onChange={e => setEditTips(e.target.value)}
                  placeholder={t('smartTipPlaceholder')}
                  style={{
                    width: '100%', fontFamily: 'monospace', fontSize: 13,
                    padding: '8px 12px', border: '1px solid #d9d9d9', borderRadius: 6,
                    resize: 'vertical', outline: 'none',
                  }}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 6 }}>
                  {(displayPrd?.tips || []).map((tip, i) => (
                    <span key={i} style={{ fontSize: 14, color: '#595959', lineHeight: 1.7 }}>{tip}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* 无内容 */
        <div style={{
          background: '#fff', borderRadius: 8, padding: '60px 24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)', textAlign: 'center',
        }}>
          <p style={{ fontSize: 48, margin: '0 0 16px' }}>🐝</p>
          <p style={{ fontSize: 16, color: '#999' }}>{t('noRequirementDesc')}</p>
        </div>
      )}
    </div>
  )
}
