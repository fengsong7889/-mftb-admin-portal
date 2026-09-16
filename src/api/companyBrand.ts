/**
 * 公司品牌配置 API
 * 从后端 sys_company_brand 表动态加载品牌数据
 */
import request, { SILENT_HEADER, isBackendUnavailable } from './request'

/** 公司品牌项 */
export interface CompanyBrandItem {
  id: number
  code: string
  labelZh: string
  labelEn: string
}

/** 查询全部启用公司品牌 */
export async function fetchCompanyBrandList(): Promise<CompanyBrandItem[]> {
  try {
    return await request.get<unknown, CompanyBrandItem[]>('/company-brands')
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 静默查询（后端不可用时返回空数组） */
export async function fetchCompanyBrandListSilent(): Promise<CompanyBrandItem[]> {
  try {
    return await request.get<unknown, CompanyBrandItem[]>('/company-brands', {
      headers: { [SILENT_HEADER]: '1' },
    })
  } catch {
    return []
  }
}
