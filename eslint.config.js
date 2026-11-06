import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // 2026-11-06 从忽略列表里摘掉 `*.config.ts` / `*.config.js`：根级配置文件此前双重隐身 ——
    // ESLint 不查它（本条 ignore + `lint` 脚本只跑 `eslint src frontend`），tsc 也不查它
    // （tsconfig 的 include 只有 `src` 与 `frontend/*/src`）。正是这个空档让
    // `vitest.config.ts` 与 `vite.config.ts` 各有 7 个别名键重复定义长期存活，
    // 只以每次跑测试时的 esbuild Duplicate key 告警形式漏出来。
    // 已确认 src/ 与 frontend/ 下没有匹配该命名的文件，所以摘掉只影响 4 个根配置文件本身。
    ignores: ['dist/', 'node_modules/', 'public/'],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2021,
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // 【为什么必须显式重新开启】extends 的两套 recommended 是生效的，但 typescript-eslint
      // recommended 会故意关掉 22 条「认为 tsc 能报」的核心规则，no-dupe-keys 就在这个名单里。
      // 那个前提对 src/ 与 frontend/ 成立，对不在 tsconfig include 内的根配置文件不成立：
      // ESLint 交给 tsc、tsc 不看这些文件，两边都以为对方管——所以这里手动接回来。
      // 2026-11-06 实测：全仓 `src frontend` 开此规则的新增错误数 = 0，故直接定 error 不添欠债。
      'no-dupe-keys': 'error',
      // React Hooks 核心規則（error）
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // React Compiler 規則暫時 off（項目未啟用 React Compiler babel 插件，待引入後漸進修復）
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/config': 'off',
      'react-hooks/gating': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // 上面的块只匹配 `**/*.{ts,tsx}`，不覆盖 `eslint.config.js` 这类 JS 配置。
    // 而「同一条规则写两遍」恰恰发生在这个文件自己的 rules 里（后写为准，静默生效），
    // 所以单独给 JS 配置文件开这一条（ESLint 默认 espree 解析器就够）。
    files: ['**/*.config.js', '**/*.config.cjs', '**/*.config.mjs'],
    rules: { 'no-dupe-keys': 'error' },
  },
)
