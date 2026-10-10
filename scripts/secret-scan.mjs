#!/usr/bin/env node
/**
 * 简易 Secret Scanning 脚本
 * 检查源码与工程脚本中是否存在硬编码密码、API 密钥等敏感信息
 *
 * 运行: npm run secret-scan
 *
 * 两条硬性要求（AI 强制规范 §通用禁止清单）：
 *   1. 凭据不得出现在任何被版本控制的文件里 —— 本地凭据放 backend/.env.local（已 gitignore）
 *   2. 命中时只输出位置与类型，绝不回显原始值 —— 否则 CI 日志本身就成了泄露源
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, extname, relative } from 'path'

const CWD = process.cwd()

// 业务源码：JS/TS 侧的硬编码凭据
const SRC_DIR = join(CWD, 'src')
const SRC_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])

// 工程脚本与配置：历史上明文数据库凭据就藏在 backend/*.sh 里
// 不扫 .sql/.md：迁移脚本里的 user_name 列值等会产生大量误报，文档类敏感信息靠人工审查
const INFRA_DIRS = ['backend', 'scripts', '.github']
const INFRA_EXTENSIONS = new Set(['.sh', '.py', '.yml', '.yaml', '.mjs'])

// 永不需要扫描的目录（本地凭据文件、构建产物、依赖、git 内部）
const SKIP_DIRS = new Set(['node_modules', 'dist', 'target', '.git', '.local', 'coverage', '.vercel'])
// 明确跳过的本地/示例文件：.env.local 存放真实凭据（已 gitignore），*.example 只含占位符
const SKIP_FILE_BASENAMES = new Set(['.env.local', '.backend.pid'])

const PATTERNS = [
  {
    name: '硬编码密码（password = "..."）',
    regex: /password\s*===?\s*['"][0-9a-zA-Z]{3,}['"]/i,
  },
  {
    name: '硬编码密码（pwd = "..."）',
    regex: /pwd\s*===?\s*['"][0-9a-zA-Z]{3,}['"]/i,
  },
  {
    name: 'API 密钥模式（sk-xxx）',
    regex: /['"]sk-[a-zA-Z0-9]{16,}['"]/,
  },
  {
    name: 'GitHub Token（ghp_xxx）',
    regex: /['"]ghp_[a-zA-Z0-9]{16,}['"]/,
  },
  {
    name: 'AWS Access Key',
    regex: /['"]AKIA[0-9A-Z]{16}['"]/,
  },
]

/**
 * 凭据类赋值：只针对工程脚本/配置（shell 环境变量、yml/properties 属性），
 * 不扫业务源码里的标识符，否则 totalTokens / loginPassword 这类正常变量会全部误报。
 * 匹配形式：
 *   export DB_PASSWORD='xxx'   DB_PASSWORD=xxx
 *   password: xxx   secret: xxx   api_key=xxx
 */
const KEY_ALT = String.raw`(?:[A-Z][A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*|DB_USERNAME|DB_USER|"?(?:password|passwd|secret|api_key|apikey|access_key|private_key)"?)`
const ASSIGN_PREFIX = String.raw`\b(?:export\s+)?(${KEY_ALT})\s*[:=]\s*`
// 引号包裹的字面值：无论什么风格均视为硬编码（注意 \2 才是真正的引号反向引用，\1 已被 key 占用）
const CRED_QUOTED = new RegExp(ASSIGN_PREFIX + String.raw`(['"])([^'"\n]*)\2`, 'gi')
// 裸值（无引号）：取到第一个空格/逗号为止；小写属性名常是变量引用，需区分
const CRED_BARE = new RegExp(ASSIGN_PREFIX + String.raw`([^'"\n#\s,]+)`, 'gi')
// ${KEY:-defaultValue} 形式的内置默认值同样属于泄露
const FALLBACK_DEFAULT = /\$\{[A-Z][A-Z0-9_]*:-([^}]*)\}/g

/**
 * 判定一个值是否可以安全提交：占位符、变量引用、表达式、过短的值、表格分隔线。
 * 阀值 8 字符：真实密码/密钥不会短于此，短值多为示例开关（如 `token: write`）。
 */
function isPlaceholder(value) {
  const v = (value || '').trim()
  if (v.length < 8) return true
  if (v.startsWith('<') || v.startsWith('$')) return true
  if (v.includes('${') || /[()]/.test(v)) return true
  if (/^(?:os\.|sys\.|env|getenv|process\.env)/i.test(v)) return true
  if (/^(?:your[-_]|changeme|placeholder|example|dummy|todo|xxx+|redacted)/i.test(v)) return true
  if (/^[|*_\s.,-]+$/.test(v)) return true
  return false
}

let violations = 0
const filesScanned = []

/** 只输出变量名与长度，不回显值本身 */
function report(relPath, lineNo, kind, keyName, value) {
  console.error(`  ✗ ${relPath}:${lineNo} — ${kind}${keyName ? `（${keyName}）` : ''}`)
  console.error(`    [已脱敏：疑似长度 ${value.length} 字符，未打印内容]`)
  violations++
}

function scanFile(filePath, mode) {
  const ext = extname(filePath)
  const relPath = relative(CWD, filePath)
  const base = relPath.split(/[\\/]/).pop()
  if (SKIP_FILE_BASENAMES.has(base)) return
  if (mode === 'src' && !SRC_EXTENSIONS.has(ext)) return
  if (mode === 'infra' && !INFRA_EXTENSIONS.has(ext)) return
  // 示例文件只含占位符，无需扫描
  if (base.endsWith('.example')) return

  // 跳过测试文件与测试资源（测试用的假凭据不属于泄露）
  if (relPath.includes('.test.') || relPath.includes('.spec.') || relPath.includes('test/setup')) return
  if (relPath.split(/[\\/]/).includes('test')) return

  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    // 跳过注释行
    if (/^(\/\/|\*|\/\*|#)/.test(trimmed) && !/^#!\//.test(trimmed)) return

    for (const pattern of PATTERNS) {
      if (pattern.regex.test(line)) {
        report(relPath, index + 1, pattern.name, null, '')
      }
    }

    // 凭据赋值与内置默认值只适用于工程脚本/配置
    if (mode === 'infra') {
      for (const m of line.matchAll(CRED_QUOTED)) {
        const [, key, , value] = m
        if (isPlaceholder(value)) continue
        report(relPath, index + 1, '凭据类变量被写入字面凭据', key, value)
      }
      for (const m of line.matchAll(CRED_BARE)) {
        const [, key, rawValue] = m
        const value = rawValue.trim().replace(/[,;)]+$/, '')
        // 小写属性名 + 裸标识符（如 Python 的 password=PASSWORD、yml 的 password: ***）属于代码/变量引用
        if (/^"?(?:password|passwd|secret|api_key|apikey|access_key|private_key)"?$/i.test(key)
          && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) continue
        if (isPlaceholder(value)) continue
        report(relPath, index + 1, '凭据类变量被写入字面凭据', key, value)
      }
      for (const m of line.matchAll(FALLBACK_DEFAULT)) {
        const [, value] = m
        if (isPlaceholder(value)) continue
        report(relPath, index + 1, '环境变量默认值含字面凭据', null, value)
      }
    }
  })

  filesScanned.push(filePath)
}

function scanDir(dir, mode) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue
      scanDir(fullPath, mode)
    } else {
      scanFile(fullPath, mode)
    }
  }
}

console.log('🔍 扫描源码与工程脚本中的硬编码敏感信息...\n')

try {
  scanDir(SRC_DIR, 'src')
  for (const dir of INFRA_DIRS) scanDir(join(CWD, dir), 'infra')
} catch (e) {
  console.error(`扫描失败: ${e.message}`)
  process.exit(1)
}

console.log(`\n扫描完成: ${filesScanned.length} 个文件`)

if (violations > 0) {
  console.error(`\n❌ 发现 ${violations} 个违规项`)
  console.error('   凭据请改放本地环境变量文件（如 backend/.env.local，已 gitignore），')
  console.error('   或从 CI/容器环境变量注入；参考 backend/.env.local.example。')
  process.exit(1)
} else {
  console.log('✅ 未发现硬编码敏感信息')
  process.exit(0)
}
