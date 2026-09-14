/**
 * 通过 API 批量写入 iPhone 型号数据 + 手机类参数类型/参数值
 * 用法: node scripts/seed_iphone_api.js
 */
const BASE = 'http://127.0.0.1:8080/api'

const IPHONES = [
  ['A11', 'iPhone (初代)', 2007], ['A12', 'iPhone 3G', 2008], ['A13', 'iPhone 3GS', 2009],
  ['A14', 'iPhone 4', 2010], ['A15', 'iPhone 4s', 2011], ['A16', 'iPhone 5', 2012],
  ['A17', 'iPhone 5c', 2013], ['A18', 'iPhone 5s', 2013], ['A19', 'iPhone 6', 2014],
  ['A20', 'iPhone 6 Plus', 2014], ['A21', 'iPhone 6s', 2015], ['A22', 'iPhone 6s Plus', 2015],
  ['A23', 'iPhone SE (第一代)', 2016], ['A24', 'iPhone 7', 2016], ['A25', 'iPhone 7 Plus', 2016],
  ['A26', 'iPhone 8', 2017], ['A27', 'iPhone 8 Plus', 2017], ['A28', 'iPhone X', 2017],
  ['A29', 'iPhone XS', 2018], ['A30', 'iPhone XS Max', 2018], ['A31', 'iPhone XR', 2018],
  ['A32', 'iPhone 11', 2019], ['A33', 'iPhone 11 Pro', 2019], ['A34', 'iPhone 11 Pro Max', 2019],
  ['A35', 'iPhone SE (第二代)', 2020], ['A36', 'iPhone 12 mini', 2020], ['A37', 'iPhone 12', 2020],
  ['A38', 'iPhone 12 Pro', 2020], ['A39', 'iPhone 12 Pro Max', 2020],
  ['A40', 'iPhone 13 mini', 2021], ['A41', 'iPhone 13', 2021], ['A42', 'iPhone 13 Pro', 2021],
  ['A43', 'iPhone 13 Pro Max', 2021], ['A44', 'iPhone SE (第三代)', 2022],
  ['A45', 'iPhone 14', 2022], ['A46', 'iPhone 14 Plus', 2022], ['A47', 'iPhone 14 Pro', 2022],
  ['A48', 'iPhone 14 Pro Max', 2022], ['A49', 'iPhone 15', 2023], ['A50', 'iPhone 15 Plus', 2023],
  ['A51', 'iPhone 15 Pro', 2023], ['A52', 'iPhone 15 Pro Max', 2023],
  ['A53', 'iPhone 16', 2024], ['A54', 'iPhone 16 Plus', 2024], ['A55', 'iPhone 16 Pro', 2024],
  ['A56', 'iPhone 16 Pro Max', 2024], ['A57', 'iPhone 16e', 2025],
  ['A58', 'iPhone 17', 2025], ['A59', 'iPhone Air', 2025], ['A60', 'iPhone 17 Pro', 2025],
  ['A61', 'iPhone 17 Pro Max', 2025], ['A62', 'iPhone 18 Pro', 2026],
  ['A63', 'iPhone 18 Pro Max', 2026], ['A64', 'iPhone Duo (折叠屏)', 2026],
]

/** 手机分类参数类型定义 */
const PARAM_TYPES = [
  { code: 'chip', name: '芯片', unit: '', valueType: 'select', sort: 1, desc: '处理器型号' },
  { code: 'ram', name: '运行内存', unit: 'GB', valueType: 'select', sort: 2, desc: 'RAM 容量' },
  { code: 'storage', name: '存储容量', unit: 'GB', valueType: 'select', sort: 3, desc: 'ROM 容量' },
  { code: 'screen_size', name: '屏幕尺寸', unit: '英寸', valueType: 'select', sort: 4, desc: '屏幕对角线尺寸' },
  { code: 'screen_type', name: '屏幕类型', unit: '', valueType: 'select', sort: 5, desc: '屏幕面板技术' },
  { code: 'battery', name: '电池容量', unit: 'mAh', valueType: 'number', sort: 6, desc: '电池容量' },
  { code: 'color', name: '颜色', unit: '', valueType: 'select', sort: 7, desc: '可选颜色' },
  { code: 'network', name: '网络制式', unit: '', valueType: 'select', sort: 8, desc: '支持的网络类型' },
  { code: 'os', name: '操作系统', unit: '', valueType: 'select', sort: 9, desc: '出厂操作系统版本' },
  { code: 'weight', name: '重量', unit: 'g', valueType: 'number', sort: 10, desc: '机身重量' },
]

/** 参数值定义（按参数类型 code） */
const PARAM_VALUES = {
  chip: [
    'Samsung S5L8900', 'Samsung S5PC100', 'Samsung A4', 'Apple A4', 'Apple A5',
    'Apple A5X', 'Apple A6', 'Apple A6X', 'Apple A7', 'Apple A8', 'Apple A8X',
    'Apple A9', 'Apple A9X', 'Apple A10 Fusion', 'Apple A10X Fusion', 'Apple A11 Bionic',
    'Apple A12 Bionic', 'Apple A13 Bionic', 'Apple A14 Bionic', 'Apple A15 Bionic',
    'Apple A16 Bionic', 'Apple A17 Pro', 'Apple A18', 'Apple A18 Pro',
  ],
  ram: ['256MB', '512MB', '1', '2', '3', '4', '6', '8'],
  storage: ['4', '8', '16', '32', '64', '128', '256', '512', '1024'],
  screen_size: ['3.5', '4.0', '4.7', '5.4', '5.5', '5.8', '6.0', '6.1', '6.5', '6.7', '6.9'],
  screen_type: ['LCD TFT', 'LCD IPS', 'LCD Retina', 'OLED Super Retina', 'OLED Super Retina XDR', 'OLED Super Retina XDR ProMotion'],
  battery: [1400, 1432, 1570, 1810, 2915, 3279, 3687, 4325, 4422, 4685],
  color: ['黑色', '白色', '银色', '金色', '深空灰', '玫瑰金', '蓝色', '绿色', '紫色', '红色', '黄色', '橙色'],
  network: ['2G GSM', '3G UMTS', '4G LTE', '5G Sub-6', '5G mmWave'],
  os: ['iPhone OS 1', 'iPhone OS 2', 'iPhone OS 3', 'iOS 4', 'iOS 5', 'iOS 6', 'iOS 7', 'iOS 8', 'iOS 9', 'iOS 10', 'iOS 11', 'iOS 12', 'iOS 13', 'iOS 14', 'iOS 15', 'iOS 16', 'iOS 17', 'iOS 18', 'iOS 19'],
  weight: [135, 137, 140, 158, 168, 174, 187, 194, 221, 227, 240],
}

async function api(path, method = 'GET', body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE}${path}`, opts)
  const json = await res.json()
  if (json.code !== 200) throw new Error(`API ${path}: ${json.message}`)
  return json.data
}

async function main() {
  // 1. 登录
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'MF00001', password: '111222' }),
  })
  const loginData = await loginRes.json()
  if (loginData.code !== 200) { console.error('登录失败:', loginData.message); process.exit(1) }
  global.TOKEN = loginData.data.token
  console.log('✅ 登录成功')

  // 2. 查询苹果品牌
  const brands = await api('/eam/basic/brands')
  const apple = brands.find(b => b.brandZh.includes('苹果') || b.brandEn.includes('Apple'))
  if (!apple) { console.error('❌ 未找到苹果品牌'); process.exit(1) }
  console.log(`✅ 苹果品牌: id=${apple.id}, categoryCode=${apple.categoryCode}`)

  // 3. 先删除已有的 iPhone 型号（避免重复）
  const existingModels = await api('/eam/basic/models?size=9999&brandId=' + apple.id)
  for (const m of (existingModels.records || [])) {
    if (m.name && m.name.startsWith('iPhone')) {
      await api(`/eam/basic/models/${m.id}`, 'DELETE')
    }
  }
  console.log(`🗑️  清理旧数据: ${existingModels.records?.filter(m => m.name?.startsWith('iPhone')).length || 0} 条`)

  // 4. 批量创建 54 条 iPhone 型号
  let created = 0
  for (const [modelNo, name] of IPHONES) {
    try {
      await api('/eam/basic/models', 'POST', {
        categoryCode: apple.categoryCode,
        brandId: apple.id,
        brandZh: apple.brandZh,
        brandEn: apple.brandEn,
        brandLogo: apple.brandLogo || '',
        modelNo,
        name,
        unit: '台',
        refPrice: 0,
      })
      created++
    } catch (e) {
      console.error(`  ⚠️  ${name}: ${e.message}`)
    }
  }
  console.log(`✅ 创建 ${created}/${IPHONES.length} 条 iPhone 型号`)

  // 5. 创建手机类参数类型
  const catCode = apple.categoryCode // 01-01
  let typesCreated = 0
  for (const pt of PARAM_TYPES) {
    try {
      await api('/eam/basic/param-types', 'POST', {
        categoryCode: catCode,
        code: pt.code,
        name: pt.name,
        unit: pt.unit,
        valueType: pt.valueType,
        status: 'enabled',
        sort: pt.sort,
        description: pt.desc,
      })
      typesCreated++
    } catch (e) {
      // 可能已存在（编码重复），忽略
      if (!e.message.includes('已存在')) console.error(`  ⚠️  参数类型 ${pt.name}: ${e.message}`)
    }
  }
  console.log(`✅ 创建 ${typesCreated}/${PARAM_TYPES.length} 个参数类型`)

  // 6. 创建参数值
  let valuesCreated = 0
  for (const [typeCode, values] of Object.entries(PARAM_VALUES)) {
    for (const val of values) {
      try {
        await api('/eam/basic/param-values', 'POST', {
          paramTypeCode: typeCode,
          categoryCode: catCode,
          value: String(val),
          sort: 0,
          status: 'enabled',
        })
        valuesCreated++
      } catch (e) {
        // 忽略重复
      }
    }
  }
  console.log(`✅ 创建 ${valuesCreated} 条参数值`)

  console.log('\n🎉 全部完成！')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
