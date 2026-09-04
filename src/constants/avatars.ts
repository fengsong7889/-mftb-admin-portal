/**
 * 预设头像库 - 基于 DiceBear 免费头像 API
 * @see https://api.dicebear.com/9.1
 */

export interface PresetAvatar {
  style: string
  seed: string
  label: string
}

export const PRESET_AVATARS: PresetAvatar[] = [
  { style: 'adventurer', seed: 'Garfield', label: '冒险家' },
  { style: 'adventurer', seed: 'Shadow', label: '探险者' },
  { style: 'avataaars', seed: 'Midnight', label: '商务风' },
  { style: 'avataaars', seed: 'Felix', label: '绅士' },
  { style: 'fun-emoji', seed: 'Cookie', label: '趣味' },
  { style: 'fun-emoji', seed: 'Lucky', label: '幸运' },
  { style: 'lorelei', seed: 'Mimi', label: '文艺' },
  { style: 'lorelei', seed: 'Tiger', label: '优雅' },
  { style: 'bottts', seed: 'Rocky', label: '机器人' },
  { style: 'bottts', seed: 'Dusty', label: '钢铁' },
  { style: 'pixel-art', seed: 'Mega', label: '像素风' },
  { style: 'pixel-art', seed: 'Retro', label: '复古' },
  { style: 'thumbs', seed: 'Sunny', label: '阳光' },
  { style: 'thumbs', seed: 'Spark', label: '火花' },
  { style: 'big-ears', seed: 'Buddy', label: '可爱' },
  { style: 'big-ears', seed: 'Pepper', label: '萌趣' },
]

export function getPresetAvatarUrl(style: string, seed: string): string {
  return `https://api.dicebear.com/9.1/${style}/png?seed=${encodeURIComponent(seed)}&size=128`
}

export function isPresetAvatar(avatar: string): boolean {
  return avatar.startsWith('https://api.dicebear.com/')
}

export function isCustomAvatar(avatar: string): boolean {
  return avatar.startsWith('data:')
}

export function isSystemAvatar(avatar: string): boolean {
  return !avatar || avatar.startsWith('pikachu-')
}
