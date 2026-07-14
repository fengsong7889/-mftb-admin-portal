import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/-mftb-admin-portal/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 3000,
    host: '0.0.0.0', // 允许局域网访问
    open: true,
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // 拆分第三方库为独立 chunk，配合页面懒加载按需加载
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // 图表库(@ant-design/charts 依赖 @antv/*，体积最大，仅报表/看板页用到)
          if (id.includes('@ant-design/charts') || id.includes('@antv')) return 'charts-vendor'
          // 流程图(仅算法流程页用到)
          if (id.includes('@xyflow')) return 'flow-vendor'
          // 地图(仅地图规划/瀑布流新增页用到)
          if (id.includes('leaflet')) return 'leaflet-vendor'
          // antd + React 合并同一 chunk，避免 antd 初始化时访问 React.version 的跨 chunk 时序问题
          if (
            id.includes('/antd/') || id.includes('@ant-design/icons') || id.includes('/rc-') ||
            id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')
          ) return 'antd-vendor'
          // React Router 单独拆分
          if (id.includes('/react-router')) return 'react-vendor'
          return 'vendor'
        },
      },
    },
  },
})
