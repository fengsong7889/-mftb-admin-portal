import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Space, Input, InputNumber, Select, Table, Tag, Modal, Form, DatePicker,
  ColorPicker, Upload, message, Popover, Radio,
} from 'antd'
import type { TableColumnsType, RadioChangeEvent } from 'antd'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined, UploadOutlined,
  EyeOutlined, TranslationOutlined, FireOutlined,
  SmileOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import { fetchAdAlgorithms } from '../../api/adPromotion'
import { fetchStores } from '../../api/store'

const { RangePicker } = DatePicker

/* ======================== 常量定义 ======================== */

/** 常用表情 */
const emojiOptions = ['🔥', '⭐', '🎉', '🎊', '💥', '🆕', '👑', '🎁', '💰', '🏷️', '🍜', '🍕', '🍔', '🧋', '🍰', '☕']

/** 模擬詞庫數據 */
const mockLibWords = ['火鍋', '珍珠奶茶', '酸菜魚', '炸雞', '壽司', '拉麵', '麻辣燙', '烤鴨', '漢堡', '披薩', '咖喱飯', '三文魚']

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
  const { t } = useTranslation()
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

  // 搜索区域：品牌 → 算法 → 门店 级联状态
  const [searchBrand, setSearchBrand] = useState<string | null>(null)
  const [searchAlgorithm, setSearchAlgorithm] = useState<string | null>(null)
  const [searchStore, setSearchStore] = useState<string | null>(null)
  const [algorithmOptions, setAlgorithmOptions] = useState<Array<{ label: string; value: string }>>([])
  const [storeOptions, setStoreOptions] = useState<Array<{ label: string; value: string }>>([])

  // 品牌变更 → 重新加载算法列表，清空算法和门店
  const handleSearchBrandChange = (value: string | undefined) => {
    setSearchBrand(value ?? null)
    setSearchAlgorithm(null)
    setSearchStore(null)
    setAlgorithmOptions([])
    setStoreOptions([])
  }

  // 算法变更 → 重新加载门店列表，清空门店
  const handleSearchAlgorithmChange = (value: string | null) => {
    setSearchAlgorithm(value)
    setSearchStore(null)
    setStoreOptions([])
    if (searchBrand && value) {
      fetchStores({ brand: searchBrand, size: 200 }).then(res => {
        const records = res.records || []
        setStoreOptions(
          records.map(s => ({ label: `${s.storeName}（${s.storeCode}）`, value: s.storeCode }))
        )
      }).catch(() => {})
    }
  }

  // 品牌变更时自动加载算法列表（按品牌过滤）
  useEffect(() => {
    if (!searchBrand) {
      setAlgorithmOptions([])
      return
    }
    fetchAdAlgorithms({ page: 1, size: 200, brand: searchBrand, status: 1 })
      .then(res => {
        if (!res) return
        const records = res.records.filter(a => a.updatedBy !== '系統')
        setAlgorithmOptions(
          records.map(a => ({ label: a.algoName, value: String(a.id) }))
        )
      }).catch(() => {})
  }, [searchBrand])

  /** 搜索入口（合并原 searchPage + searchChannel） */
  const searchEntryOptions = [
    { label: t('dict.channel.home'), value: 'home' },
    { label: t('dict.channel.takeawaySearch'), value: 'takeaway' },
    { label: t('dict.channel.supermarketSearch'), value: 'supermarket' },
    { label: t('dict.channel.groupBuySearch'), value: 'groupBuy' },
  ]

  /** 展示終端 */
  const terminalOptions = [
    { label: t('dict.terminal.app'), value: 'app' },
    { label: t('dict.terminal.wechatMini'), value: 'wechatMini' },
  ]

  /** 展示區域 */
  const regionOptions = [
    { label: t('common.all'), value: 'all' },
    { label: t('dict.region.macau'), value: 'macau' },
    { label: t('dict.region.taipa'), value: 'taipa' },
    { label: t('dict.region.zhuhai'), value: 'zhuhai' },
  ]

  /** 時段 */
  const timeSlotOptions = [
    { label: t('dict.timeSlot.allDay'), value: 'allDay' },
    { label: t('dict.timeSlot.breakfast'), value: 'breakfast' },
    { label: t('dict.timeSlot.lunch'), value: 'lunch' },
    { label: t('dict.timeSlot.afternoonTea'), value: 'afternoonTea' },
    { label: t('dict.timeSlot.dinner'), value: 'dinner' },
    { label: t('dict.timeSlot.midnightSnack'), value: 'midnightSnack' },
  ]

  /** 熱搜詞來源 */
  const wordSourceOptions = [
    { label: t('dict.wordSource.custom'), value: 'custom' },
    { label: t('dict.wordSource.hotSearchLib'), value: 'hotSearchLib' },
  ]

  /** 詞庫二級模式 */
  const libModeOptions = [
    { label: t('dict.libMode.specific'), value: 'specific' },
    { label: t('dict.libMode.autoRank'), value: 'autoRank' },
  ]

  /** 推廣類型 */
  const promotionTypeOptions = [
    { label: t('dict.promotionType.merchant'), value: 'merchant' },
    { label: t('dict.promotionType.activity'), value: 'activity' },
    { label: t('dict.promotionType.hotSearch'), value: 'hotSearch' },
  ]

  /** 跳轉類型（按推廣類型動態過濾） */
  const allJumpTypeOptions = [
    { label: t('dict.jumpType.none'), value: 'none' },
    { label: t('dict.jumpType.merchantPage'), value: 'merchantPage' },
    { label: t('dict.jumpType.h5'), value: 'h5' },
    { label: t('dict.jumpType.appPage'), value: 'appPage' },
  ]

  /** APP頁面 */
  const appPageOptions = [
    { label: t('dict.jumpType.personalCenter'), value: 'personalCenter' },
    { label: t('dict.jumpType.checkInCenter'), value: 'checkInCenter' },
    { label: t('dict.jumpType.claimCenter'), value: 'claimCenter' },
    { label: t('dict.jumpType.orderPage'), value: 'orderPage' },
  ]

  /** 展示模式 */
  const displayModeOptions = [
    { label: t('dict.displayMode.text'), value: 'text' },
    { label: t('dict.displayMode.image'), value: 'image' },
  ]

  /** 展示映射 */
  const searchEntryMap: Record<string, string> = {
    home: t('dict.channel.home'), takeaway: t('dict.channel.takeawaySearch'),
    supermarket: t('dict.channel.supermarketSearch'), groupBuy: t('dict.channel.groupBuySearch'),
  }
  const regionMap: Record<string, string> = { macau: t('dict.region.macau'), taipa: t('dict.region.taipa'), zhuhai: t('dict.region.zhuhai') }
  const timeSlotMap: Record<string, string> = {
    allDay: t('dict.timeSlot.allDay'), breakfast: t('dict.timeSlot.breakfast'), lunch: t('dict.timeSlot.lunch'),
    afternoonTea: t('dict.timeSlot.afternoonTea'), dinner: t('dict.timeSlot.dinner'), midnightSnack: t('dict.timeSlot.midnightSnack'),
  }
  const wordSourceMap: Record<string, string> = { custom: t('dict.wordSource.custom'), hotSearchLib: t('dict.wordSource.hotSearchLib') }
  const promotionTypeMap: Record<string, string> = {
    merchant: t('dict.promotionType.merchant'), activity: t('dict.promotionType.activity'), hotSearch: t('dict.promotionType.hotSearch'),
  }
  const displayModeMap: Record<string, string> = { text: t('dict.displayMode.textShort'), image: t('dict.displayMode.imageShort') }

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
  }, [allJumpTypeOptions])

  /** 是否为自动获取排名模式（隐藏跳转配置） */
  const isAutoRank = wordSource === 'hotSearchLib' && libMode === 'autoRank'

  /** 自动翻译（模拟） */
  const handleAutoTranslate = () => {
    const word = form.getFieldValue('word')
    if (!word) { message.warning(t('hotSearchConfig.translateWarning')); return }
    
    // 模拟调用翻译API
    message.loading(t('hotSearchConfig.translating'), 0.5)
    
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
      message.success(t('hotSearchConfig.translateDone'))
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
      title: t('hotSearchConfig.deleteTitle'),
      content: t('hotSearchConfig.deleteContent', { word: record.word }),
      okText: t('common.confirm'), cancelText: t('common.cancel'),
      onOk: () => message.success(t('common.deleteSuccess')),
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
            title: t('hotSearchConfig.limitTitle'),
            content: t('hotSearchConfig.limitContent'),
          })
          return
        }
      }
      message.success(editingRecord ? t('common.updateSuccess') : t('common.addSuccess'))
      setIsModalOpen(false)
    })
  }

  /* ==================== 列配置 ==================== */

  const columnMeta = useMemo(() => [
    { key: 'id', title: t('hotSearchConfig.colId') },
    { key: 'brand', title: t('hotSearchConfig.colBrand') },
    { key: 'word', title: t('hotSearchConfig.colWord') },
    { key: 'wordEn', title: t('hotSearchConfig.colWordEn') },
    { key: 'wordSource', title: t('hotSearchConfig.colWordSource') },
    { key: 'promotionType', title: t('hotSearchConfig.colPromotionType') },
    { key: 'searchEntry', title: t('hotSearchConfig.colSearchEntry') },
    { key: 'region', title: t('hotSearchConfig.colRegion') },
    { key: 'timeSlot', title: t('hotSearchConfig.colTimeSlot') },
    { key: 'displayMode', title: t('hotSearchConfig.colDisplayMode') },
    { key: 'dateRange', title: t('hotSearchConfig.colDateRange') },
    { key: 'sortOrder', title: t('hotSearchConfig.colSortOrder') },
    { key: 'status', title: t('hotSearchConfig.colStatus') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('hot-search-config', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<HotSearchRecord> = [
    { title: t('hotSearchConfig.colId'), dataIndex: 'id', key: 'id', width: 90, render: (v: number) => `#${v}` },
    { 
      title: t('hotSearchConfig.colBrand'), 
      dataIndex: 'brand', 
      key: 'brand', 
      width: 100,
      render: (v: string) => (
        <BrandTag value={v} />
      ),
    },
    { 
      title: t('hotSearchConfig.colWord'), 
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
                <span>{v.replace(/\p{Extended_Pictographic}/gu, '').trim()}</span>
                <span style={{ fontSize: 11 }}>⭐</span>
                <span>{v.replace(/\p{Extended_Pictographic}/gu, '').trim()}</span>
              </div>
            </div>
          )
        }
        // 文字模式展示
        return v
      }
    },
    { 
      title: t('hotSearchConfig.colWordEn'), 
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
    { title: t('hotSearchConfig.colWordSource'), dataIndex: 'wordSource', key: 'wordSource', width: 90,
      render: (v: string, r: HotSearchRecord) => (
        <Tag color={v === 'hotSearchLib' ? 'orange' : 'blue'}>
          {wordSourceMap[v]}{v === 'hotSearchLib' && r.libMode === 'autoRank' ? t('hotSearchConfig.rankPrefix', { rank: r.hotSearchRank }) : ''}
        </Tag>
      ),
    },
    { title: t('hotSearchConfig.colPromotionType'), dataIndex: 'promotionType', key: 'promotionType', width: 90, render: (v: string) => <Tag color={v === 'merchant' ? 'blue' : v === 'activity' ? 'orange' : 'green'}>{promotionTypeMap[v]}</Tag> },
    { title: t('hotSearchConfig.colSearchEntry'), dataIndex: 'searchEntry', key: 'searchEntry', width: 90, render: (v: string) => searchEntryMap[v] },
    { title: t('hotSearchConfig.colRegion'), dataIndex: 'region', key: 'region', width: 100, render: (v: string[]) => v.map(r => regionMap[r]).join('、') },
    { title: t('hotSearchConfig.colTimeSlot'), dataIndex: 'timeSlot', key: 'timeSlot', width: 100, render: (v: string) => timeSlotMap[v] || v },
    { title: t('hotSearchConfig.colDisplayMode'), dataIndex: 'displayMode', key: 'displayMode', width: 80, render: (v: string) => <Tag color={v === 'image' ? 'purple' : 'cyan'}>{displayModeMap[v] || t('dict.displayMode.textShort')}</Tag> },
    { title: t('hotSearchConfig.colDateRange'), key: 'dateRange', width: 210, render: (_: unknown, r: HotSearchRecord) => <span style={{ whiteSpace: 'nowrap' }}>{`${r.startDate} ~ ${r.endDate}`}</span> },
    { 
      title: t('hotSearchConfig.colSortOrder'), 
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
            message.success(t('hotSearchConfig.sortUpdated', { val }))
          }}
        />
      )
    },
    { title: t('hotSearchConfig.colStatus'), dataIndex: 'status', key: 'status', width: 65, render: (v: string) => v === 'active' ? <Tag color="success">{t('dict.status.enable')}</Tag> : <Tag color="default">{t('dict.status.disable')}</Tag> },
    {
      title: t('common.colAction'), key: 'action', width: 160, fixed: 'right',
      render: (_: unknown, record: HotSearchRecord) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleDetail(record)}>{t('common.detail')}</Button>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>{t('common.edit')}</Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ]

  /* ==================== 预览颜色处理 ==================== */
  const previewBorderColor = typeof watchBorderColor === 'string' ? watchBorderColor : watchBorderColor?.toHexString?.() || '#E8720C'
  const previewBgColor = typeof watchBgColor === 'string' ? watchBgColor : watchBgColor?.toHexString?.() || '#FFF7ED'
  const previewFontColor = typeof watchFontColor === 'string' ? watchFontColor : watchFontColor?.toHexString?.() || '#333333'
  const previewWord = watchWord || t('hotSearchConfig.previewWord')

  /* ==================== 渲染 ==================== */

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('hotSearchConfig.searchBrand')}>
            <Select
              placeholder={t('common.all')}
              allowClear
              value={searchBrand}
              onChange={handleSearchBrandChange}
              options={brandOptions}
            />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchAlgorithm')}>
            <Select
              placeholder={searchBrand ? t('adSales.algoSearchPlaceholder') : t('adSales.selectBrandFirst')}
              allowClear
              showSearch
              optionFilterProp="label"
              value={searchAlgorithm}
              onChange={handleSearchAlgorithmChange}
              options={algorithmOptions}
              disabled={!searchBrand}
            />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchStore')}>
            <Select
              placeholder={searchAlgorithm ? t('common.placeholderSelect') : t('algorithm.selectAlgorithmFirst')}
              allowClear
              showSearch
              optionFilterProp="label"
              value={searchStore}
              onChange={v => setSearchStore(v ?? null)}
              options={storeOptions}
              disabled={!searchAlgorithm}
            />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchWord')}>
            <Input placeholder={t('hotSearchConfig.searchWordPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchWordSource')}>
            <Select placeholder={t('common.all')} allowClear options={wordSourceOptions} />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchPromotionType')}>
            <Select placeholder={t('common.all')} allowClear options={promotionTypeOptions} />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchEntry')}>
            <Select placeholder={t('common.all')} allowClear options={searchEntryOptions} />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchRegion')}>
            <Select placeholder={t('common.all')} allowClear options={regionOptions} />
          </Form.Item>
          <Form.Item label={t('hotSearchConfig.searchStatus')}>
            <Select placeholder={t('common.all')} allowClear options={[{ label: t('dict.status.enable'), value: 'active' }, { label: t('dict.status.disable'), value: 'inactive' }]} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={() => {
                setSearchBrand(null); setSearchAlgorithm(null); setSearchStore(null)
                setAlgorithmOptions([]); setStoreOptions([])
              }}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button icon={<EyeOutlined />} onClick={() => navigate('/hot-search-verify')}>{t('common.preview')}</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('hotSearchConfig.addWord')}</Button>
          {configComponent}
        </div>
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
            showTotal: (total) => t('common.total', { count: total }),
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
        title={editingRecord ? t('hotSearchConfig.editTitle') : t('hotSearchConfig.addTitle')}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        width={760}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>

          {/* ===== 行1：搜索入口 + 所属品牌 + 展示终端（置顶） ===== */}
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label={t('hotSearchConfig.searchEntryLabel')} name="searchEntry" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={searchEntryOptions} disabled={!!editingRecord} onChange={(v) => {
                // 非大首页时，自动同步业务频道
                if (v !== 'home' && wordSource === 'hotSearchLib' && libMode === 'autoRank') {
                  setAutoRankBusiness([v])
                }
              }} />
            </Form.Item>
            <Form.Item label={t('hotSearchConfig.brandLabel')} name="brand" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={brandOptions.filter(o => o.value !== 'all')} disabled={!!editingRecord} />
            </Form.Item>
            <Form.Item label={t('hotSearchConfig.terminalLabel')} name="terminal" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select mode="multiple" options={terminalOptions} placeholder={t('hotSearchConfig.terminalPlaceholder')} disabled={!!editingRecord} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label={t('hotSearchConfig.displayModeLabel')} name="displayMode" style={{ flex: 1 }}>
              <Radio.Group options={displayModeOptions} optionType="button" buttonStyle="solid"
                disabled={!!editingRecord}
                onChange={(e: RadioChangeEvent) => setDisplayMode(e.target.value as string)} />
            </Form.Item>
            <Form.Item label={t('hotSearchConfig.wordSourceLabel')} name="wordSource" rules={[{ required: true }]} style={{ flex: 1 }}>
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
            <Form.Item label={t('hotSearchConfig.promotionTypeLabel')} name="promotionType" rules={[{ required: true }]} style={{ flex: 1 }}>
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
            <Form.Item label={t('hotSearchConfig.libModeLabel')} name="libMode" rules={[{ required: true }]}>
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
              <Form.Item label={t('hotSearchConfig.wordLabel')} name="word" rules={[{ required: true, message: t('hotSearchConfig.wordRequired') }]}>
                <Input 
                  placeholder={t('hotSearchConfig.wordPlaceholder')} 
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
            <Form.Item label={t('hotSearchConfig.imageLabel')} name="imageUrl" rules={[{ required: true, message: t('hotSearchConfig.imageRequired') }]}>
              <Upload listType="picture-card" maxCount={1}>
                <div>
                  <UploadOutlined />
                  <div style={{ marginTop: 8 }}>{t('hotSearchConfig.uploadImage')}</div>
                </div>
              </Upload>
            </Form.Item>
          )}

          {wordSource === 'hotSearchLib' && libMode === 'specific' && (
            <Form.Item label={t('hotSearchConfig.selectWordLabel')} name="word" rules={[{ required: true, message: t('hotSearchConfig.selectWordRequired') }]}>
              <Select
                showSearch
                placeholder={t('hotSearchConfig.selectWordPlaceholder')}
                options={mockLibWords.map(w => ({ label: w, value: w }))}
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
              />
            </Form.Item>
          )}

          {/* ===== 自动获取排名（输入框模式） ===== */}
          {wordSource === 'hotSearchLib' && libMode === 'autoRank' && (
            <div style={{ background: '#FFF7ED', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <Form.Item label={t('hotSearchConfig.bizChannelLabel')} name="autoRankBusiness" rules={[{ required: true, message: t('hotSearchConfig.bizChannelRequired') }]}>
                <Select
                  mode={form.getFieldValue('searchEntry') === 'home' ? 'multiple' : undefined}
                  options={searchEntryOptions}
                  placeholder={t('hotSearchConfig.bizChannelPlaceholder')}
                  value={autoRankBusiness}
                  onChange={(v) => {
                    const val = Array.isArray(v) ? v : [v]
                    setAutoRankBusiness(val)
                  }}
                  disabled={form.getFieldValue('searchEntry') !== 'home'}
                />
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  {form.getFieldValue('searchEntry') === 'home'
                    ? t('hotSearchConfig.homeMultiTip')
                    : t('hotSearchConfig.followEntryTip')
                  }
                </div>
              </Form.Item>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, color: '#333' }}>{t('hotSearchConfig.autoDaysPrefix')}</span>
                <InputNumber
                  min={1} max={90} value={autoRankDays}
                  onChange={(v) => setAutoRankDays(v || 30)}
                  style={{ width: 70 }}
                  size="small"
                />
                <span style={{ fontSize: 14, color: '#333' }}>{t('hotSearchConfig.autoDaysSuffix')}</span>
                <InputNumber
                  min={1} max={50} value={autoRankTop}
                  onChange={(v) => setAutoRankTop(v || 10)}
                  style={{ width: 70 }}
                  size="small"
                />
                <span style={{ fontSize: 14, color: '#333' }}>{t('hotSearchConfig.autoTopSuffix')}</span>
              </div>
              <div style={{ fontSize: 12, color: '#E8720C', marginTop: 8 }}>
                {t('hotSearchConfig.autoRankTip')}
              </div>
            </div>
          )}

          {/* ===== 英文字段（非自动排名 + 文字模式） ===== */}
          {displayMode === 'text' && !isAutoRank && (
            <Form.Item label={t('hotSearchConfig.wordEnLabel')} name="wordEn">
              <div style={{ display: 'flex', gap: 8 }}>
                <Input placeholder={t('hotSearchConfig.wordEnPlaceholder')} style={{ flex: 1 }} />
                <Button type="primary" icon={<TranslationOutlined />} onClick={handleAutoTranslate}>{t('hotSearchConfig.autoTranslate')}</Button>
              </div>
            </Form.Item>
          )}
          {displayMode === 'text' && isAutoRank && (
            <Form.Item label={t('hotSearchConfig.wordEnLabel')} name="wordEn">
              <Input placeholder={t('hotSearchConfig.wordEnAutoTip')} disabled suffix={<span style={{ color: '#999', fontSize: 12 }}>{t('hotSearchConfig.wordEnAutoSuffix')}</span>} />
            </Form.Item>
          )}

          {/* ===== 图片上传（图片模式） ===== */}
          {displayMode === 'image' && (
            <>
              <Form.Item label={t('hotSearchConfig.imageCnLabel')} name="image">
                <Upload
                  listType="picture-card"
                  maxCount={1}
                  accept=".jpeg,.jpg,.png,.gif,.webp"
                  beforeUpload={(file) => {
                    if (file.size > 10 * 1024 * 1024) { message.error(t('hotSearchConfig.imageTooLarge')); return false }
                    return false
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <UploadOutlined />
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>300×100</div>
                  </div>
                </Upload>
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  {t('hotSearchConfig.imageSizeTip')}
                </div>
              </Form.Item>
              <Form.Item label={t('hotSearchConfig.imageEnLabel')} name="imageEn">
                <Upload
                  listType="picture-card"
                  maxCount={1}
                  accept=".jpeg,.jpg,.png,.gif,.webp"
                  beforeUpload={(file) => {
                    if (file.size > 10 * 1024 * 1024) { message.error(t('hotSearchConfig.imageTooLarge')); return false }
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
              <h4 style={{ marginBottom: 12, fontSize: 14 }}>{t('hotSearchConfig.jumpConfigTitle')}</h4>
              <div style={{ display: 'flex', gap: 16 }}>
                <Form.Item label={t('hotSearchConfig.jumpTypeLabel')} name="jumpType" style={{ flex: 1 }}>
                  <Select options={getJumpOptions(promotionType)} onChange={(v) => setJumpType(v)} />
                </Form.Item>
                {jumpType === 'merchantPage' && (
                  <Form.Item label={t('hotSearchConfig.merchantIdLabel')} name="jumpTarget" rules={[{ required: true, message: t('hotSearchConfig.merchantIdRequired') }]} style={{ flex: 1 }}>
                    <Input placeholder={t('hotSearchConfig.merchantIdPlaceholder')} />
                  </Form.Item>
                )}
                {jumpType === 'h5' && (
                  <Form.Item label={t('hotSearchConfig.h5Label')} name="jumpTarget" rules={[{ required: true, message: t('hotSearchConfig.h5Required') }]} style={{ flex: 1 }}>
                    <Input placeholder={t('hotSearchConfig.h5Placeholder')} />
                  </Form.Item>
                )}
                {jumpType === 'appPage' && (
                  <Form.Item label={t('hotSearchConfig.appPageLabel')} name="jumpTarget" rules={[{ required: true, message: t('hotSearchConfig.appPageRequired') }]} style={{ flex: 1 }}>
                    <Select options={appPageOptions} placeholder={t('hotSearchConfig.appPagePlaceholder')} />
                  </Form.Item>
                )}
              </div>
            </div>
          )}

          {/* ===== 展示区域 ===== */}
          <Form.Item label={t('hotSearchConfig.regionLabel')} name="region" rules={[{ required: true }]}>
            <Select mode="multiple" options={regionOptions.filter(o => o.value !== 'all')} />
          </Form.Item>

          {/* ===== 展示时段（单选下拉） ===== */}
          <Form.Item label={t('hotSearchConfig.timeSlotLabel')} name="timeSlot" rules={[{ required: true, message: t('hotSearchConfig.timeSlotRequired') }]}>
            <Select options={timeSlotOptions} placeholder={t('hotSearchConfig.timeSlotPlaceholder')} />
          </Form.Item>

          {/* ===== 生效日期 + 状态 + 排序 ===== */}
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label={t('hotSearchConfig.effectDateLabel')} name="dateRange" rules={[{ required: true, message: t('hotSearchConfig.effectDateRequired') }]} style={{ flex: 2 }}>
              <RangePicker format="YYYY-MM-DD" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('hotSearchConfig.statusLabel')} name="status" style={{ flex: 1 }}>
              <Select options={[{ label: t('dict.status.enable'), value: 'active' }, { label: t('dict.status.disable'), value: 'inactive' }]} />
            </Form.Item>
            <Form.Item label={t('hotSearchConfig.sortLabel')} name="sortOrder" style={{ flex: 1 }}>
              <InputNumber min={1} max={999} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          {/* ===== 样式配置 + 预览（仅 词来源=自定义词 + 文字模式） ===== */}
          {wordSource === 'custom' && displayMode === 'text' && (
            <div style={{ background: '#FAFAFA', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h4 style={{ marginBottom: 12, fontSize: 14 }}>{t('hotSearchConfig.styleTitle')}</h4>
              <div style={{ display: 'flex', gap: 16 }}>
                <Form.Item label={t('hotSearchConfig.borderColorLabel')} name="borderColor">
                  <ColorPicker />
                </Form.Item>
                <Form.Item label={t('hotSearchConfig.bgColorLabel')} name="bgColor">
                  <ColorPicker />
                </Form.Item>
                <Form.Item label={t('hotSearchConfig.fontColorLabel')} name="fontColor">
                  <ColorPicker />
                </Form.Item>
              </div>
              {/* 实时预览 - 单场景 */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>📱 {t('hotSearchConfig.previewTitle')}</div>
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
        title={t('hotSearchConfig.detailTitle')}
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsDetailModalOpen(false)}>{t('common.close')}</Button>,
        ]}
        width={760}
      >
        {detailRecord && (
          <div style={{ marginTop: 16 }}>
            {/* 基本信息 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>📋 {t('hotSearchConfig.secBase')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fId')}</div>
                  <div style={{ fontWeight: 'bold' }}>{detailRecord.id}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fEntry')}</div>
                  <div>{searchEntryOptions.find(o => o.value === detailRecord.searchEntry)?.label || '-'}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fBrand')}</div>
                  <div>{brandOptions.find(o => o.value === detailRecord.brand)?.label || '-'}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fTerminal')}</div>
                  <div>
                    {detailRecord.terminal.map(t => (
                      <Tag key={t} style={{ marginRight: 4 }}>{terminalOptions.find(o => o.value === t)?.label || t}</Tag>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fDisplayMode')}</div>
                  <div>{displayModeOptions.find(o => o.value === detailRecord.displayMode)?.label || '-'}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fWordSource')}</div>
                  <div>{wordSourceOptions.find(o => o.value === detailRecord.wordSource)?.label || '-'}</div>
                </div>
              </div>
            </div>

            {/* 热搜词信息 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>🔍 {t('hotSearchConfig.secWord')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fWordCn')}</div>
                  <div style={{ fontWeight: 'bold', fontSize: 14 }}>{detailRecord.word}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fWordEn')}</div>
                  <div>{detailRecord.wordEn || '-'}</div>
                </div>
                {detailRecord.wordSource === 'hotSearchLib' && detailRecord.libMode === 'autoRank' && (
                  <div>
                    <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fLibRank')}</div>
                    <div>Top {detailRecord.hotSearchRank || '-'}</div>
                  </div>
                )}
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fLibMode')}</div>
                  <div>{libModeOptions.find(o => o.value === detailRecord.libMode)?.label || '-'}</div>
                </div>
              </div>
            </div>

            {/* 推广配置 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>📢 {t('hotSearchConfig.secPromo')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fPromoType')}</div>
                  <div>{promotionTypeOptions.find(o => o.value === detailRecord.promotionType)?.label || '-'}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fJumpType')}</div>
                  <div>{allJumpTypeOptions.find(o => o.value === detailRecord.jumpType)?.label || '-'}</div>
                </div>
                {detailRecord.jumpType && detailRecord.jumpType !== 'none' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fJumpTarget')}</div>
                    <div style={{ wordBreak: 'break-all', color: '#1677FF' }}>{detailRecord.jumpTarget}</div>
                  </div>
                )}
              </div>
            </div>

            {/* 定向设置 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>🎯 {t('hotSearchConfig.secTarget')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fRegion')}</div>
                  <div>
                    {detailRecord.region.map(r => (
                      <Tag key={r} style={{ marginRight: 4 }}>{regionOptions.find(o => o.value === r)?.label || r}</Tag>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fTimeSlot')}</div>
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
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>📅 {t('hotSearchConfig.secEffect')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fEffectDate')}</div>
                  <div>{detailRecord.startDate} ~ {detailRecord.endDate}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fDisplayRange')}</div>
                  <div>
                    {detailRecord.displayTimeRange && detailRecord.displayTimeRange.length === 2
                      ? `${detailRecord.displayTimeRange[0]} - ${detailRecord.displayTimeRange[1]}`
                      : t('dict.timeSlot.allDay')}
                  </div>
                </div>
              </div>
            </div>

            {/* 其他信息 */}
            <div>
              <div style={{ fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#1677FF' }}>ℹ️ {t('hotSearchConfig.secOther')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fSort')}</div>
                  <div>{detailRecord.sortOrder}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fStatus')}</div>
                  <div>{detailRecord.status === 'active' ? <Tag color="success">{t('dict.status.enable')}</Tag> : <Tag color="default">{t('dict.status.disable')}</Tag>}</div>
                </div>
                <div>
                  <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{t('hotSearchConfig.fUpdate')}</div>
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
