import request from './request'

/** IconFont 卡片头像数据结构 */
export interface IconFontAvatar {
  id: number
  title: string
  icon_url: string
  category?: string
}

/**
 * 从 IconFont 获取卡片头像列表
 * @param keyword 搜索关键词（默认：卡通头像）
 * @param page 页码（默认：1）
 * @param pageSize 每页数量（默认：40）
 */
/**
 * 获取 IconFont 头像列表
 * 注意：当前使用模拟数据（placeholder），不依赖真实后端
 */
export async function fetchIconFontAvatars(keyword = '卡通头像', page = 1, pageSize = 40): Promise<{
  data: IconFontAvatar[]
  total: number
  page: number
  pageSize: number
}> {
  // 生成模拟数据（占位图）
  const startId = (page - 1) * pageSize + 1
  const data: IconFontAvatar[] = []
  
  for (let i = 0; i < pageSize; i++) {
    data.push({
      id: startId + i,
      title: `卡通头像-${startId + i}`,
      icon_url: `https://placehold.co/128x128/E8720C/ffffff.png?text=${startId + i}`,
      category: '卡通'
    })
  }
  
  return {
    data,
    total: page * pageSize * 3, // 模拟总数
    page,
    pageSize
  }
}

/**
 * 保存用户选中的头像 URL（持久化到后端数据库）
 * 注意：直接使用现有 updateAvatarApi，不依赖新接口
 * @param avatarUrl 头像 URL
 */
export function saveUserAvatarUrl(avatarUrl: string) {
  // Fallback: 直接调用 updateAvatarApi 保存到 avatar 字段
  import('../api/auth').then(module => module.updateAvatarApi(avatarUrl))
}

/**
 * 获取用户已保存的头像 URL
 */
export function getUserSavedAvatarUrl() {
  return request.get<unknown, string | null>('/auth/avatar-url')
}
