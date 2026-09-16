/**
 * 資產標籤移動端查看頁（公開頁面，掃碼直達）
 *
 * 二維碼內容：#/m/asset-tag-view?assetId=&tagId=
 * 按標籤模板配置的字段順序，展示該資產對應字段的真實值。
 *
 * 安全邊界（Phase B 後端落地時強制）：
 *  - 免登錄只讀接口僅返回模板配置的字段白名單值，不暴露全量資產數據；
 *  - 資產 ID 不可枚舉：建議二維碼 URL 帶後端簽名 token（HMAC + 時效）校驗。
 *
 * Phase A：模板/綁定走 mock 降級鏈，資產數據走真實接口（後端 /eam/assets）。
 */
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Spin, Result } from 'antd'
import { QrcodeOutlined } from '@ant-design/icons'
import {
  fetchAssetTagBindings,
} from '../../api/eam'
import type { AssetTagTemplate } from '../../api/eam'
import { fetchAssetDetail, type AssetItem } from '../../api/asset'
import { buildTagValues } from '../AssetManagement/AssetTag/tagValues'
import { ASSET_DISPLAY_FIELDS } from '../../api/eam'

type LoadState = 'loading' | 'ok' | 'notfound' | 'error'

export default function AssetTagView() {
  const [searchParams] = useSearchParams()
  const assetId = Number(searchParams.get('assetId'))
  const tagId = Number(searchParams.get('tagId'))

  const [state, setState] = useState<LoadState>(assetId && tagId ? 'loading' : 'notfound')
  const [errorMsg, setErrorMsg] = useState('')
  const [tag, setTag] = useState<AssetTagTemplate | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!assetId || !tagId) {
      setState('notfound')
      return
    }
    let cancelled = false
    const load = async () => {
      setState('loading')
      try {
        const bindings = await fetchAssetTagBindings(assetId)
        const binding = bindings.find(b => b.tag.id === tagId)
        if (!binding) {
          if (!cancelled) setState('notfound')
          return
        }
        const asset: AssetItem = await fetchAssetDetail(assetId)
        if (cancelled) return
        setTag(binding.tag)
        setValues(buildTagValues(asset))
        setState('ok')
      } catch (e: unknown) {
        if (cancelled) return
        setErrorMsg(e instanceof Error ? e.message : '數據加載失敗')
        setState('error')
      }
    }
    load()
    return () => { cancelled = true }
  }, [assetId, tagId])

  if (state === 'loading') {
    return (
      <div style={{
        minHeight: '100vh', background: '#f5f6f8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Spin size="large" tip="加載中..." />
      </div>
    )
  }

  if (state === 'notfound') {
    return (
      <MobileShell>
        <Result
          status="404"
          title="標籤不存在"
          subTitle="二維碼無效或該資產已解綁此標籤"
        />
      </MobileShell>
    )
  }

  if (state === 'error') {
    return (
      <MobileShell>
        <Result status="warning" title="加載失敗" subTitle={errorMsg} />
      </MobileShell>
    )
  }

  const fields = ASSET_DISPLAY_FIELDS.filter(f => tag?.displayFields.includes(f.key))

  return (
    <MobileShell>
      <div style={{ padding: 16 }}>
        {/* 標籤頭：模板配色 + 標籤名稱 */}
        <div style={{
          background: tag?.bgColor || '#1890FF',
          color: tag?.textColor || '#fff',
          borderRadius: '16px 16px 0 0',
          padding: '20px 20px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{tag?.name || '資產標籤'}</div>
            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>資產標籤 · 掃碼查看</div>
          </div>
          <QrcodeOutlined style={{ fontSize: 22, opacity: 0.85 }} />
        </div>

        {/* 字段列表：模板配置順序 + 真實值 */}
        <div style={{
          background: '#fff',
          borderRadius: '0 0 16px 16px',
          padding: '4px 20px 8px',
          border: `1px solid ${tag?.bgColor || '#1890FF'}33`,
          borderTop: 'none',
        }}>
          {fields.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: '#8c8c8c' }}>
              該標籤未配置展示字段
            </div>
          ) : fields.map((f, idx) => (
            <div key={f.key} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 16,
              padding: '13px 0',
              borderBottom: idx < fields.length - 1 ? '1px solid #f5f5f5' : 'none',
            }}>
              <span style={{ fontSize: 13, color: '#8c8c8c', flexShrink: 0 }}>{f.label}</span>
              <span style={{ fontSize: 14, color: '#262626', fontWeight: 500, textAlign: 'right', wordBreak: 'break-all' }}>
                {values[f.key] || '—'}
              </span>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#bfbfbf', marginTop: 16 }}>
          閃蜂物資管理 · 資產標籤系統
        </div>
      </div>
    </MobileShell>
  )
}

/** 移動端外殼：無側邊欄/頂欄，居中卡片容器 */
function MobileShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#f5f6f8',
      display: 'flex', justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {children}
      </div>
    </div>
  )
}
