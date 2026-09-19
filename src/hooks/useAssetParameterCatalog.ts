import { useEffect, useState } from 'react'
import { fetchAllParamTypes, fetchCategoryList } from '../api/eam'
import type { AssetParameterCatalog } from '../utils/assetParams'

const EMPTY_CATALOG: AssetParameterCatalog = { categories: [], types: [] }
// 只合并并发字典查询，不缓存资产值，也不跨页面保留过期参数定义。
let pending: Promise<AssetParameterCatalog> | undefined
function fetchCatalog() {
  if (!pending) {
    pending = Promise.allSettled([fetchCategoryList(), fetchAllParamTypes()]).then(([categories, types]) => ({
      categories: categories.status === 'fulfilled' ? categories.value : [],
      types: types.status === 'fulfilled' ? types.value : [],
    })).finally(() => { pending = undefined })
  }
  return pending
}

export function useAssetParameterCatalog(enabled = true): AssetParameterCatalog {
  const [catalog, setCatalog] = useState(EMPTY_CATALOG)
  useEffect(() => {
    if (!enabled) return
    let active = true
    void fetchCatalog().then(data => { if (active) setCatalog(data) })
    return () => { active = false }
  }, [enabled])
  return catalog
}
