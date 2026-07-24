#!/usr/bin/env node
/**
 * 简易 Secret Scanning 脚本
 * 检查源码中是否存在硬编码密码、API 密钥等敏感信息
 *
 * 运行: npm run secret-scan
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

const SRC_DIR = join(process.cwd(), 'src')
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])

// 检测模式：硬编码密码、API 密钥、token
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

let violations = 0
const filesScanned = []

function scanFile(filePath) {
  const ext = extname(filePath)
  if (!SCAN_EXTENSIONS.has(ext)) return

  // 跳过测试文件和配置文件
  if (filePath.includes('.test.') || filePath.includes('.spec.') || filePath.includes('test/setup')) {
    return
  }

  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  lines.forEach((line, index) => {
    // 跳过注释行
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return
    }

    for (const pattern of PATTERNS) {
      if (pattern.regex.test(line)) {
        const relPath = filePath.replace(process.cwd() + '/', '')
        console.error(`  ✗ ${relPath}:${index + 1} — ${pattern.name}`)
        console.error(`    ${trimmed}`)
        violations++
      }
    }
  })

  filesScanned.push(filePath)
}

function scanDir(dir) {
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      scanDir(fullPath)
    } else {
      scanFile(fullPath)
    }
  }
}

console.log('🔍 扫描源码中的硬编码敏感信息...\n')

try {
  scanDir(SRC_DIR)
} catch (e) {
  console.error(`扫描失败: ${e.message}`)
  process.exit(1)
}

console.log(`\n扫描完成: ${filesScanned.length} 个文件`)

if (violations > 0) {
  console.error(`\n❌ 发现 ${violations} 个违规项`)
  process.exit(1)
} else {
  console.log('✅ 未发现硬编码敏感信息')
  process.exit(0)
}
