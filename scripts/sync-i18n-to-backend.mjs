/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/**
 * 前端语言包 → 后端 resources 同步器。
 *
 * <p>背景：后端启动同步器 {@code TranslationDataInitializer.syncI18nKeys()} 读的是
 * {@code classpath:i18n/zh-TW.json}（即 {@code backend/modules/legacy/src/main/resources/i18n/}
 * 下的一份前端语言包副本），用它把全站 i18n key 灌进 {@code sys_translation}。
 * 这份副本此前靠人手拷贝，2026-11-05 实测已经腐化：真源 16044 个 key，副本只有 8007 个，
 * 且 167 个 key 的繁中值与真源不一致——后果是简体中文（无静态包，完全依赖数据库语言包）
 * 有一半 key 回退英文，而「翻译统计」页因为分母只算库里已有的记录，全程显示 100% 无人报警。
 *
 * <p>本脚本把「拷副本」变成一条命令 + 一道门禁：
 * <ul>
 *   <li>{@code npm run i18n:sync-backend}——按真源重写副本（字节级一致，不做格式化）</li>
 *   <li>{@code npm run check:i18n-mirror}——只校验不写，副本与真源不一致即失败（CI 用）</li>
 * </ul>
 *
 * <p>为什么是「提交副本」而不是「构建期生成」：{@code backend-docker.yml} 的 verify 作业
 * 只有 JDK 没有 Node，构建期生成需要给后端 CI 装一套前端工具链；而副本入库后
 * jar 内容可复核、可 diff、可回溯，代价只是多几百 KB，并且由本门禁保证不会漂移。
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 需要同步的语言：繁中/英文是引用完整性硬要求，简中由繁转简生成（与后端 ICU4J 同字头） */
const LOCALES = ['zh-TW', 'en', 'zh-CN']

const SRC_DIR = join(ROOT, 'frontend', 'packages', 'i18n', 'src', 'i18n', 'locales')
const DST_DIR = join(ROOT, 'backend', 'modules', 'legacy', 'src', 'main', 'resources', 'i18n')

const CHECK_ONLY = process.argv.includes('--check')

/** 把嵌套语言包摊平成点号 key，只为打印漂移明细；判定口径仍是字节一致 */
function flatten(node, prefix = '', out = {}) {
  if (!node || typeof node !== 'object') return out
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out)
    else out[path] = value
  }
  return out
}

const sha256 = buf => createHash('sha256').update(buf).digest('hex').slice(0, 12)

let drifted = 0
let missingSource = 0
for (const lang of LOCALES) {
  const srcPath = join(SRC_DIR, `${lang}.json`)
  const dstPath = join(DST_DIR, `${lang}.json`)
  let srcBuf = null
  try {
    srcBuf = readFileSync(srcPath)
  } catch {
    // zh-CN.json 是 `npm run i18n:gen-zhcn` 的产物；写入模式下不重复报错，
    // 但 --check 必须计为失败：否则真源被误删时这道门禁会当「无事发生」直接绿
    console.warn(`⚠️  跳过 ${lang}.json：前端真源不存在（如缺 zh-CN.json，先跑 npm run i18n:gen-zhcn）`)
    missingSource += 1
    continue
  }
  let dstBuf = null
  try {
    dstBuf = readFileSync(dstPath)
  } catch {
    dstBuf = null
  }

  if (dstBuf && dstBuf.equals(srcBuf)) {
    console.log(`✅ ${lang}.json 副本与真源一致（${sha256(srcBuf)}）`)
    continue
  }

  drifted += 1
  const srcKeys = Object.keys(flatten(JSON.parse(srcBuf.toString('utf8'))))
  const dstKeys = dstBuf ? Object.keys(flatten(JSON.parse(dstBuf.toString('utf8')))) : []
  const dstSet = new Set(dstKeys)
  const srcSet = new Set(srcKeys)
  const missing = srcKeys.filter(k => !dstSet.has(k))
  const stale = dstKeys.filter(k => !srcSet.has(k))
  const srcFlat = flatten(JSON.parse(srcBuf.toString('utf8')))
  const dstFlat = dstBuf ? flatten(JSON.parse(dstBuf.toString('utf8'))) : {}
  const changed = srcKeys.filter(k => dstSet.has(k) && String(dstFlat[k]) !== String(srcFlat[k]))

  console.log(`❌ ${lang}.json 副本已漂移（真源 ${srcKeys.length} key，副本 ${dstKeys.length} key）`)
  console.log(`   真源有而副本缺：${missing.length} 个${missing.length ? `，如 ${missing.slice(0, 5).join(', ')}` : ''}`)
  console.log(`   副本有而真源已删：${stale.length} 个${stale.length ? `，如 ${stale.slice(0, 5).join(', ')}` : ''}`)
  console.log(`   同 key 文案不一致：${changed.length} 个${changed.length ? `，如 ${changed.slice(0, 3).map(k => `${k}（副本 "${dstFlat[k]}" ≠ 真源 "${srcFlat[k]}"）`).join(' ; ')}` : ''}`)

  if (CHECK_ONLY) continue
  mkdirSync(dirname(dstPath), { recursive: true })
  writeFileSync(dstPath, srcBuf)
  console.log(`   → 已按真源重写 ${relative(ROOT, dstPath)}`)
}

if (CHECK_ONLY && (drifted > 0 || missingSource > 0)) {
  if (drifted > 0) {
    console.log(`\n后端 resources/i18n/ 有 ${drifted} 份语言包落后于前端真源。`)
  }
  if (missingSource > 0) {
    console.log(`\n前端真源缺 ${missingSource} 份语言包（见上方 ⚠️）。`)
  }
  console.log('本地执行 `npm run i18n:gen-zhcn` + `npm run i18n:sync-backend` 后把改动一并提交；')
  console.log('否则 sys_translation 只会同步到旧 key 集合，简体中文界面会大面积回退英文。')
  process.exit(1)
}

if (!CHECK_ONLY) {
  console.log(drifted > 0 ? `\n同步完成，更新 ${drifted} 份语言包。` : '\n副本已是最新，无需同步。')
}
