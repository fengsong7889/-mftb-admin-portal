/**
 * 车辆参数库 API（品牌 → 车系 → 年款车型）
 *
 * 后端接口: /api/vehicle/masters/*
 *
 * 与车辆档案一样不提供 mock 降级：参数库是"车辆到底是什么车"的真值来源，
 * 拿假品牌列表让用户选下去，落到台账里就是无法追溯的脏数据。
 */
import request from './request'

export interface BrandVO {
  id: number
  brandName: string
  brandNameEn?: string | null
  countryOrigin?: string | null
  status: string
  sortOrder: number
  remark?: string | null
  seriesCount?: number
  vehicleCount?: number
  updatedBy: string
  updatedAt: string
}

export interface SeriesVO {
  id: number
  brandId: number
  brandName?: string
  seriesName: string
  bodyType: string
  energyType: string
  seatCount: number
  status: string
  remark?: string | null
  modelCount?: number
  vehicleCount?: number
  updatedBy: string
  updatedAt: string
}

export interface ModelVO {
  id: number
  seriesId: number
  brandName?: string
  seriesName?: string
  modelName: string
  yearLabel: string
  displacement?: string | null
  gearbox?: string | null
  seatCount?: number | null
  basePrice?: number | null
  status: string
  remark?: string | null
  vehicleCount?: number
  updatedBy: string
  updatedAt: string
}

export interface BrandSave {
  id?: number
  brandName: string
  brandNameEn?: string
  countryOrigin?: string
  status: string
  sortOrder?: number
  remark?: string
}

export interface SeriesSave {
  id?: number
  brandId: number
  seriesName: string
  bodyType: string
  energyType: string
  seatCount: number
  status: string
  remark?: string
}

export interface ModelSave {
  id?: number
  seriesId: number
  modelName: string
  yearLabel?: string
  displacement?: string
  gearbox?: string
  seatCount?: number
  basePrice?: number
  status: string
  remark?: string
}

/** includeDisabled=1 仅管理页使用；车辆档案级联只取启用项 */
const withEnabled = (includeDisabled: boolean) => ({ includeDisabled: includeDisabled ? 1 : 0 })

export function fetchBrands(includeDisabled = false): Promise<BrandVO[]> {
  return request.get<unknown, BrandVO[]>('/vehicle/masters/brands', { params: withEnabled(includeDisabled) })
}
export function createBrand(payload: BrandSave): Promise<number> {
  return request.post<unknown, number>('/vehicle/masters/brands', payload)
}
export function updateBrand(id: number, payload: BrandSave): Promise<number> {
  return request.put<unknown, number>(`/vehicle/masters/brands/${id}`, payload)
}
export function deleteBrand(id: number) {
  return request.delete(`/vehicle/masters/brands/${id}`)
}

export function fetchSeries(brandId?: number, includeDisabled = false): Promise<SeriesVO[]> {
  return request.get<unknown, SeriesVO[]>('/vehicle/masters/series', {
    params: { ...withEnabled(includeDisabled), ...(brandId ? { brandId } : {}) },
  })
}
export function createSeries(payload: SeriesSave): Promise<number> {
  return request.post<unknown, number>('/vehicle/masters/series', payload)
}
export function updateSeries(id: number, payload: SeriesSave): Promise<number> {
  return request.put<unknown, number>(`/vehicle/masters/series/${id}`, payload)
}
export function deleteSeries(id: number) {
  return request.delete(`/vehicle/masters/series/${id}`)
}

export function fetchModels(seriesId?: number, includeDisabled = false): Promise<ModelVO[]> {
  return request.get<unknown, ModelVO[]>('/vehicle/masters/models', {
    params: { ...withEnabled(includeDisabled), ...(seriesId ? { seriesId } : {}) },
  })
}
export function createModel(payload: ModelSave): Promise<number> {
  return request.post<unknown, number>('/vehicle/masters/models', payload)
}
export function updateModel(id: number, payload: ModelSave): Promise<number> {
  return request.put<unknown, number>(`/vehicle/masters/models/${id}`, payload)
}
export function deleteModel(id: number) {
  return request.delete(`/vehicle/masters/models/${id}`)
}
