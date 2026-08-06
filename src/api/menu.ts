import request, { SILENT_HEADER, isBackendUnavailable } from './request'

/** 后端菜单 VO */
export interface MenuVO {
  id: number
  parentId: number | null
  parentName?: string | null
  menuKey: string
  name: string
  path?: string
  component?: string
  icon?: string
  type: number          // 1=目录 2=菜单 3=按钮
  sort: number
  actions?: string[]
  status: number        // 1=启用 0=停用
  createdAt?: string
  updatedBy?: string
  updatedAt?: string
  children?: MenuVO[]
}

/** 菜单新增/编辑请求 */
export interface MenuPayload {
  parentId?: number | null
  menuKey: string
  name: string
  path?: string
  component?: string
  icon?: string
  type: number
  sort?: number
  actions?: string[]
  status?: number
}

const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/** 获取菜单树 */
export async function fetchMenuTree() {
  try {
    return await request.get<unknown, MenuVO[]>('/menus/tree', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 获取菜单平铺列表 */
export async function fetchMenuList() {
  try {
    return await request.get<unknown, MenuVO[]>('/menus', SILENT)
  } catch (err) {
    if (isBackendUnavailable(err)) return []
    throw err
  }
}

/** 新增菜单 */
export async function createMenu(data: MenuPayload) {
  return request.post<unknown, MenuVO>('/menus', data)
}

/** 编辑菜单 */
export async function updateMenu(id: number, data: MenuPayload) {
  return request.put<unknown, MenuVO>(`/menus/${id}`, data)
}

/** 启用/停用菜单 */
export async function updateMenuStatus(id: number, status: number) {
  return request.put<unknown, void>(`/menus/${id}/status`, null, { params: { status } })
}

/** 删除菜单 */
export async function deleteMenu(id: number) {
  return request.delete<unknown, void>(`/menus/${id}`)
}
