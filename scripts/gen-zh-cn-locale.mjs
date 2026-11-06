/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/**
 * 简体中文静态语言包（zh-CN.json）生成器。
 *
 * <p>背景：`frontend/packages/i18n/src/i18n/locales/` 原先只有 zh-TW/en/ja/ko/ru 五份静态包，
 * 唯独 zh-CN 一份都没有，而 i18next 的 `fallbackLng` 是 `'en'`。后果是 zh-CN 的每一个字
 * 只能来自后端数据库语言包（`/api/translations/bundle`），于是：
 * <ul>
 *   <li>库里没有的 key（当时 8036 个）一律渲染成英文；</li>
 *   <li>登录页取不到 bundle（bundle 需要登录），简体中文登录页整页英文。</li>
 * </ul>
 * 所以 zh-CN 必须和 zh-TW/en 一样有一份静态兜底包。
 *
 * <p>转换口径与后端**完全一致**：都用 ICU4J 的 `Traditional-Simplified` 转换器
 * （见 {@code TranslationServiceImpl#convertToSimplifiedChinese}）。两边算法不同就会产生
 * 「库里一个样、界面上另一个样」的分裂，静态包优先级还更高（注入时 overwrite=false），
 * 会永久盖掉库里的值。因此本脚本直接调用同一个 ICU4J 版本，而不是自己维护一张繁简表。
 *
 * <p>产物入库、CI 只做结构校验（见 `--check`），这样后端 CI 不必装 Node、前端 CI 不必装 JDK：
 * <ul>
 *   <li>{@code npm run i18n:gen-zhcn}——按 zh-TW.json 重新生成 zh-CN.json（需要 JDK 17 + ICU4J）</li>
 *   <li>{@code npm run check:i18n-zhcn}——只校验 key 集合与非空，不重新转换</li>
 * </ul>
 *
 * <p>ICU4J 定位顺序：环境变量 {@code ICU4J_JAR} → 本地 Maven 仓库
 * {@code ~/.m2/repository/com/ibm/icu/icu4j/<版本>/icu4j-<版本>.jar}（取最高版本）。
 * 后端 pom 用的是 74.2，本地若同时存在多个版本，结果可能与后端不一致，日志会打印实际取用的版本。
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOCALE_DIR = join(ROOT, 'frontend', 'packages', 'i18n', 'src', 'i18n', 'locales')
const SRC_PATH = join(LOCALE_DIR, 'zh-TW.json')
const DST_PATH = join(LOCALE_DIR, 'zh-CN.json')
/** 与后端 backend/pom.xml 的 icu4j 版本对齐；取不到时只用它做提示 */
const EXPECTED_ICU4J = '74.2'

const CHECK_ONLY = process.argv.includes('--check')

/**
 * 空容器哨兵。`{}` / `[]` 不产出任何文案叶子，但必须原样保留结构：
 * 2026-11-06 写自校时实测到旧重建会把 `meeting.minutesSend: {}` 整个弄丢，
 * 生成物与真源不再同形。哨兵在转换阶段被跳过，在重建阶段还原成空容器。
 */
const EMPTY_OBJECT = Symbol.for('mftb.i18n.emptyObject')
const EMPTY_ARRAY = Symbol.for('mftb.i18n.emptyArray')

const isEmptyMarker = value => value === EMPTY_OBJECT || value === EMPTY_ARRAY

/**
 * 摊平嵌套结构为 [路径, 文案]，保序——生成物要与真源逐 key 对齐，不能靠字典序重排。
 * <p>数组必须按下标展开成 `a.b.[3]` 这样的路径，**不能当叶子整条压成字符串**：
 * 2026-11-06 实测旧实现把 `meeting.calendarWeekdays` 生成成 `"周日,周一,…"`，
 * i18next 的 `returnObjects` 于是返回字符串，日历视图 `weekdays.map()` 直接把
 * 「我的会议」整页打成错误边界——而 `--check` 因为两侧都把数组当叶子，结构完全对称，
 * 一路绿灯。按下标展开后，类型腐化会表现为「key 集合不一致」，本门禁才拦得住。
 */
function flatten(node, prefix = '', out = []) {
  if (node === null || typeof node !== 'object') return out
  const entries = Array.isArray(node)
    ? node.map((value, index) => [`[${index}]`, value])
    : Object.entries(node)
  if (entries.length === 0) out.push([prefix, Array.isArray(node) ? EMPTY_ARRAY : EMPTY_OBJECT])
  for (const [key, value] of entries) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object') flatten(value, path, out)
    else out.push([path, value])
  }
  return out
}

/** 由点分路径重建嵌套结构（与 flatten 严格互逆，`[i]` 段还原为数组下标） */
function unflatten(pairs) {
  const root = {}
  for (const [path, value] of pairs) {
    const parts = path.split('.')
    let node = root
    for (let i = 0; i < parts.length - 1; i += 1) {
      const index = asIndex(parts[i])
      const key = index !== null ? index : parts[i]
      // 容器取数组还是对象，由下一段是不是下标决定——否则对象数组会被重建为带数字键的对象
      const nextIsIndex = asIndex(parts[i + 1]) !== null
      if (typeof node[key] !== 'object' || node[key] === null) node[key] = nextIsIndex ? [] : {}
      node = node[key]
    }
    const lastIndex = asIndex(parts[parts.length - 1])
    const lastKey = lastIndex !== null ? lastIndex : parts[parts.length - 1]
    node[lastKey] = value === EMPTY_ARRAY ? [] : value === EMPTY_OBJECT ? {} : value
  }
  return root
}

/** `'[12]'` → 12；其余返回 null（表示这是一个普通对象键） */
function asIndex(segment) {
  return /^\[(\d+)\]$/.test(segment) ? Number(segment.slice(1, -1)) : null
}

/**
 * 写入前自校：`unflatten(flatten(x))` 必须与 `x` 逐字节同形同序。
 * <p>这条不是防御性代码，而是本脚本唯一能证明「数组没被压成字符串、对象数组没被拆成数字键对象」
 * 的断言。旧实现没有它，把 8 个数组型 key 全量压平产出并入库，下游崩了三层才被发现。
 * 不成立就中止，宁可不产出也不能产出结构变形的语言包。
 */
function assertRoundTrip(source) {
  const rebuilt = unflatten(flatten(source))
  const dump = value => JSON.stringify(value)
  if (dump(rebuilt) === dump(source)) return
  // 只在失败路径上跑：找出第一批形状不一致的叶子，把诊断信息挨到具体 key，而不是只报「不等」
  const pairs = flatten(source)
  const bad = []
  for (const [path, value] of pairs) {
    let node = rebuilt
    for (const seg of path.split('.')) {
      if (node === null || typeof node !== 'object') { node = undefined; break }
      const index = asIndex(seg)
      node = node[index !== null ? index : seg]
    }
    if (dump(node) !== (isEmptyMarker(value) ? dump(value === EMPTY_ARRAY ? [] : {}) : dump(value))) {
      bad.push(`${path}：源 ${isEmptyMarker(value) ? '(空容器)' : dump(value)} → 重建 ${dump(node)}`)
    }
    if (bad.length >= 3) break
  }
  console.error(`❌ 内部错误：flatten/unflatten 不是严格互逆，共 ${pairs.length} 个源叶子，首批变形如下`)
  bad.forEach(line => console.error(`   ${line}`))
  console.error('   中止写入，以免产出结构变形的语言包。')
  process.exit(1)
}

/** 在本地 Maven 仓库里找 ICU4J jar */
function locateIcu4j() {
  if (process.env.ICU4J_JAR && existsSync(process.env.ICU4J_JAR)) return process.env.ICU4J_JAR
  const base = join(process.env.HOME || '', '.m2', 'repository', 'com', 'ibm', 'icu', 'icu4j')
  if (!existsSync(base)) return null
  const versions = readdirSync(base).filter(v => existsSync(join(base, v)))
  // 目录名字典序对 74.2 / 9.1 这类会排错，按数值段比较取最高版本
  versions.sort((a, b) => {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
      const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
      if (diff !== 0) return diff
    }
    return 0
  })
  const top = versions[versions.length - 1]
  const jar = join(base, top, `icu4j-${top}.jar`)
  return existsSync(jar) ? jar : null
}

/**
 * ICU4J 转换小程序：stdin 每行 `<b64(key)>\t<b64(繁中)>`，stdout 每行 `<b64(key)>\t<b64(简中)>`。
 * 走 base64 是因为文案里有换行与制表符，按行直传会把一条记录拆成多条。
 * key 原样回传，Node 侧据此对齐，避免依赖输出顺序。
 */
const JAVA_SOURCE = `
import com.ibm.icu.text.Transliterator;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class I18nTradToSimp {
    public static void main(String[] args) throws Exception {
        // 与后端 TranslationServiceImpl.TRAD_TO_SIMP 同一个 ID，保证两处转换结果一致
        Transliterator t = Transliterator.getInstance("Traditional-Simplified");
        Base64.Encoder enc = Base64.getUrlEncoder().withoutPadding();
        Base64.Decoder dec = Base64.getUrlDecoder();
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        PrintWriter out = new PrintWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8));
        String line;
        while ((line = in.readLine()) != null) {
            int tab = line.indexOf('\\t');
            if (tab < 0) continue;
            String key = line.substring(0, tab);
            String text = new String(dec.decode(line.substring(tab + 1)), StandardCharsets.UTF_8);
            out.println(key + "\\t" + enc.encodeToString(t.transliterate(text).getBytes(StandardCharsets.UTF_8)));
        }
        out.flush();
    }
}
`

function generate() {
  const source = JSON.parse(readFileSync(SRC_PATH, 'utf8'))
  assertRoundTrip(source)
  const pairs = flatten(source)
  // 哨兵不参与繁简转换（它们不是文案），只参与结构重建
  const textPairs = pairs.filter(([, value]) => !isEmptyMarker(value))
  const jar = locateIcu4j()
  if (!jar) {
    console.error(`❌ 找不到 ICU4J jar。请确认后端依赖已下载（mvn -f backend/pom.xml -q dependency:resolve），`)
    console.error(`   或用环境变量指定：ICU4J_JAR=/path/to/icu4j-${EXPECTED_ICU4J}.jar npm run i18n:gen-zhcn`)
    process.exit(1)
  }
  console.log(`使用 ICU4J：${jar}`)
  if (!jar.includes(`-${EXPECTED_ICU4J}.jar`)) {
    console.warn(`⚠️  取用的 ICU4J 版本与后端 pom（${EXPECTED_ICU4J}）不同，转换结果可能与后端库内值不一致`)
  }

  const workDir = mkdtempSync(join(tmpdir(), 'i18n-t2s-'))
  try {
    const javaFile = join(workDir, 'I18nTradToSimp.java')
    writeFileSync(javaFile, JAVA_SOURCE, 'utf8')
    const payload = textPairs
      .map(([, value]) => String(value ?? ''))
      .map((text, i) => `${Buffer.from(textPairs[i][0], 'utf8').toString('base64url')}\t${Buffer.from(text, 'utf8').toString('base64url')}`)
      .join('\n') + '\n'

    // JDK 17 单文件源码模式：不产生 class 文件，也不需要临时 pom
    const run = spawnSync('java', ['-cp', jar, javaFile], { input: payload, encoding: 'utf8', maxBuffer: 1 << 28 })
    if (run.status !== 0) {
      console.error(`❌ ICU4J 转换失败（exit ${run.status}）：${(run.stderr || run.stdout || '').slice(0, 2000)}`)
      process.exit(1)
    }

    const byKey = new Map()
    for (const line of (run.stdout || '').split('\n')) {
      if (!line.trim()) continue
      const tab = line.indexOf('\t')
      if (tab < 0) continue
      const key = Buffer.from(line.slice(0, tab), 'base64url').toString('utf8')
      const value = Buffer.from(line.slice(tab + 1), 'base64url').toString('utf8')
      byKey.set(key, value)
    }

    const missing = textPairs.filter(([k]) => !byKey.has(k))
    if (missing.length > 0) {
      console.error(`❌ 转换结果缺 ${missing.length} 个 key（如 ${missing.slice(0, 5).map(m => m[0]).join(', ')}），中止写入以免产出残缺语言包`)
      process.exit(1)
    }

    const converted = pairs.map(([k, v]) => [k, isEmptyMarker(v) ? v : (byKey.get(k) ?? v)])
    const unchanged = textPairs.filter(([k, v]) => String(byKey.get(k) ?? '') === String(v ?? '')).length
    writeFileSync(DST_PATH, `${JSON.stringify(unflatten(converted), null, 2)}\n`, 'utf8')
    console.log(`✅ 已生成 zh-CN.json：${textPairs.length} 个文案 key（其中 ${textPairs.length - unchanged} 个字形有变化）`)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

/**
 * CI 口径：只校结构（key 集合一致 + 繁中有值处简中不得为空），不重跑转换。
 * 这样前端 CI 不需要 JDK、后端 CI 不需要 Node，产物漂移由「key 集合 + 空洞」两件事兜住。
 * <p>空串判定只看「繁中有值而简中为空」：量词类文案（個/家/週/項）在英文里是故意留空的，
 * 一刀切把空串当错误会误报；繁中/简中同族，繁中有值简中就一定要有值。
 */
function check() {
  if (!existsSync(DST_PATH)) {
    console.error('❌ zh-CN.json 不存在：简体中文没有静态兜底包，登录页与数据库缺失 key 会全部回退英文。')
    console.error('   本地执行 `npm run i18n:gen-zhcn` 生成后提交。')
    process.exit(1)
  }
  const srcPairs = flatten(JSON.parse(readFileSync(SRC_PATH, 'utf8')))
  const srcFlat = Object.fromEntries(srcPairs)
  const dstFlat = Object.fromEntries(flatten(JSON.parse(readFileSync(DST_PATH, 'utf8'))))
  const srcKeys = new Set(srcPairs.map(([k]) => k))
  const missing = srcPairs.filter(([k]) => !(k in dstFlat))
  const stale = Object.keys(dstFlat).filter(k => !srcKeys.has(k))
  // 空容器哨兵不是文案：既不参与「有值/为空」判定，也不得因为它的存在而报空洞
  const holes = Object.entries(srcFlat)
    .filter(([k, v]) => !isEmptyMarker(v) && String(v ?? '').trim() && !String(dstFlat[k] ?? '').trim())
    .map(([k]) => k)
  const srcBlank = srcPairs.filter(([, v]) => !isEmptyMarker(v) && !String(v ?? '').trim()).map(([k]) => k)

  console.log(`zh-TW.json ${srcKeys.size} 个 key / zh-CN.json ${Object.keys(dstFlat).length} 个 key`)
  let failed = false
  if (missing.length > 0) {
    failed = true
    console.error(`❌ zh-CN.json 缺 ${missing.length} 个 key（如 ${missing.slice(0, 5).map(m => m[0]).join(', ')}）`)
  }
  if (stale.length > 0) {
    failed = true
    console.error(`❌ zh-CN.json 有 ${stale.length} 个 zh-TW.json 已删除的 key（如 ${stale.slice(0, 5).join(', ')}）`)
  }
  if (holes.length > 0) {
    failed = true
    console.error(`❌ 繁中有值但简中为空共 ${holes.length} 个（如 ${holes.slice(0, 5).join(', ')}），i18next 会跳过空串并回退英文`)
  }
  if (failed) {
    console.error('   执行 `npm run i18n:gen-zhcn` 重新生成。')
    process.exit(1)
  }
  if (srcBlank.length > 0) {
    // 空洞在繁中源头（不是 zh-CN 的锅），只报不阻断：补文案属业务定稿，不能自动编造
    console.warn(`⚠️  zh-TW.json 有 ${srcBlank.length} 个空文案（如 ${srcBlank.slice(0, 5).join(', ')}）：简中跟着为空，需业务补写`)
  }
  console.log('✅ zh-CN 静态包与 zh-TW 结构齐备')
}

/**
 * 只有直接执行本文件才跑生成/校验；被测试 import 时不执行。
 * <p>旧版本在模块顶层直接 `if (CHECK_ONLY) check() else generate()`，导致 flatten/unflatten
 * 根本没法单测——一 import 就去读真源、找 ICU4J、写文件。结构保真这条不变量必须有单测钉住。
 * <p>两边都取 realpath：工作区目录可能是符号链接（本机 Desktop/SARY → Projects/SARY），
 * 只比字面路径会让「直接执行」被误判成「被 import」，门禁当场变成什么都不做地绿过去。
 */
const isMain = (() => {
  if (!process.argv[1]) return false
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()
if (isMain) {
  if (CHECK_ONLY) check()
  else generate()
}

export { flatten, unflatten, asIndex, isEmptyMarker, EMPTY_OBJECT, EMPTY_ARRAY }
