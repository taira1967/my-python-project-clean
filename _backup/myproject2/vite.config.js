import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,  // ポートを固定
    host: true   // ネットワークアクセスを有効化
  },
  optimizeDeps: {
    // 依存関係の最適化をスキップ（開発時のみ）
    force: false
  },
  logLevel: 'info'  // より詳細なログを表示
})
