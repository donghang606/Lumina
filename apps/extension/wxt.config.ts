import { defineConfig } from 'wxt'

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Lumina 收藏',
    description: '一键收藏网页到 Lumina 个人知识库',
    version: '0.1.0',
    permissions: ['activeTab', 'storage'],
    host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: '收藏到 Lumina',
    },
  },
})