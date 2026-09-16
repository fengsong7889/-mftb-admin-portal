import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react'
import { fetchCompanyBrandListSilent, type CompanyBrandItem } from '../api/companyBrand'

/** 公司品牌 Context 值 */
interface CompanyBrandContextValue {
  /** 全部启用品牌（API 原始数据） */
  brands: CompanyBrandItem[]
  /** 数值 Select 选项（EAM 采购/入库/资产表单用） */
  numericOptions: { label: string; value: number; code: string }[]
  /** id → 编码 映射（如 {1: 'TB', 2: 'MF'}） */
  codeMap: Record<number, string>
  /** id → 中文标签 映射（如 {1: '閃蜂', 2: 'mFood'}） */
  labelMap: Record<number, string>
  /** 编码提示（如 {1: 'TB', 2: 'MF'}，表单内展示用） */
  codeHint: Record<number, string>
  /** 数据是否已加载完成 */
  loaded: boolean
}

const CompanyBrandContext = createContext<CompanyBrandContextValue>({
  brands: [],
  numericOptions: [],
  codeMap: {},
  labelMap: {},
  codeHint: {},
  loaded: false,
})

/** 获取公司品牌数据（含编码/标签），供 EAM 模块使用 */
export function useCompanyBrand() {
  return useContext(CompanyBrandContext)
}

export function CompanyBrandProvider({ children }: { children: ReactNode }) {
  const [brands, setBrands] = useState<CompanyBrandItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetchCompanyBrandListSilent().then((data) => {
      setBrands(data)
      setLoaded(true)
    })
  }, [])

  const value = useMemo<CompanyBrandContextValue>(() => {
    const numericOptions = brands.map((b) => ({
      label: b.labelZh,
      value: b.id,
      code: b.code,
    }))
    const codeMap: Record<number, string> = {}
    const labelMap: Record<number, string> = {}
    const codeHint: Record<number, string> = {}
    for (const b of brands) {
      codeMap[b.id] = b.code
      labelMap[b.id] = b.labelZh
      codeHint[b.id] = b.code
    }
    return { brands, numericOptions, codeMap, labelMap, codeHint, loaded }
  }, [brands, loaded])

  return (
    <CompanyBrandContext.Provider value={value}>
      {children}
    </CompanyBrandContext.Provider>
  )
}
