/**
 * 資產數據 → 標籤渲染值轉換工具
 *
 * 將 AssetItem 轉為 AssetTagPreview values（鍵對齊 ASSET_DISPLAY_FIELDS），
 * 枚舉字段（狀態 / 採購形式）轉中文；複用於綁定區塊、批量列印、移動端 H5。
 */
import type { AssetItem } from '../../../api/asset'

const STATUS_LABELS: Record<string, string> = {
  idle: '閒置',
  in_use: '在用',
  in_repair: '維修中',
  scrapped: '已報廢',
}

const SOURCE_LABELS: Record<string, string> = {
  self: '自購',
  lease: '租用',
}

/** 將資產數據轉為標籤渲染值（鍵對齊 ASSET_DISPLAY_FIELDS，缺字段顯示 '—' 由預覽組件處理） */
export function buildTagValues(asset: AssetItem): Record<string, string> {
  return {
    assetNo: asset.assetNo || '',
    assetType: asset.assetType || '',
    brand: asset.brand || '',
    assetName: asset.assetName || '',
    status: STATUS_LABELS[asset.status] || asset.status || '',
    userName: asset.userName || '',
    department: asset.department || '',
    company: asset.company || '',
    location: asset.location || '',
    source: SOURCE_LABELS[asset.source] || asset.source || '',
    purchaseDate: asset.purchaseDate || '',
  }
}
