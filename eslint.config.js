import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // 2026-11-06 从忽略列表里摘掉 `*.config.ts` / `*.config.js`：根级配置文件此前完全在
    // lint 检查面之外，实踩两个静默缺陷：`vitest.config.ts` 与 `vite.config.ts` 里
    // 各有 7 个别名键重复定义（只以 ESbuild 告警形式漏出来），而重复键在 JS 里不报错、
    // 默默以后写的为准——两份映射一旦分叉就是「改了不生效」。现在由 no-dupe-keys 拦住。
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
      // 配置对象里的重复键：不报错、不告警，只会静默以一条覆盖另一条（本仓库实踩）。
      // 2026-11-06 实测：全仓 `src frontend` 开此规则的新增错误数为 0，故直接定为 error。
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
