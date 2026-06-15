import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Space, Input, InputNumber, Select, Table, Tag, Modal, Form, DatePicker, TimePicker,
  ColorPicker, Upload, Switch, Radio, Checkbox, message, Popover,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined, UploadOutlined,
  EyeOutlined, TranslationOutlined, FireOutlined, PushpinOutlined, PushpinFilled,
  SmileOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { RangePicker } = DatePicker
const { RangePicker: TimeRangePicker } = TimePicker

/* ======================== 常量定义 ======================== */

/** 搜索入口（合并原 searchPage + searchChannel） */
const searchEntryOptions = [
  { label: '大首頁', value: 'home' },
  { label: '外賣搜索', value: 'takeaway' },
  { label: '超市搜索', value: 'supermarket' },
  { label: '團購搜索', value: 'groupBuy' },
]

/** 品牌 */
const brandOptions = [
  { label: '全部', value: 'all' },
  { label: 'mFood', value: 'mFood' },
  { label: '閃蜂', value: 'flashBee' },
]

/** 展示終端 */
const terminalOptions = [
  { label: 'APP', value: 'app' },
  { label: '微信小程序', value: 'wechatMini' },
]

/** 展示區域 */
const regionOptions = [
  { label: '全部', value: 'all' },
  { label: '澳門', value: 'macau' },
  { label: '氹仔', value: 'taipa' },
  { label: '珠海市', value: 'zhuhai' },
]

/** 時段 */
const timeSlotOptions = [
  { label: '全時段', value: 'allDay' },
  { label: '早餐', value: 'breakfast' },
  { label: '午餐', value: 'lunch' },
  { label: '下午茶', value: 'afternoonTea' },
  { label: '晚餐', value: 'dinner' },
  { label: '宵夜', value: 'midnightSnack' },
]

/** 人群 */
const crowdOptions = [
  { label: '全部', value: 'all' },
  { label: '新用戶', value: 'newUser' },
  { label: '老用戶', value: 'oldUser' },
  { label: 'VIP用戶', value: 'vip' },
]

/** 熱搜詞來源 */
const wordSourceOptions = [
  { label: '自定義詞', value: 'custom' },
  { label: '熱搜詞庫', value: 'hotSearchLib' },
]

/** 詞庫二級模式 */
const libModeOptions = [
  { label: '指定詞', value: 'specific' },
  { label: '自動獲取排名', value: 'autoRank' },
]

/** 推廣類型 */
const promotionTypeOptions = [
  { label: '商家推廣', value: 'merchant' },
  { label: '活動推廣', value: 'activity' },
  { label: '熱搜推廣', value: 'hotSearch' },
]

/** 跳轉類型（按推廣類型動態過濾） */
const allJumpTypeOptions = [
  { label: '無跳轉', value: 'none' },
  { label: '商家頁', value: 'merchantPage' },
  { label: 'H5鏈接', value: 'h5' },
  { label: 'APP頁面', value: 'appPage' },
]

/** APP頁面 */
const appPageOptions = [
  { label: '個人中心', value: 'personalCenter' },
  { label: '簽到中心', value: 'checkInCenter' },
  { label: '領取中心', value: 'claimCenter' },
  { label: '訂單界面', value: 'orderPage' },
]

/** 展示模式 */
const displayModeOptions = [
  { label: '文字模式', value: 'text' },
  { label: '圖片模式', value: 'image' },
]

/** 常用表情 */
const emojiOptions = ['🔥', '⭐', '🎉', '🎊', '💥', '🆕', '👑', '🎁', '💰', '🏷️', '🍜', '🍕', '🍔', '🧋', '🍰', '☕']

/** 模擬詞庫數據 */
const mockLibWords = ['火鍋', '珍珠奶茶', '酸菜魚', '炸雞', '壽司', '拉麵', '麻辣燙', '烤鴨', '漢堡', '披薩', '咖喱飯', '三文魚']

/* ======================== Map ======================== */

const searchEntryMap: Record<string, string> = { home: '大首頁', takeaway: '外賣搜索', supermarket: '超市搜索', groupBuy: '團購搜索' }
const brandMap: Record<string, string> = { mFood: 'mFood', flashBee: '閃蜂' }
const terminalMap: Record<string, string> = { app: 'APP', wechatMini: '微信小程序', mpayMini: 'Mpay小應用', wechatH5: '微信H5' }
const regionMap: Record<string, string> = { macau: '澳門', taipa: '氹仔', zhuhai: '珠海市' }
const timeSlotMap: Record<string, string> = { allDay: '全時段', breakfast: '早餐', lunch: '午餐', afternoonTea: '下午茶', dinner: '晚餐', midnightSnack: '宵夜' }
const crowdMap: Record<string, string> = { all: '全部', newUser: '新用戶', oldUser: '老用戶', vip: 'VIP用戶' }
const wordSourceMap: Record<string, string> = { custom: '自定義詞', hotSearchLib: '熱搜詞庫' }
const promotionTypeMap: Record<string, string> = { merchant: '商家推廣', activity: '活動推廣', hotSearch: '熱搜推廣' }
const jumpTypeMap: Record<string, string> = { none: '無跳轉', merchantPage: '商家頁', h5: 'H5鏈接', appPage: 'APP頁面' }
const displayModeMap: Record<string, string> = { text: '文字', image: '圖片' }

/* ======================== 接口 & Mock ======================== */

interface HotSearchRecord {
  key: string
  id: number
  word: string
  wordEn: string
  wordSource: string
  libMode: string
  hotSearchRank: number | null
  promotionType: string
  jumpType: string
  jumpTarget: string
  searchEntry: string
  brand: string
  terminal: string[]
  region: string[]
  timeSlot: string[]
  displayMode: string
  displayTimeRange: [string, string] | null
  startDate: string
  endDate: string
  hasImage: boolean
  imageUrl?: string
  imageUrlEn?: string
  sortOrder: number
  status: string
  updateTime: string
}

const mockData: HotSearchRecord[] = [
  { key: '1', id: 1001, word: '🔥 限時火鍋優惠', wordEn: 'Hot Pot Deal', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'activity', jumpType: 'h5', jumpTarget: 'https://example.com/hotpot', searchEntry: 'home', brand: 'mFood', terminal: ['app', 'wechatMini'], region: ['macau', 'taipa'], timeSlot: ['dinner'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-06-30', hasImage: false, sortOrder: 1, status: 'active', updateTime: '2026-06-05 10:00:00' },
  { key: '2', id: 1002, word: '珍珠奶茶', wordEn: 'Bubble Tea', wordSource: 'hotSearchLib', libMode: 'specific', hotSearchRank: null, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app'], region: ['macau'], timeSlot: ['afternoonTea'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 2, status: 'active', updateTime: '2026-06-04 15:30:00' },
  { key: '3', id: 1003, word: '🆕 美味漢堡', wordEn: 'Tasty Burger', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'merchant', jumpType: 'merchantPage', jumpTarget: 'shop_10086', searchEntry: 'takeaway', brand: 'mFood', terminal: ['app', 'wechatMini'], region: ['macau', 'taipa'], timeSlot: ['lunch'], displayMode: 'image', displayTimeRange: null, startDate: '2026-06-10', endDate: '2026-06-20', hasImage: true, imageUrl: 'https://via.placeholder.com/100x20/DC2626/FFFFFF?text=%E7%BE%8E%E5%91%B3%E6%BC%A2%E5%A0%A1', imageUrlEn: 'https://via.placeholder.com/100x20/DC2626/FFFFFF?text=Tasty+Burger', sortOrder: 3, status: 'active', updateTime: '2026-06-03 09:00:00' },
  { key: '4', id: 1004, word: '炸雞', wordEn: 'Fried Chicken', wordSource: 'hotSearchLib', libMode: 'autoRank', hotSearchRank: 10, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app'], region: ['macau'], timeSlot: ['allDay'], displayMode: 'text', displayTimeRange: ['08:00', '14:00'], startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 4, status: 'active', updateTime: '2026-06-02 14:00:00' },
  { key: '5', id: 1005, word: '1元購', wordEn: '1-Yuan Deal', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'activity', jumpType: 'appPage', jumpTarget: 'checkInCenter', searchEntry: 'takeaway', brand: 'mFood', terminal: ['app'], region: ['taipa'], timeSlot: ['afternoonTea'], displayMode: 'image', displayTimeRange: null, startDate: '2026-06-05', endDate: '2026-06-25', hasImage: true, imageUrl: 'https://via.placeholder.com/100x20/DC2626/FFFFFF?text=1%E5%85%83%E8%B4%AD', imageUrlEn: 'https://via.placeholder.com/100x20/DC2626/FFFFFF?text=1-Yuan+Deal', sortOrder: 5, status: 'active', updateTime: '2026-06-01 11:20:00' },
  { key: '6', id: 1006, word: '壽司', wordEn: 'Sushi', wordSource: 'hotSearchLib', libMode: 'autoRank', hotSearchRank: 5, promotionType: 'merchant', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app', 'wechatMini'], region: ['macau', 'taipa'], timeSlot: ['dinner'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 6, status: 'active', updateTime: '2026-05-30 16:45:00' },
  { key: '7', id: 1007, word: '🎉 限時披薩折扣', wordEn: 'Pizza Discount', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'activity', jumpType: 'h5', jumpTarget: 'https://example.com/pizza', searchEntry: 'home', brand: 'mFood', terminal: ['app'], region: ['macau'], timeSlot: ['lunch', 'dinner'], displayMode: 'image', displayTimeRange: null, startDate: '2026-06-08', endDate: '2026-06-28', hasImage: true, imageUrl: 'https://via.placeholder.com/100x20/E8720C/FFFFFF?text=%E6%8A%AB%E8%96%A9%E6%8A%98%E6%89%A3', imageUrlEn: 'https://via.placeholder.com/100x20/E8720C/FFFFFF?text=Pizza+Deal', sortOrder: 7, status: 'active', updateTime: '2026-06-06 09:15:00' },
  { key: '8', id: 1008, word: '拉麵', wordEn: 'Ramen', wordSource: 'hotSearchLib', libMode: 'specific', hotSearchRank: null, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'takeaway', brand: 'flashBee', terminal: ['app', 'wechatMini'], region: ['macau', 'taipa'], timeSlot: ['allDay'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 8, status: 'active', updateTime: '2026-05-28 11:30:00' },
  { key: '9', id: 1009, word: '🍰 下午茶精選', wordEn: 'Afternoon Tea', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'merchant', jumpType: 'merchantPage', jumpTarget: 'shop_20088', searchEntry: 'home', brand: 'mFood', terminal: ['app'], region: ['taipa'], timeSlot: ['afternoonTea'], displayMode: 'image', displayTimeRange: null, startDate: '2026-06-12', endDate: '2026-07-12', hasImage: true, imageUrl: 'https://via.placeholder.com/100x20/FAAD14/FFFFFF?text=%E4%B8%8B%E5%8D%88%E8%8C%B6', imageUrlEn: 'https://via.placeholder.com/100x20/FAAD14/FFFFFF?text=Tea+Time', sortOrder: 9, status: 'active', updateTime: '2026-06-07 14:20:00' },
  { key: '10', id: 1010, word: '酸菜魚', wordEn: 'Sauerkraut Fish', wordSource: 'hotSearchLib', libMode: 'autoRank', hotSearchRank: 8, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app', 'wechatMini'], region: ['macau'], timeSlot: ['dinner'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 10, status: 'active', updateTime: '2026-05-25 16:00:00' },
  { key: '11', id: 1011, word: '🍕 披薩套餐', wordEn: 'Pizza Set', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'activity', jumpType: 'h5', jumpTarget: 'https://example.com/pizza-set', searchEntry: 'home', brand: 'mFood', terminal: ['app'], region: ['macau'], timeSlot: ['lunch'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-06-30', hasImage: false, sortOrder: 11, status: 'active', updateTime: '2026-06-05 09:00:00' },
  { key: '12', id: 1012, word: '燒味', wordEn: 'Roast Meat', wordSource: 'hotSearchLib', libMode: 'specific', hotSearchRank: null, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'takeaway', brand: 'flashBee', terminal: ['app'], region: ['macau'], timeSlot: ['allDay'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 12, status: 'active', updateTime: '2026-06-04 10:30:00' },
  { key: '13', id: 1013, word: '🎊 新開張優惠', wordEn: 'Grand Opening', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'merchant', jumpType: 'merchantPage', jumpTarget: 'shop_30099', searchEntry: 'home', brand: 'mFood', terminal: ['app', 'wechatMini'], region: ['taipa'], timeSlot: ['dinner'], displayMode: 'image', displayTimeRange: null, startDate: '2026-06-15', endDate: '2026-07-15', hasImage: true, imageUrl: 'https://via.placeholder.com/100x20/7C3AED/FFFFFF?text=%E6%96%B0%E9%96%8B%E5%BC%B5', imageUrlEn: 'https://via.placeholder.com/100x20/7C3AED/FFFFFF?text=Opening', sortOrder: 13, status: 'active', updateTime: '2026-06-03 11:20:00' },
  { key: '14', id: 1014, word: '粥品', wordEn: 'Congee', wordSource: 'hotSearchLib', libMode: 'autoRank', hotSearchRank: 15, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app'], region: ['macau'], timeSlot: ['breakfast'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 14, status: 'active', updateTime: '2026-06-02 08:15:00' },
  { key: '15', id: 1015, word: '☕ 咖啡特飲', wordEn: 'Coffee Special', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'activity', jumpType: 'appPage', jumpTarget: 'claimCenter', searchEntry: 'takeaway', brand: 'mFood', terminal: ['app'], region: ['macau', 'taipa'], timeSlot: ['afternoonTea'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-10', endDate: '2026-07-10', hasImage: false, sortOrder: 15, status: 'active', updateTime: '2026-06-01 14:30:00' },
  { key: '16', id: 1016, word: '麵食', wordEn: 'Noodles', wordSource: 'hotSearchLib', libMode: 'specific', hotSearchRank: null, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app', 'wechatMini'], region: ['macau'], timeSlot: ['lunch', 'dinner'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 16, status: 'active', updateTime: '2026-05-30 12:00:00' },
  { key: '17', id: 1017, word: '🍔 漢堡套餐', wordEn: 'Burger Set', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'merchant', jumpType: 'merchantPage', jumpTarget: 'shop_40077', searchEntry: 'takeaway', brand: 'mFood', terminal: ['app'], region: ['taipa'], timeSlot: ['lunch'], displayMode: 'image', displayTimeRange: null, startDate: '2026-06-08', endDate: '2026-06-28', hasImage: true, imageUrl: 'https://via.placeholder.com/100x20/059669/FFFFFF?text=%E6%BC%A2%E5%A0%A1%E5%A5%97%E9%A4%90', imageUrlEn: 'https://via.placeholder.com/100x20/059669/FFFFFF?text=Burger+Set', sortOrder: 17, status: 'active', updateTime: '2026-06-06 10:45:00' },
  { key: '18', id: 1018, word: '甜品', wordEn: 'Dessert', wordSource: 'hotSearchLib', libMode: 'autoRank', hotSearchRank: 12, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app'], region: ['macau'], timeSlot: ['afternoonTea'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 18, status: 'active', updateTime: '2026-05-28 15:20:00' },
  { key: '19', id: 1019, word: '🥗 沙律輕食', wordEn: 'Salad Light', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'activity', jumpType: 'h5', jumpTarget: 'https://example.com/salad', searchEntry: 'home', brand: 'mFood', terminal: ['app', 'wechatMini'], region: ['macau'], timeSlot: ['lunch'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-05', endDate: '2026-07-05', hasImage: false, sortOrder: 19, status: 'active', updateTime: '2026-06-04 09:30:00' },
  { key: '20', id: 1020, word: '海鮮', wordEn: 'Seafood', wordSource: 'hotSearchLib', libMode: 'specific', hotSearchRank: null, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'takeaway', brand: 'flashBee', terminal: ['app'], region: ['macau', 'taipa'], timeSlot: ['dinner'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 20, status: 'active', updateTime: '2026-05-25 18:00:00' },
  { key: '21', id: 1021, word: '🍜 雲吞麵', wordEn: 'Wonton Noodles', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'merchant', jumpType: 'merchantPage', jumpTarget: 'shop_50066', searchEntry: 'home', brand: 'mFood', terminal: ['app'], region: ['macau'], timeSlot: ['lunch', 'dinner'], displayMode: 'image', displayTimeRange: null, startDate: '2026-06-12', endDate: '2026-07-12', hasImage: true, imageUrl: 'https://via.placeholder.com/100x20/D97706/FFFFFF?text=%E9%9B%B2%E5%90%9E%E9%BA%B5', imageUrlEn: 'https://via.placeholder.com/100x20/D97706/FFFFFF?text=Wonton', sortOrder: 21, status: 'active', updateTime: '2026-06-07 11:00:00' },
  { key: '22', id: 1022, word: '快餐', wordEn: 'Fast Food', wordSource: 'hotSearchLib', libMode: 'autoRank', hotSearchRank: 20, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app', 'wechatMini'], region: ['macau'], timeSlot: ['allDay'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 22, status: 'active', updateTime: '2026-05-20 13:45:00' },
  { key: '23', id: 1023, word: '🧋 奶茶專賣', wordEn: 'Milk Tea Shop', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'activity', jumpType: 'appPage', jumpTarget: 'checkInCenter', searchEntry: 'takeaway', brand: 'mFood', terminal: ['app'], region: ['taipa'], timeSlot: ['afternoonTea'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-08', endDate: '2026-07-08', hasImage: false, sortOrder: 23, status: 'active', updateTime: '2026-06-05 16:20:00' },
  { key: '24', id: 1024, word: '燒烤', wordEn: 'BBQ', wordSource: 'hotSearchLib', libMode: 'specific', hotSearchRank: null, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app'], region: ['macau'], timeSlot: ['midnightSnack'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 24, status: 'active', updateTime: '2026-05-18 20:00:00' },
  { key: '25', id: 1025, word: '🍱 便當速遞', wordEn: 'Bento Delivery', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'merchant', jumpType: 'h5', jumpTarget: 'https://example.com/bento', searchEntry: 'takeaway', brand: 'mFood', terminal: ['app', 'wechatMini'], region: ['macau', 'taipa'], timeSlot: ['lunch'], displayMode: 'image', displayTimeRange: null, startDate: '2026-06-15', endDate: '2026-07-15', hasImage: true, imageUrl: 'https://via.placeholder.com/100x20/DC2626/FFFFFF?text=%E4%BE%BF%E7%95%B6', imageUrlEn: 'https://via.placeholder.com/100x20/DC2626/FFFFFF?text=Bento', sortOrder: 25, status: 'active', updateTime: '2026-06-03 12:30:00' },
  { key: '26', id: 1026, word: '火鍋', wordEn: 'Hot Pot', wordSource: 'hotSearchLib', libMode: 'autoRank', hotSearchRank: 7, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app'], region: ['macau'], timeSlot: ['dinner'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 26, status: 'active', updateTime: '2026-05-15 19:00:00' },
  { key: '27', id: 1027, word: '🥐 法式面包', wordEn: 'French Bread', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'activity', jumpType: 'merchantPage', jumpTarget: 'shop_60055', searchEntry: 'home', brand: 'mFood', terminal: ['app'], region: ['taipa'], timeSlot: ['breakfast'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-10', endDate: '2026-07-10', hasImage: false, sortOrder: 27, status: 'active', updateTime: '2026-06-01 07:30:00' },
  { key: '28', id: 1028, word: '日料', wordEn: 'Japanese Food', wordSource: 'hotSearchLib', libMode: 'specific', hotSearchRank: null, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'takeaway', brand: 'flashBee', terminal: ['app', 'wechatMini'], region: ['macau'], timeSlot: ['lunch', 'dinner'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 28, status: 'active', updateTime: '2026-05-12 12:15:00' },
  { key: '29', id: 1029, word: '🍦 雪糕特賣', wordEn: 'Ice Cream Sale', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'merchant', jumpType: 'appPage', jumpTarget: 'claimCenter', searchEntry: 'home', brand: 'mFood', terminal: ['app'], region: ['macau'], timeSlot: ['afternoonTea'], displayMode: 'image', displayTimeRange: null, startDate: '2026-06-08', endDate: '2026-08-08', hasImage: true, imageUrl: 'https://via.placeholder.com/100x20/7C3AED/FFFFFF?text=%E9%9B%AA%E7%B3%95', imageUrlEn: 'https://via.placeholder.com/100x20/7C3AED/FFFFFF?text=Ice+Cream', sortOrder: 29, status: 'active', updateTime: '2026-06-06 14:00:00' },
  { key: '30', id: 1030, word: '韓餐', wordEn: 'Korean Food', wordSource: 'hotSearchLib', libMode: 'autoRank', hotSearchRank: 18, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app'], region: ['macau', 'taipa'], timeSlot: ['dinner'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 30, status: 'active', updateTime: '2026-05-10 18:30:00' },
  { key: '31', id: 1031, word: '🥟 餃子專賣', wordEn: 'Dumpling Shop', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'activity', jumpType: 'h5', jumpTarget: 'https://example.com/dumpling', searchEntry: 'takeaway', brand: 'mFood', terminal: ['app'], region: ['macau'], timeSlot: ['lunch'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-05', endDate: '2026-07-05', hasImage: false, sortOrder: 31, status: 'active', updateTime: '2026-06-04 11:45:00' },
  { key: '32', id: 1032, word: '西餐', wordEn: 'Western Food', wordSource: 'hotSearchLib', libMode: 'specific', hotSearchRank: null, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app', 'wechatMini'], region: ['macau'], timeSlot: ['dinner'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 32, status: 'active', updateTime: '2026-05-08 19:15:00' },
  { key: '33', id: 1033, word: '🍗 炸雞放題', wordEn: 'Fried Chicken Buffet', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'merchant', jumpType: 'merchantPage', jumpTarget: 'shop_70044', searchEntry: 'home', brand: 'mFood', terminal: ['app'], region: ['taipa'], timeSlot: ['dinner'], displayMode: 'image', displayTimeRange: null, startDate: '2026-06-12', endDate: '2026-07-12', hasImage: true, imageUrl: 'https://via.placeholder.com/100x20/059669/FFFFFF?text=%E7%82%B8%E9%9B%9E', imageUrlEn: 'https://via.placeholder.com/100x20/059669/FFFFFF?text=Fried+Chicken', sortOrder: 33, status: 'active', updateTime: '2026-06-07 17:00:00' },
  { key: '34', id: 1034, word: '素食', wordEn: 'Vegetarian', wordSource: 'hotSearchLib', libMode: 'autoRank', hotSearchRank: 25, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'takeaway', brand: 'flashBee', terminal: ['app'], region: ['macau'], timeSlot: ['lunch'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 34, status: 'active', updateTime: '2026-05-05 12:00:00' },
  { key: '35', id: 1035, word: '🍝 意粉精選', wordEn: 'Pasta Selection', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'activity', jumpType: 'appPage', jumpTarget: 'checkInCenter', searchEntry: 'home', brand: 'mFood', terminal: ['app', 'wechatMini'], region: ['macau'], timeSlot: ['dinner'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-08', endDate: '2026-07-08', hasImage: false, sortOrder: 35, status: 'active', updateTime: '2026-06-05 18:30:00' },
  { key: '36', id: 1036, word: '小食', wordEn: 'Snacks', wordSource: 'hotSearchLib', libMode: 'specific', hotSearchRank: null, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app'], region: ['macau', 'taipa'], timeSlot: ['allDay'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 36, status: 'active', updateTime: '2026-05-03 10:00:00' },
  { key: '37', id: 1037, word: '🥘 燉湯滋補', wordEn: 'Soup Tonic', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'merchant', jumpType: 'h5', jumpTarget: 'https://example.com/soup', searchEntry: 'takeaway', brand: 'mFood', terminal: ['app'], region: ['macau'], timeSlot: ['dinner'], displayMode: 'image', displayTimeRange: null, startDate: '2026-06-15', endDate: '2026-07-15', hasImage: true, imageUrl: 'https://via.placeholder.com/100x20/D97706/FFFFFF?text=%E7%87%89%E6%B9%AF', imageUrlEn: 'https://via.placeholder.com/100x20/D97706/FFFFFF?text=Soup', sortOrder: 37, status: 'active', updateTime: '2026-06-03 19:00:00' },
  { key: '38', id: 1038, word: '泰餐', wordEn: 'Thai Food', wordSource: 'hotSearchLib', libMode: 'autoRank', hotSearchRank: 22, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app'], region: ['macau'], timeSlot: ['lunch', 'dinner'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 38, status: 'active', updateTime: '2026-05-01 13:00:00' },
  { key: '39', id: 1039, word: '🍩 甜甜圈', wordEn: 'Donuts', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'activity', jumpType: 'merchantPage', jumpTarget: 'shop_80033', searchEntry: 'home', brand: 'mFood', terminal: ['app', 'wechatMini'], region: ['taipa'], timeSlot: ['afternoonTea'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-10', endDate: '2026-07-10', hasImage: false, sortOrder: 39, status: 'active', updateTime: '2026-06-01 15:30:00' },
  { key: '40', id: 1040, word: '咖喱', wordEn: 'Curry', wordSource: 'hotSearchLib', libMode: 'specific', hotSearchRank: null, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'takeaway', brand: 'flashBee', terminal: ['app'], region: ['macau'], timeSlot: ['lunch'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 40, status: 'active', updateTime: '2026-04-28 12:30:00' },
  { key: '41', id: 1041, word: '🍣 壽司拼盤', wordEn: 'Sushi Platter', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'merchant', jumpType: 'appPage', jumpTarget: 'claimCenter', searchEntry: 'home', brand: 'mFood', terminal: ['app'], region: ['macau'], timeSlot: ['dinner'], displayMode: 'image', displayTimeRange: null, startDate: '2026-06-08', endDate: '2026-07-08', hasImage: true, imageUrl: 'https://via.placeholder.com/100x20/DC2626/FFFFFF?text=%E5%A3%BD%E5%8F%B8', imageUrlEn: 'https://via.placeholder.com/100x20/DC2626/FFFFFF?text=Sushi', sortOrder: 41, status: 'active', updateTime: '2026-06-06 18:00:00' },
  { key: '42', id: 1042, word: '早餐', wordEn: 'Breakfast', wordSource: 'hotSearchLib', libMode: 'autoRank', hotSearchRank: 30, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app', 'wechatMini'], region: ['macau'], timeSlot: ['breakfast'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 42, status: 'active', updateTime: '2026-04-25 07:00:00' },
  { key: '43', id: 1043, word: '🍰 蛋糕訂製', wordEn: 'Cake Custom', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'activity', jumpType: 'h5', jumpTarget: 'https://example.com/cake', searchEntry: 'home', brand: 'mFood', terminal: ['app'], region: ['taipa'], timeSlot: ['allDay'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-05', endDate: '2026-07-05', hasImage: false, sortOrder: 43, status: 'active', updateTime: '2026-06-04 10:00:00' },
  { key: '44', id: 1044, word: '越南菜', wordEn: 'Vietnamese', wordSource: 'hotSearchLib', libMode: 'specific', hotSearchRank: null, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'takeaway', brand: 'flashBee', terminal: ['app'], region: ['macau'], timeSlot: ['lunch'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 44, status: 'active', updateTime: '2026-04-22 12:00:00' },
  { key: '45', id: 1045, word: '🍖 烤肉大餐', wordEn: 'BBQ Feast', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'merchant', jumpType: 'merchantPage', jumpTarget: 'shop_90022', searchEntry: 'home', brand: 'mFood', terminal: ['app', 'wechatMini'], region: ['macau'], timeSlot: ['dinner'], displayMode: 'image', displayTimeRange: null, startDate: '2026-06-12', endDate: '2026-07-12', hasImage: true, imageUrl: 'https://via.placeholder.com/100x20/7C3AED/FFFFFF?text=%E7%83%A4%E8%82%89', imageUrlEn: 'https://via.placeholder.com/100x20/7C3AED/FFFFFF?text=BBQ', sortOrder: 45, status: 'active', updateTime: '2026-06-07 19:30:00' },
  { key: '46', id: 1046, word: '川菜', wordEn: 'Sichuan Food', wordSource: 'hotSearchLib', libMode: 'autoRank', hotSearchRank: 16, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app'], region: ['macau', 'taipa'], timeSlot: ['dinner'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 46, status: 'active', updateTime: '2026-04-20 18:00:00' },
  { key: '47', id: 1047, word: '🥪 三文治', wordEn: 'Sandwich', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'activity', jumpType: 'appPage', jumpTarget: 'checkInCenter', searchEntry: 'takeaway', brand: 'mFood', terminal: ['app'], region: ['macau'], timeSlot: ['lunch'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-08', endDate: '2026-07-08', hasImage: false, sortOrder: 47, status: 'active', updateTime: '2026-06-05 12:15:00' },
  { key: '48', id: 1048, word: '粵菜', wordEn: 'Cantonese', wordSource: 'hotSearchLib', libMode: 'specific', hotSearchRank: null, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app'], region: ['macau'], timeSlot: ['dinner'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 48, status: 'active', updateTime: '2026-04-18 19:00:00' },
  { key: '49', id: 1049, word: '🍹 果汁鮮榨', wordEn: 'Fresh Juice', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'merchant', jumpType: 'h5', jumpTarget: 'https://example.com/juice', searchEntry: 'home', brand: 'mFood', terminal: ['app'], region: ['taipa'], timeSlot: ['afternoonTea'], displayMode: 'image', displayTimeRange: null, startDate: '2026-06-15', endDate: '2026-07-15', hasImage: true, imageUrl: 'https://via.placeholder.com/100x20/059669/FFFFFF?text=%E6%9E%9C%E6%B1%81', imageUrlEn: 'https://via.placeholder.com/100x20/059669/FFFFFF?text=Juice', sortOrder: 49, status: 'active', updateTime: '2026-06-03 15:00:00' },
  { key: '50', id: 1050, word: '湘菜', wordEn: 'Hunan Food', wordSource: 'hotSearchLib', libMode: 'autoRank', hotSearchRank: 28, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'takeaway', brand: 'flashBee', terminal: ['app', 'wechatMini'], region: ['macau'], timeSlot: ['lunch', 'dinner'], displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, sortOrder: 50, status: 'active', updateTime: '2026-04-15 13:30:00' },
]

/* ======================== 组件 ======================== */

export default function HotSearchConfig() {
  const navigate = useNavigate()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<HotSearchRecord | null>(null)
  const [detailRecord, setDetailRecord] = useState<HotSearchRecord | null>(null)
  const [form] = Form.useForm()
  const [wordSource, setWordSource] = useState<string>('custom')
  const [libMode, setLibMode] = useState<string>('specific')
  const [promotionType, setPromotionType] = useState<string>('merchant')
  const [jumpType, setJumpType] = useState<string>('none')
  const [displayMode, setDisplayMode] = useState<string>('text')
  const [autoRankBusiness, setAutoRankBusiness] = useState<string[]>([])
  const [autoRankDays, setAutoRankDays] = useState<number>(30)
  const [autoRankTop, setAutoRankTop] = useState<number>(10)

  // 实时预览 watch
  const watchWord = Form.useWatch('word', form)
  const watchBorderColor = Form.useWatch('borderColor', form)
  const watchBgColor = Form.useWatch('bgColor', form)
  const watchFontColor = Form.useWatch('fontColor', form)

  /** 根据推广类型获取可用跳转选项 */
  const getJumpOptions = useCallback((promoType: string) => {
    if (promoType === 'merchant') {
      return allJumpTypeOptions.filter(o => ['none', 'merchantPage', 'h5'].includes(o.value))
    }
    // activity 和 hotSearch 支持所有跳转
    return allJumpTypeOptions
  }, [])

  /** 是否为自动获取排名模式（隐藏跳转配置） */
  const isAutoRank = wordSource === 'hotSearchLib' && libMode === 'autoRank'

  /** 自动翻译（模拟） */
  const handleAutoTranslate = () => {
    const word = form.getFieldValue('word')
    if (!word) { message.warning('請先輸入熱搜詞'); return }
    
    // 模拟调用翻译API
    message.loading('翻譯中...', 0.5)
    
    setTimeout(() => {
      // 模拟翻译结果
      const mockTranslations: Record<string, string> = {
        '火鍋': 'Hot Pot', '奶茶': 'Milk Tea', '炸雞': 'Fried Chicken',
        '壽司': 'Sushi', '拉麵': 'Ramen', '漢堡': 'Burger',
        '限時火鍋優惠': 'Limited Time Hot Pot Deal',
        '美味漢堡': 'Delicious Burger',
        '下午茶限時折扣': 'Afternoon Tea Limited Discount',
      }
      
      // 清理表情符号
      const cleanWord = word.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim()
      const translated = mockTranslations[cleanWord] || cleanWord.split('').map(() => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('').slice(0, 15)
      
      form.setFieldsValue({ wordEn: translated })
      message.success('翻譯完成')
    }, 500)
  }

  /** 15条上限校验 */
  const checkSlotLimit = (brand: string, searchEntry: string, startDate: string, endDate: string): boolean => {
    const count = mockData.filter(d =>
      d.brand === brand && d.searchEntry === searchEntry &&
      d.startDate <= endDate && d.endDate >= startDate &&
      d.status === 'active'
    ).length
    if (editingRecord) {
      // 编辑模式排除自身
      const selfCount = mockData.filter(d =>
        d.key === editingRecord.key && d.brand === brand && d.searchEntry === searchEntry
      ).length
      return (count - selfCount) >= 15
    }
    return count >= 15
  }

  /* ==================== CRUD ==================== */

  const handleAdd = () => {
    setEditingRecord(null)
    setWordSource('custom')
    setLibMode('specific')
    setPromotionType('merchant')
    setJumpType('none')
    setDisplayMode('text')
    setAutoRankBusiness([])
    setAutoRankDays(30)
    setAutoRankTop(10)
    form.resetFields()
    form.setFieldsValue({
      wordSource: 'custom', libMode: 'specific', promotionType: 'merchant',
      searchEntry: 'home', status: 'active', timeSlot: 'allDay',
      region: ['macau'], terminal: ['app'], jumpType: 'none', displayMode: 'text',
      borderColor: '#E8720C', bgColor: '#FFF7ED', fontColor: '#333333',
      displayTimeRange: null, sortOrder: 1,
    })
    setIsModalOpen(true)
  }

  const handleEdit = (record: HotSearchRecord) => {
    setEditingRecord(record)
    setWordSource(record.wordSource)
    setLibMode(record.libMode || 'specific')
    setPromotionType(record.promotionType)
    setJumpType(record.jumpType || 'none')
    setDisplayMode(record.displayMode || 'text')
    form.setFieldsValue(record)
    setIsModalOpen(true)
  }

  const handleDetail = (record: HotSearchRecord) => {
    setDetailRecord(record)
    setIsDetailModalOpen(true)
  }

  const handleDelete = (record: HotSearchRecord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除熱搜詞「${record.word}」嗎？`,
      okText: '確定', cancelText: '取消',
      onOk: () => message.success('刪除成功'),
    })
  }

  const handleSave = () => {
    form.validateFields().then((values) => {
      // 15条上限校验
      const dateRange = values.dateRange
      if (dateRange && values.brand && values.searchEntry) {
        const start = dateRange[0]?.format?.('YYYY-MM-DD') || ''
        const end = dateRange[1]?.format?.('YYYY-MM-DD') || ''
        if (checkSlotLimit(values.brand, values.searchEntry, start, end)) {
          Modal.warning({
            title: '已達上限',
            content: '該搜索入口在當前生效週期內已有15個熱搜詞，已達上限，無法新增。',
          })
          return
        }
      }
      message.success(editingRecord ? '編輯成功' : '新增成功')
      setIsModalOpen(false)
    })
  }

  /* ==================== 列配置 ==================== */

  const columnMeta = useMemo(() => [
    { key: 'id', title: '配置ID' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'word', title: '熱搜詞' },
    { key: 'wordEn', title: '英文詞' },
    { key: 'wordSource', title: '詞來源' },
    { key: 'promotionType', title: '推廣類型' },
    { key: 'searchEntry', title: '搜索入口' },
    { key: 'region', title: '展示區域' },
    { key: 'timeSlot', title: '時段' },
    { key: 'displayMode', title: '樣式配置' },
    { key: 'dateRange', title: '生效週期' },
    { key: 'sortOrder', title: '排序' },
    { key: 'status', title: '狀態' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('hot-search-config', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<HotSearchRecord> = [
    { title: '配置ID', dataIndex: 'id', key: 'id', width: 90, render: (v: number) => `#${v}` },
    { 
      title: '所屬品牌', 
      dataIndex: 'brand', 
      key: 'brand', 
      width: 100,
      render: (v: string) => (
        <Tag style={{ 
          margin: 0,
          padding: '2px 10px',
          border: v === '閃蜂' || v === 'flashBee' ? '1px solid #fadb14' : '1px solid #fa8c16',
          color: v === '閃蜂' || v === 'flashBee' ? '#d4b106' : '#d46b08',
          background: v === '閃蜂' || v === 'flashBee' ? '#fffbe6' : '#fff7e6',
          borderRadius: 4,
          fontWeight: 500
        }}>
          {brandMap[v]}
        </Tag>
      ),
    },
    { 
      title: '熱搜詞', 
      dataIndex: 'word', 
      key: 'word', 
      width: 180, 
      render: (v: string, record: HotSearchRecord) => {
        // 图片模式展示 - 轮播文字+表情
        if (record.displayMode === 'image' && record.hasImage) {
          // 根据ID使用不同的渐变色
          const gradientMap: Record<number, string> = {
            1003: 'linear-gradient(135deg, #DC2626 0%, #E8720C 100%)', // 红色-橙色
            1005: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)', // 紫色
            1007: 'linear-gradient(135deg, #059669 0%, #10B981 100%)', // 绿色
            1009: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)', // 橙黄色
          }
          const bgGradient = gradientMap[record.id] || 'linear-gradient(135deg, #DC2626 0%, #E8720C 100%)'
          
          return (
            <div 
              style={{
                width: 100,
                height: 20,
                borderRadius: 10,
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 2px 6px rgba(232, 114, 12, 0.25)',
                background: bgGradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 8px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  animation: 'marquee 6s linear infinite',
                  whiteSpace: 'nowrap',
                  color: '#FFFFFF',
                  fontSize: 10,
                  fontWeight: 500,
                }}
              >
                <span style={{ fontSize: 11 }}>🔥</span>
                <span>{v.replace(/[🔥⭐🎉🎊💥🆕👑🎁💰🏷️🍜🍕🍔🧋🍰☕]/gu, '').trim()}</span>
                <span style={{ fontSize: 11 }}>⭐</span>
                <span>{v.replace(/[🔥⭐🎉🎊💥🆕👑🎁💰🏷️🍜🍕🍔🧋🍰☕]/gu, '').trim()}</span>
              </div>
            </div>
          )
        }
        // 文字模式展示
        return v
      }
    },
    { 
      title: '英文詞', 
      dataIndex: 'wordEn', 
      key: 'wordEn', 
      width: 180, 
      render: (v: string, record: HotSearchRecord) => {
        // 图片模式展示 - 轮播文字+表情
        if (record.displayMode === 'image' && record.hasImage) {
          // 根据ID使用不同的渐变色
          const gradientMap: Record<number, string> = {
            1003: 'linear-gradient(135deg, #DC2626 0%, #E8720C 100%)', // 红色-橙色
            1005: 'linear-gradient(135deg, #7C3AED 0%, #A855F7 100%)', // 紫色
            1007: 'linear-gradient(135deg, #059669 0%, #10B981 100%)', // 绿色
            1009: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)', // 橙黄色
          }
          const bgGradient = gradientMap[record.id] || 'linear-gradient(135deg, #DC2626 0%, #E8720C 100%)'
          
          return (
            <div 
              style={{
                width: 100,
                height: 20,
                borderRadius: 10,
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 2px 6px rgba(232, 114, 12, 0.25)',
                background: bgGradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 8px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  animation: 'marquee 6s linear infinite',
                  whiteSpace: 'nowrap',
                  color: '#FFFFFF',
                  fontSize: 9,
                  fontWeight: 500,
                }}
              >
                <span style={{ fontSize: 10 }}>🎉</span>
                <span>{v || 'Deal'}</span>
                <span style={{ fontSize: 10 }}>🎊</span>
                <span>{v || 'Deal'}</span>
              </div>
            </div>
          )
        }
        // 文字模式展示
        return v || '-'
      }
    },
    { title: '詞來源', dataIndex: 'wordSource', key: 'wordSource', width: 90,
      render: (v: string, r: HotSearchRecord) => (
        <Tag color={v === 'hotSearchLib' ? 'orange' : 'blue'}>
          {wordSourceMap[v]}{v === 'hotSearchLib' && r.libMode === 'autoRank' ? `(前${r.hotSearchRank})` : ''}
        </Tag>
      ),
    },
    { title: '推廣類型', dataIndex: 'promotionType', key: 'promotionType', width: 90, render: (v: string) => <Tag color={v === 'merchant' ? 'blue' : v === 'activity' ? 'orange' : 'green'}>{promotionTypeMap[v]}</Tag> },
    { title: '搜索入口', dataIndex: 'searchEntry', key: 'searchEntry', width: 90, render: (v: string) => searchEntryMap[v] },
    { title: '展示區域', dataIndex: 'region', key: 'region', width: 100, render: (v: string[]) => v.map(r => regionMap[r]).join('、') },
    { title: '時段', dataIndex: 'timeSlot', key: 'timeSlot', width: 100, render: (v: string) => timeSlotMap[v] || v },
    { title: '樣式配置', dataIndex: 'displayMode', key: 'displayMode', width: 80, render: (v: string) => <Tag color={v === 'image' ? 'purple' : 'cyan'}>{displayModeMap[v] || '文字'}</Tag> },
    { title: '生效週期', key: 'dateRange', width: 170, render: (_: unknown, r: HotSearchRecord) => `${r.startDate} ~ ${r.endDate}` },
    { 
      title: '排序', 
      dataIndex: 'sortOrder', 
      key: 'sortOrder', 
      width: 70, 
      align: 'center',
      render: (v: number) => (
        <InputNumber 
          min={1} 
          max={999} 
          value={v} 
          size="small" 
          style={{ width: 60 }}
          onChange={(val) => {
            message.success(`已更新排序為 ${val}`)
          }}
        />
      )
    },
    { title: '狀態', dataIndex: 'status', key: 'status', width: 65, render: (v: string) => v === 'active' ? <Tag color="green">啟用</Tag> : <Tag color="default">停用</Tag> },
    {
      title: '操作', key: 'action', width: 160, fixed: 'right',
      render: (_: unknown, record: HotSearchRecord) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleDetail(record)}>詳情</Button>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>編輯</Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>刪除</Button>
        </Space>
      ),
    },
  ]

  /* ==================== 预览颜色处理 ==================== */
  const previewBorderColor = typeof watchBorderColor === 'string' ? watchBorderColor : watchBorderColor?.toHexString?.() || '#E8720C'
  const previewBgColor = typeof watchBgColor === 'string' ? watchBgColor : watchBgColor?.toHexString?.() || '#FFF7ED'
  const previewFontColor = typeof watchFontColor === 'string' ? watchFontColor : watchFontColor?.toHexString?.() || '#333333'
  const previewWord = watchWord || '熱搜詞預覽'

  /* ==================== 渲染 ==================== */

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="熱搜詞">
            <Input placeholder="請輸入熱搜詞" allowClear style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="詞來源">
            <Select placeholder="請選擇" allowClear options={wordSourceOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="推廣類型">
            <Select placeholder="請選擇" allowClear options={promotionTypeOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="搜索入口">
            <Select placeholder="請選擇" allowClear options={searchEntryOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select placeholder="請選擇" allowClear options={brandOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="展示區域">
            <Select placeholder="請選擇" allowClear options={regionOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="狀態">
            <Select placeholder="請選擇" allowClear options={[{ label: '啟用', value: 'active' }, { label: '停用', value: 'inactive' }]} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>查詢</Button>
              <Button icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增熱搜詞</Button>
          <Button icon={<EyeOutlined />} onClick={() => navigate('/hot-search-preview')}>效果預覽</Button>
        </Space>
        {configComponent}
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<HotSearchRecord>
          columns={applyConfig(columns)}
          dataSource={mockData}
          rowSelection={{}}
          pagination={{
            total: mockData.length,
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            defaultPageSize: 10,
            showQuickJumper: true,
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1800 }}
        />
      </div>

      {/* ==================== 新增/编辑弹窗 ==================== */}
      <Modal
        title={editingRecord ? '編輯熱搜詞' : '新增熱搜詞'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={760}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>

          {/* ===== 行1：搜索入口 + 所属品牌 + 展示终端（置顶） ===== */}
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label="搜索入口" name="searchEntry" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={searchEntryOptions} disabled={!!editingRecord} onChange={(v) => {
                // 非大首页时，自动同步业务频道
                if (v !== 'home' && wordSource === 'hotSearchLib' && libMode === 'autoRank') {
                  setAutoRankBusiness([v])
                }
              }} />
            </Form.Item>
            <Form.Item label="所屬品牌" name="brand" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={brandOptions.filter(o => o.value !== 'all')} disabled={!!editingRecord} />
            </Form.Item>
            <Form.Item label="展示終端" name="terminal" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select mode="multiple" options={terminalOptions} placeholder="請選擇" disabled={!!editingRecord} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label="展示模式" name="displayMode" style={{ flex: 1 }}>
              <Radio.Group options={displayModeOptions} optionType="button" buttonStyle="solid"
                disabled={!!editingRecord}
                onChange={(e) => setDisplayMode(e.target.value)} />
            </Form.Item>
            <Form.Item label="詞來源" name="wordSource" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={wordSourceOptions} disabled={!!editingRecord} onChange={(v) => {
                setWordSource(v)
                if (v === 'custom') {
                  setLibMode('specific'); form.setFieldsValue({ libMode: 'specific' })
                }
                if (v === 'hotSearchLib' && libMode === 'autoRank') {
                  setPromotionType('hotSearch'); form.setFieldsValue({ promotionType: 'hotSearch' })
                }
              }} />
            </Form.Item>
            <Form.Item label="推廣類型" name="promotionType" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select
                options={isAutoRank
                  ? promotionTypeOptions.filter(o => o.value === 'hotSearch')
                  : promotionTypeOptions
                }
                disabled={!!editingRecord}
                onChange={(v) => {
                  setPromotionType(v)
                  if (v === 'merchant' && jumpType === 'appPage') {
                    setJumpType('none'); form.setFieldsValue({ jumpType: 'none' })
                  }
                }}
              />
            </Form.Item>
          </div>

          {wordSource === 'hotSearchLib' && (
            <Form.Item label="詞庫模式" name="libMode" rules={[{ required: true }]}>
              <Select options={libModeOptions} disabled={!!editingRecord} onChange={(v) => {
                setLibMode(v)
                if (v === 'autoRank') {
                  setJumpType('none'); form.setFieldsValue({ jumpType: 'none' })
                  setPromotionType('hotSearch'); form.setFieldsValue({ promotionType: 'hotSearch' })
                }
              }} />
            </Form.Item>
          )}

          {/* ===== 热搜词输入（根据词来源和模式动态展示） ===== */}
          {wordSource === 'custom' && displayMode === 'text' && (
            <>
              <Form.Item label="熱搜詞" name="word" rules={[{ required: true, message: '請輸入熱搜詞' }]}>
                <Input 
                  placeholder="請輸入熱搜詞" 
                  maxLength={15} 
                  showCount 
                  suffix={
                    <Popover
                      content={
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', maxWidth: 280 }}>
                          {emojiOptions.map(emoji => (
                            <span
                              key={emoji}
                              style={{ fontSize: 22, cursor: 'pointer', padding: '4px 6px', borderRadius: 4, border: '1px solid #F0F0F0' }}
                              onClick={() => {
                                const current = form.getFieldValue('word') || ''
                                form.setFieldsValue({ word: current + emoji })
                              }}
                            >
                              {emoji}
                            </span>
                          ))}
                        </div>
                      }
                      trigger="click"
                      placement="bottomRight"
                    >
                      <SmileOutlined style={{ cursor: 'pointer', color: '#1677FF' }} />
                    </Popover>
                  }
                />
              </Form.Item>
            </>
          )}

          {/* 图片模式不显示热搜词输入框 */}
          {wordSource === 'custom' && displayMode === 'image' && (
            <Form.Item label="圖片上傳" name="imageUrl" rules={[{ required: true, message: '請上傳圖片' }]}>
              <Upload listType="picture-card" maxCount={1}>
                <div>
                  <UploadOutlined />
                  <div style={{ marginTop: 8 }}>上傳圖片</div>
                </div>
              </Upload>
            </Form.Item>
          )}

          {wordSource === 'hotSearchLib' && libMode === 'specific' && (
            <Form.Item label="選擇熱搜詞" name="word" rules={[{ required: true, message: '請從詞庫選擇' }]}>
              <Select
                showSearch
                placeholder="搜索並選擇熱搜詞"
                options={mockLibWords.map(w => ({ label: w, value: w }))}
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
              />
            </Form.Item>
          )}

          {/* ===== 自动获取排名（输入框模式） ===== */}
          {wordSource === 'hotSearchLib' && libMode === 'autoRank' && (
            <div style={{ background: '#FFF7ED', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <Form.Item label="業務頻道" name="autoRankBusiness" rules={[{ required: true, message: '請選擇業務頻道' }]}>
                <Select
                  mode={form.getFieldValue('searchEntry') === 'home' ? 'multiple' : undefined}
                  options={searchEntryOptions}
                  placeholder="請選擇業務頻道"
                  value={autoRankBusiness}
                  onChange={(v) => {
                    const val = Array.isArray(v) ? v : [v]
                    setAutoRankBusiness(val)
                  }}
                  disabled={form.getFieldValue('searchEntry') !== 'home'}
                />
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  {form.getFieldValue('searchEntry') === 'home'
                    ? '大首頁模式支持多選業務頻道'
                    : '跟隨搜索入口所選業務頻道，不可修改'
                  }
                </div>
              </Form.Item>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, color: '#333' }}>自動獲取近</span>
                <InputNumber
                  min={1} max={90} value={autoRankDays}
                  onChange={(v) => setAutoRankDays(v || 30)}
                  style={{ width: 70 }}
                  size="small"
                />
                <span style={{ fontSize: 14, color: '#333' }}>天的熱搜詞排名，只取排名前</span>
                <InputNumber
                  min={1} max={50} value={autoRankTop}
                  onChange={(v) => setAutoRankTop(v || 10)}
                  style={{ width: 70 }}
                  size="small"
                />
                <span style={{ fontSize: 14, color: '#333' }}>的詞</span>
              </div>
              <div style={{ fontSize: 12, color: '#E8720C', marginTop: 8 }}>
                ⚠️ 自動獲取排名模式下，熱搜詞為實時動態更新，無法配置跳轉鏈接，推廣類型僅支持「熱搜推廣」
              </div>
            </div>
          )}

          {/* ===== 英文字段（非自动排名 + 文字模式） ===== */}
          {displayMode === 'text' && !isAutoRank && (
            <Form.Item label="英文熱搜詞" name="wordEn">
              <div style={{ display: 'flex', gap: 8 }}>
                <Input placeholder="請輸入英文熱搜詞" style={{ flex: 1 }} />
                <Button type="primary" icon={<TranslationOutlined />} onClick={handleAutoTranslate}>自動翻譯</Button>
              </div>
            </Form.Item>
          )}
          {displayMode === 'text' && isAutoRank && (
            <Form.Item label="英文熱搜詞" name="wordEn">
              <Input placeholder="將自動翻譯實時更新的熱搜詞" disabled suffix={<span style={{ color: '#999', fontSize: 12 }}>自動翻譯</span>} />
            </Form.Item>
          )}

          {/* ===== 图片上传（图片模式） ===== */}
          {displayMode === 'image' && (
            <>
              <Form.Item label="熱搜詞圖片（中文）" name="image">
                <Upload
                  listType="picture-card"
                  maxCount={1}
                  accept=".jpeg,.jpg,.png,.gif,.webp"
                  beforeUpload={(file) => {
                    if (file.size > 10 * 1024 * 1024) { message.error('圖片大小不能超過10MB'); return false }
                    return false
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <UploadOutlined />
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>300×100</div>
                  </div>
                </Upload>
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  圖片尺寸：寬度300 × 高度100，支持jpeg/jpg/png/gif/webp格式，10MB以內
                </div>
              </Form.Item>
              <Form.Item label="熱搜詞圖片（英文，非必傳）" name="imageEn">
                <Upload
                  listType="picture-card"
                  maxCount={1}
                  accept=".jpeg,.jpg,.png,.gif,.webp"
                  beforeUpload={(file) => {
                    if (file.size > 10 * 1024 * 1024) { message.error('圖片大小不能超過10MB'); return false }
                    return false
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <UploadOutlined />
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>EN 300×100</div>
                  </div>
                </Upload>
              </Form.Item>
            </>
          )}

          {/* ===== 跳转配置（自动获取排名时隐藏） ===== */}
          {isAutoRank ? null : (
            <div style={{ background: '#FAFAFA', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h4 style={{ marginBottom: 12, fontSize: 14 }}>跳轉配置</h4>
              <div style={{ display: 'flex', gap: 16 }}>
                <Form.Item label="跳轉類型" name="jumpType" style={{ flex: 1 }}>
                  <Select options={getJumpOptions(promotionType)} onChange={(v) => setJumpType(v)} />
                </Form.Item>
                {jumpType === 'merchantPage' && (
                  <Form.Item label="商家ID" name="jumpTarget" rules={[{ required: true, message: '請輸入商家ID' }]} style={{ flex: 1 }}>
                    <Input placeholder="請輸入商家ID或搜索商家" />
                  </Form.Item>
                )}
                {jumpType === 'h5' && (
                  <Form.Item label="H5鏈接" name="jumpTarget" rules={[{ required: true, message: '請輸入H5鏈接' }]} style={{ flex: 1 }}>
                    <Input placeholder="請輸入H5鏈接地址" />
                  </Form.Item>
                )}
                {jumpType === 'appPage' && (
                  <Form.Item label="APP頁面" name="jumpTarget" rules={[{ required: true, message: '請選擇APP頁面' }]} style={{ flex: 1 }}>
                    <Select options={appPageOptions} placeholder="請選擇APP頁面" />
                  </Form.Item>
                )}
              </div>
            </div>
          )}

          {/* ===== 展示区域 ===== */}
          <Form.Item label="展示區域" name="region" rules={[{ required: true }]}>
            <Select mode="multiple" options={regionOptions.filter(o => o.value !== 'all')} />
          </Form.Item>

          {/* ===== 展示时段（单选下拉） ===== */}
          <Form.Item label="展示時段" name="timeSlot" rules={[{ required: true, message: '請選擇展示時段' }]}>
            <Select options={timeSlotOptions} placeholder="請選擇展示時段" />
          </Form.Item>

          {/* ===== 生效日期 + 状态 + 排序 ===== */}
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label="生效日期" name="dateRange" rules={[{ required: true, message: '請選擇生效日期' }]} style={{ flex: 2 }}>
              <RangePicker format="YYYY-MM-DD" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="狀態" name="status" style={{ flex: 1 }}>
              <Select options={[{ label: '啟用', value: 'active' }, { label: '停用', value: 'inactive' }]} />
            </Form.Item>
            <Form.Item label="排序" name="sortOrder" style={{ flex: 1 }}>
              <InputNumber min={1} max={999} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          {/* ===== 样式配置 + 预览（仅 词来源=自定义词 + 文字模式） ===== */}
          {wordSource === 'custom' && displayMode === 'text' && (
            <div style={{ background: '#FAFAFA', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h4 style={{ marginBottom: 12, fontSize: 14 }}>樣式配置</h4>
              <div style={{ display: 'flex', gap: 16 }}>
                <Form.Item label="邊框顏色" name="borderColor">
                  <ColorPicker />
                </Form.Item>
                <Form.Item label="背景顏色" name="bgColor">
                  <ColorPicker />
                </Form.Item>
                <Form.Item label="字體顏色" name="fontColor">
                  <ColorPicker />
                </Form.Item>
              </div>
              {/* 实时预览 - 单场景 */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>📱 展示預覽</div>
                <div style={{ background: '#FFF', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '6px 14px', borderRadius: 16,
                      border: `2px solid ${previewBorderColor}`,
                      background: previewBgColor, color: previewFontColor, fontSize: 14,
                    }}>
                      <FireOutlined style={{ color: previewBorderColor }} /> {previewWord}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Form>
      </Modal>

      {/* ==================== 详情弹窗 ==================== */}
      <Modal
        title="熱搜詞詳情"
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsDetailModalOpen(false)}>關閉</Button>,
        ]}
        width={760}
      >
        {detailRecord && (
          <div style={{ marginTop: 16 }}>
            {/* 基本信息 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>📋 基本信息</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>配置ID</div>
                  <div style={{ fontWeight: 'bold' }}>{detailRecord.id}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>搜索入口</div>
                  <div>{searchEntryOptions.find(o => o.value === detailRecord.searchEntry)?.label || '-'}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>所属品牌</div>
                  <div>{brandOptions.find(o => o.value === detailRecord.brand)?.label || '-'}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>展示终端</div>
                  <div>
                    {detailRecord.terminal.map(t => (
                      <Tag key={t} style={{ marginRight: 4 }}>{terminalOptions.find(o => o.value === t)?.label || t}</Tag>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>展示模式</div>
                  <div>{displayModeOptions.find(o => o.value === detailRecord.displayMode)?.label || '-'}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>词来源</div>
                  <div>{wordSourceOptions.find(o => o.value === detailRecord.wordSource)?.label || '-'}</div>
                </div>
              </div>
            </div>

            {/* 热搜词信息 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>🔍 熱搜詞信息</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>热搜词（中文）</div>
                  <div style={{ fontWeight: 'bold', fontSize: 14 }}>{detailRecord.word}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>热搜词（英文）</div>
                  <div>{detailRecord.wordEn || '-'}</div>
                </div>
                {detailRecord.wordSource === 'hotSearchLib' && detailRecord.libMode === 'autoRank' && (
                  <div>
                    <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>热搜词库排名</div>
                    <div>Top {detailRecord.hotSearchRank || '-'}</div>
                  </div>
                )}
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>词库模式</div>
                  <div>{libModeOptions.find(o => o.value === detailRecord.libMode)?.label || '-'}</div>
                </div>
              </div>
            </div>

            {/* 推广配置 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>📢 推广配置</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>推广类型</div>
                  <div>{promotionTypeOptions.find(o => o.value === detailRecord.promotionType)?.label || '-'}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>跳转类型</div>
                  <div>{allJumpTypeOptions.find(o => o.value === detailRecord.jumpType)?.label || '-'}</div>
                </div>
                {detailRecord.jumpType && detailRecord.jumpType !== 'none' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>跳转目标</div>
                    <div style={{ wordBreak: 'break-all', color: '#1677FF' }}>{detailRecord.jumpTarget}</div>
                  </div>
                )}
              </div>
            </div>

            {/* 定向设置 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>🎯 定向设置</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>展示区域</div>
                  <div>
                    {detailRecord.region.map(r => (
                      <Tag key={r} style={{ marginRight: 4 }}>{regionOptions.find(o => o.value === r)?.label || r}</Tag>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>时段设置</div>
                  <div>
                    {detailRecord.timeSlot.map(t => (
                      <Tag key={t} style={{ marginRight: 4 }}>{timeSlotOptions.find(o => o.value === t)?.label || t}</Tag>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 生效时间 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>📅 生效时间</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>生效日期</div>
                  <div>{detailRecord.startDate} ~ {detailRecord.endDate}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>显示时间范围</div>
                  <div>
                    {detailRecord.displayTimeRange && detailRecord.displayTimeRange.length === 2
                      ? `${detailRecord.displayTimeRange[0]} - ${detailRecord.displayTimeRange[1]}`
                      : '全天'}
                  </div>
                </div>
              </div>
            </div>

            {/* 其他信息 */}
            <div>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>ℹ️ 其他信息</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>排序</div>
                  <div>{detailRecord.sortOrder}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>状态</div>
                  <div>{detailRecord.status === 'active' ? <Tag color="green">啟用</Tag> : <Tag color="default">停用</Tag>}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>最后更新</div>
                  <div>{detailRecord.updateTime}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
