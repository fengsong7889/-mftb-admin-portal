/**
 * 批量列印資產標籤（資產標籤 - 列印中心）
 *
 * 數據源兩種模式（URL 參數）：
 *  - ?ids=1,2,3   資產台賬批量選中 / 單資產列印帶入
 *  - ?tagId=5     按模板反查全部綁定資產
 *
 * 輸出：
 *  - 瀏覽器列印：A4 標籤紙網格 + @media print 僅顯示標籤區
 *  - 匯出 PDF：html-to-image（foreignObject 由瀏覽器原生渲染，文字銳利）+ jsPDF 合成（動態 import 減首包）
 *  - 二維碼：內容為移動端 H5 查看頁（#/m/asset-tag-view?assetId=&tagId=），
 *    掃碼展示該標籤配置的字段與值。
 *
 * 遵循 AGENTS.md §C 表單頁規範（橙色漸變頭部 + 模塊卡片）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Empty, Radio, Select, Spin, Tag, message } from 'antd'
import {
  ArrowLeftOutlined, FilePdfOutlined, PrinterOutlined, ReloadOutlined, TagOutlined,
} from '@ant-design/icons'
import QRCode from 'qrcode'
import { fetchAssetTagList, fetchAssetIdsByTag, fetchAssetTagBindings } from '../../../api/eam'
import type { AssetTagTemplate } from '../../../api/eam'
import { fetchAssetDetail, type AssetItem } from '../../../api/asset'
import AssetTagPreview from '../AssetTag/AssetTagPreview'
import { buildTagValues } from '../AssetTag/tagValues'
import './index.css'

/** 每頁標籤容量（行 × 列）：按「5 字段標籤 + 二維碼」實測單格高約 72mm 取安全行數 */
const ROWS_BY_COLUMNS: Record<number, number> = { 3: 3, 4: 3 }

export default function AssetTagPrint() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const idsParam = searchParams.get('ids')
  const tagIdParam = searchParams.get('tagId')

  const [templates, setTemplates] = useState<AssetTagTemplate[]>([])
  const [selectedTagId, setSelectedTagId] = useState<number>()
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [loading, setLoading] = useState(false)
  const [showQr, setShowQr] = useState(true)
  const [columns, setColumns] = useState(3)
  const [qrMap, setQrMap] = useState<Record<string, string>>({})
  const [exporting, setExporting] = useState(false)
  const printAreaRef = useRef<HTMLDivElement>(null)

  const selectedTemplate = useMemo(
    () => templates.find(t => t.id === selectedTagId),
    [templates, selectedTagId],
  )

  const loadAssets = useCallback(async (ids: number[]) => {
    if (ids.length === 0) {
      setAssets([])
      return
    }
    setLoading(true)
    try {
      // Phase B 後端可提供批量接口；當前逐個獲取（量級：一次列印數十張，可接受）
      const list = await Promise.all(ids.map(id => fetchAssetDetail(id).catch(() => null)))
      setAssets(list.filter((a): a is AssetItem => a !== null))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      try {
        const list = await fetchAssetTagList()
        const enabled = list.filter(t => t.status === 'enabled')
        setTemplates(enabled)
        if (tagIdParam) {
          const tid = Number(tagIdParam)
          setSelectedTagId(tid)
          const ids = await fetchAssetIdsByTag(tid)
          await loadAssets(ids)
        } else if (idsParam) {
          const ids = idsParam.split(',').map(Number).filter(Boolean)
          await loadAssets(ids)
          // 預設選中第一個已綁定資產的主標籤（優先啟用中模板），減少手選步驟
          try {
            for (const id of ids) {
              const bindings = await fetchAssetTagBindings(id)
              const hit = bindings.find(b => b.tag.status === 'enabled')
              if (hit) {
                setSelectedTagId(hit.tag.id)
                break
              }
            }
          } catch { /* 無綁定關係時保持手動選擇 */ }
        }
      } catch (e: unknown) {
        message.error(e instanceof Error ? e.message : t('assetTag.loadDataFailed'))
      }
    }
    init()
  }, [idsParam, tagIdParam, loadAssets, t])

  /** 二維碼生成：H5 查看頁地址（HashRouter） */
  useEffect(() => {
    if (!showQr || !selectedTagId || assets.length === 0) return
    let cancelled = false
    const { origin, pathname } = window.location
    const generate = async () => {
      const map: Record<string, string> = {}
      for (const a of assets) {
        const url = `${origin}${pathname}#/m/asset-tag-view?assetId=${a.id}&tagId=${selectedTagId}`
        map[String(a.id)] = await QRCode.toDataURL(url, { margin: 1, width: 160 })
      }
      if (!cancelled) setQrMap(map)
    }
    generate()
    return () => { cancelled = true }
  }, [assets, selectedTagId, showQr])

  /** 資產按每頁容量分塊 */
  const pages = useMemo(() => {
    const perPage = (ROWS_BY_COLUMNS[columns] || 3) * columns
    const chunks: AssetItem[][] = []
    for (let i = 0; i < assets.length; i += perPage) chunks.push(assets.slice(i, i + perPage))
    return chunks
  }, [assets, columns])

  const handlePrint = () => {
    if (!selectedTagId) {
      message.warning(t('assetTag.selectFirstEmpty'))
      return
    }
    window.print()
  }

  const handleExportPdf = async () => {
    if (!selectedTagId || !printAreaRef.current) return
    setExporting(true)
    try {
      const [{ default: jsPDF }, { toJpeg }] = await Promise.all([
        import('jspdf'),
        import('html-to-image'),
      ])
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const sheetEls = Array.from(printAreaRef.current.querySelectorAll<HTMLElement>('.tag-a4-sheet'))
      // 截圖期間移除屏幕預覽縮放與水平居中：
      //  - 祖先 transform 縮放使 clone 檢測尺寸（571px）小於實際寬度（794px）；
      //  - sheet 的 margin: 0 auto 在 foreignObject（= canvas 像素寬）內會觸發居中，
      //    導致內容右移而右側被裁。兩者均需臨時歸零，截圖後恢復。
      const zoomEl = printAreaRef.current
      const prevTransform = zoomEl.style.transform
      const prevMargins = sheetEls.map(s => s.style.margin)
      zoomEl.style.transform = 'none'
      sheetEls.forEach(s => { s.style.margin = '0' })
      try {
        for (let i = 0; i < sheetEls.length; i++) {
          // 不用 html2canvas：其自行重放佈局，對小字號+mm 單位存在文字重影/錯位瑕疵；
          // html-to-image 走 foreignObject 由瀏覽器原生渲染，文字銳利。
          const dataUrl = await toJpeg(sheetEls[i], {
            pixelRatio: 3,
            quality: 0.95,
            backgroundColor: '#ffffff',
          })
          if (i > 0) pdf.addPage()
          pdf.addImage(dataUrl, 'JPEG', 0, 0, 210, 297)
        }
      } finally {
        zoomEl.style.transform = prevTransform
        sheetEls.forEach((s, i) => { s.style.margin = prevMargins[i] })
      }
      pdf.save(`${t('assetTag.pdfFilePrefix')}_${new Date().toISOString().slice(0, 10)}.pdf`)
      message.success(t('assetTag.pdfExported'))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('assetTag.pdfExportFailed'))
    } finally {
      setExporting(false)
    }
  }

  const hasAssets = assets.length > 0

  return (
    <div className="content-area">
      {/* ====== 頁面頭部（規範：橙色漸變條 + 返回 + 標題） ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button
            type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8,
              height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('assetTag.pageTitle')}</h2>
        </div>
      </div>

      {/* ====== 配置卡片（列印時隱藏） ====== */}
      <div className="asset-tag-print-config" style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, background: '#fff7e6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <TagOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('assetTag.printConfig')}</span>
        </div>
        <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />

        <span style={{ fontSize: 13, color: '#595959' }}>{t('assetTag.tagTemplateLabel')}</span>
        <Select
          style={{ width: 200 }}
          placeholder={t('assetTag.templatePh')}
          value={selectedTagId}
          onChange={setSelectedTagId}
          options={templates.map(t => ({ label: t.name, value: t.id }))}
        />
        <span style={{ fontSize: 13, color: '#595959' }}>{t('assetTag.columnsLabel')}</span>
        <Radio.Group value={columns} onChange={e => setColumns(e.target.value)} optionType="button" buttonStyle="solid">
          <Radio.Button value={3}>{t('assetTag.colCount', { count: 3 })}</Radio.Button>
          <Radio.Button value={4}>{t('assetTag.colCount', { count: 4 })}</Radio.Button>
        </Radio.Group>
        <Checkbox checked={showQr} onChange={e => setShowQr(e.target.checked)}>{t('assetTag.withQrLabel')}</Checkbox>
        <Tag color="blue" style={{ fontSize: 12 }}>{t('assetTag.assetsPagesLabel', { assets: assets.length, pages: pages.length })}</Tag>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={() => { const ids = assets.map(a => a.id); loadAssets(ids) }}>{t('assetTag.refreshBtn')}</Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint} disabled={!hasAssets}>{t('assetTag.printBtn')}</Button>
          <Button icon={<FilePdfOutlined />} onClick={handleExportPdf} loading={exporting} disabled={!hasAssets}>{t('assetTag.exportPdfBtn')}</Button>
        </div>
      </div>

      {/* ====== 標籤紙預覽區（列印時僅顯示此區） ====== */}
      <Spin spinning={loading}>
        {!selectedTemplate ? (
          <div style={{
            background: '#fff', borderRadius: 8, padding: 60,
            border: '1px solid #e8eaed', textAlign: 'center',
          }}>
            <Empty description={t('assetTag.selectFirstEmpty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : !hasAssets ? (
          <div style={{
            background: '#fff', borderRadius: 8, padding: 60,
            border: '1px solid #e8eaed', textAlign: 'center',
          }}>
            <Empty
              description={<span style={{ fontSize: 13, color: '#8c8c8c' }}>{t('assetTag.noPrintableAssets')}</span>}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        ) : (
          <div className="asset-tag-print-area">
            <div className="tag-print-preview-zoom" ref={printAreaRef}>
              {pages.map((pageAssets, pageIndex) => (
                <div className="tag-a4-sheet" key={pageIndex}>
                  <div className="tag-print-grid" style={{ ['--cols' as string]: columns }}>
                    {pageAssets.map(asset => (
                      <div className="tag-print-cell" key={asset.id}>
                        <AssetTagPreview fluid data={selectedTemplate} values={buildTagValues(asset)} />
                        {showQr && qrMap[String(asset.id)] && (
                          <div className="tag-print-qr">
                            <img src={qrMap[String(asset.id)]} alt={t('assetTag.qrAlt', { assetNo: asset.assetNo })} />
                            <span>{asset.assetNo}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Spin>
    </div>
  )
}
