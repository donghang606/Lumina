import { useEffect, useRef, useState } from 'react'
import { Typography, Form, Input, Select, Switch, Button, Tabs, Table, Message, Space, Modal, Tag } from '@arco-design/web-react'
import { Settings as SettingsIcon, Plus, Zap, Server, Palette, Sparkles, BrainCircuit, RefreshCw, Trash2, Database } from 'lucide-react'
import { configService } from '../../services/configService'
import { aiService } from '../../services/aiService'
import { noteService } from '../../services/noteService'
import { mcpService } from '../../services/mcpService'
import { transferService, type ExportItem } from '../../services/transferService'
import { setServerUrl, getServerUrlRaw } from '../../lib/trpc'
import { parseMarkdown, toMarkdown, sanitizeFilename } from '../../lib/markdown'
import { useTheme } from '../../hooks/useTheme'
import { Glass } from '../ui/primitives'
import type { AiProvider, McpServer } from '@lumina/shared'

const { Text } = Typography
const FormItem = Form.Item

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null)
  const [providers, setProviders] = useState<AiProvider[]>([])
  const [mcps, setMcps] = useState<McpServer[]>([])
  const [reload, setReload] = useState(0)
  const [providerModal, setProviderModal] = useState<AiProvider | 'new' | null>(null)
  const [mcpModal, setMcpModal] = useState<McpServer | 'new' | null>(null)
  const [form] = Form.useForm()
  const [aiStatus, setAiStatus] = useState<{ ready: boolean; provider: string; model: string; reason?: string | null; rag?: { hasEmbeddings: boolean } } | null>(null)
  const [testing, setTesting] = useState(false)
  const [embedding, setEmbedding] = useState(false)
  const [mcpTools, setMcpTools] = useState<string>('')
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const { setSkin } = useTheme()
  const [serverUrlLocal, setServerUrlLocal] = useState(getServerUrlRaw)

  const testMcpTools = async () => {
    const tools = await mcpService.listTools()
    if (tools.length === 0) {
      Message.info('未发现工具（无启用中的 MCP Server）')
      setMcpTools('')
    } else {
      Message.success(`发现 ${tools.length} 个工具`)
      setMcpTools(tools.map((t) => `${t.name}（${t.server}）`).join('、'))
    }
  }

  const testAi = async () => {
    setTesting(true)
    try {
      const s = await aiService.status()
      setAiStatus(s)
      if (s.ready) Message.success(`${s.provider} · ${s.model} 就绪`)
      else Message.warning(s.reason ?? '未就绪')
    } catch {
      setAiStatus({ ready: false, provider: '', model: '', reason: '无法连接服务端' })
    } finally {
      setTesting(false)
    }
  }

  const embedAll = async () => {
    setEmbedding(true)
    try {
      const r = await noteService.embedAll()
      if (r.ok) {
        Message.success(`已向量化 ${r.embedded ?? 0} 篇笔记，语义检索已生效`)
        await testAi()
      } else Message.error(r.reason ?? '向量化失败（需先配置可用的 Embeddings 服务商）')
    } catch {
      Message.error('向量化失败，请确认服务端已启动')
    } finally {
      setEmbedding(false)
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const [s, p, m] = await Promise.all([
          configService.getSettings(),
          configService.listProviders(),
          configService.listMcpServers(),
        ])
        setSettings(s)
        setProviders(p)
        setMcps(m)
      } catch {
        Message.error('无法加载设置，请确认服务端已启动')
      }
    })()
  }, [reload])

  const saveSettings = async (values: any) => {
    await configService.updateSettings(values)
    if (values.skin) setSkin(values.skin)
    await configService.getSettings().then(setSettings)
    Message.success('设置已保存')
  }

  const openProvider = (p: AiProvider | 'new') => {
    setProviderModal(p)
    if (p === 'new') {
      form.setFieldsValue({ name: '', type: 'openai', apiKey: '', baseUrl: '', models: '', isActive: false })
    } else {
      form.setFieldsValue({ name: p.name, type: p.type, apiKey: '', baseUrl: p.baseUrl ?? '', models: p.models.join(','), isActive: p.isActive })
    }
  }

  const saveProvider = async () => {
    const v = await form.validate()
    const payload = {
      id: providerModal === 'new' ? undefined : (providerModal as AiProvider).id,
      name: v.name as string,
      type: v.type,
      apiKey: (v.apiKey as string) ?? '',
      baseUrl: (v.baseUrl as string) || null,
      models: (v.models as string).split(',').map((m: string) => m.trim()).filter(Boolean),
      isActive: v.isActive as boolean,
    }
    await configService.upsertProvider(payload)
    setProviderModal(null)
    setReload((r) => r + 1)
    Message.success('Provider 已保存')
  }

  const deleteProvider = async (id: string) => {
    await configService.deleteProvider(id)
    setReload((r) => r + 1)
  }

  const openMcp = (m: McpServer | 'new') => {
    setMcpModal(m)
    if (m === 'new') {
      form.setFieldsValue({ name: '', command: '', args: '', isActive: false })
    } else {
      form.setFieldsValue({ name: m.name, command: m.command, args: m.args.join(' '), isActive: m.isActive })
    }
  }

  const saveMcp = async () => {
    const v = await form.validate()
    const payload = {
      id: mcpModal === 'new' ? undefined : (mcpModal as McpServer).id,
      name: v.name as string,
      command: v.command as string,
      args: (v.args as string).split(' ').map((a: string) => a.trim()).filter(Boolean),
      isActive: v.isActive as boolean,
    }
    await configService.upsertMcpServer(payload)
    setMcpModal(null)
    setReload((r) => r + 1)
    Message.success('MCP Server 已保存')
  }

  const deleteMcp = async (id: string) => {
    await configService.deleteMcpServer(id)
    setReload((r) => r + 1)
  }

  const saveServerUrl = (url: string) => {
    setServerUrlLocal(url)
    setServerUrl(url)
    void configService.updateSettings({ serverUrl: url || null })
  }

  const download = (name: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const doExportJson = async () => {
    setExporting(true)
    try {
      const res = await transferService.exportNotes()
      const date = new Date().toISOString().slice(0, 10)
      download(`lumina-export-${date}.json`, JSON.stringify(res, null, 2), 'application/json')
      Message.success(`已导出 ${res.items.length} 篇笔记`)
    } catch {
      Message.error('导出失败，请确认服务端已启动')
    } finally {
      setExporting(false)
    }
  }

  const doExportMarkdown = async () => {
    setExporting(true)
    try {
      const res = await transferService.exportNotes()
      const picker = (window as any).showDirectoryPicker
      if (typeof picker === 'function') {
        const dir = await picker({ mode: 'readwrite' })
        for (const item of res.items) {
          const file = await dir.getFileHandle(`${sanitizeFilename(item.title)}.md`, { create: true })
          const w = await file.createWritable()
          await w.write(toMarkdown(item))
          await w.close()
        }
        Message.success(`已导出 ${res.items.length} 个 .md 文件`)
      } else {
        download(`lumina-notes-${new Date().toISOString().slice(0, 10)}.md`, res.items.map((i) => toMarkdown(i)).join('\n\n---\n\n'), 'text/markdown')
        Message.success('当前浏览器不支持选择文件夹，已合并下载为单个 .md 文件')
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') Message.error('导出失败，请确认服务端已启动')
    } finally {
      setExporting(false)
    }
  }

  const doImport = async (files: FileList | null) => {
    if (!files?.length) return
    setImporting(true)
    try {
      const items: ExportItem[] = []
      for (const file of Array.from(files)) {
        const raw = await file.text()
        const name = file.name.replace(/\.(md|markdown)$/i, '')
        if (file.name.toLowerCase().endsWith('.json')) {
          try {
            const parsed = JSON.parse(raw)
            const list = parsed.items ?? (Array.isArray(parsed) ? parsed : [])
            for (const it of list) {
              if (!it?.title && !it?.content) continue
              items.push({
                title: it.title ?? name,
                type: ['card', 'note', 'bookmark', 'file'].includes(it.type) ? it.type : 'note',
                content: it.content ?? '',
                tags: Array.isArray(it.tags) ? it.tags : [],
                createdAt: it.createdAt ?? null,
                updatedAt: it.updatedAt ?? null,
                meta: it.meta ?? {},
              })
            }
          } catch {
            Message.error(`${file.name} 不是有效的 JSON 备份`)
          }
        } else {
          const md = parseMarkdown(raw, name)
          items.push({ title: md.title, type: md.type, content: md.content, tags: md.tags, createdAt: md.createdAt ?? null, updatedAt: null, meta: {} })
        }
      }
      if (items.length === 0) {
        Message.warning('未识别到可导入的笔记')
        return
      }
      const res = await transferService.importNotes(items)
      Message.success(`导入完成：共 ${items.length} 条，新增 ${res.imported} 篇（重名已跳过）`)
      setReload((r) => r + 1)
    } catch {
      Message.error('导入失败，请确认服务端已启动')
    } finally {
      setImporting(false)
      if (importRef.current) importRef.current.value = ''
    }
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-5)' }}>
        <SettingsIcon size={22} color="var(--accent)" />
        <Text className="display" style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-1)' }}>
          设置
        </Text>
      </div>

      <Tabs defaultActiveTab="appearance">
        <Tabs.TabPane key="appearance" title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Palette size={13} /> 外观</span>}>
          <Glass style={{ padding: 'var(--sp-5)' }}>
            <div className="lumina-label" style={{ marginBottom: 'var(--sp-4)' }}>通用设置</div>
            {settings && (
              <Form layout="vertical" initialValues={settings} onValuesChange={(_v, all) => void saveSettings(all)}>
                <FormItem label="皮肤" field="skin">
                  <Select style={{ width: 200 }}>
                    <Select.Option value="glass">Glass（科技玻璃）</Select.Option>
                    <Select.Option value="nothing">Nothing（极简工业）</Select.Option>
                    <Select.Option value="bloomberg">Bloomberg（终端）</Select.Option>
                    <Select.Option value="effect">Effect（赛博玻璃）</Select.Option>
                  </Select>
                </FormItem>
                <FormItem label="语言" field="locale">
                  <Select style={{ width: 200 }}>
                    <Select.Option value="zh-CN">中文</Select.Option>
                    <Select.Option value="en-US">English</Select.Option>
                  </Select>
                </FormItem>
                <FormItem label="自动打标签" field="autoTag" triggerPropName="checked">
                  <Switch />
                </FormItem>
                <FormItem label="自动摘要" field="autoSummary" triggerPropName="checked">
                  <Switch />
                </FormItem>
                <FormItem label="自动四象限分类" field="autoClassify" triggerPropName="checked">
                  <Switch />
                </FormItem>
              </Form>
            )}
          </Glass>
        </Tabs.TabPane>

        <Tabs.TabPane key="ai" title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={13} /> AI Providers</span>}>
          <Glass style={{ padding: 'var(--sp-5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
              <div className="lumina-label">AI 服务商</div>
              <Space>
                <Button size="small" loading={testing} onClick={() => void testAi()}>
                  测试连接
                </Button>
                <Button size="small" type="primary" onClick={() => void openProvider('new')}>
                  ＋ 添加
                </Button>
              </Space>
            </div>

            {aiStatus && (
              <div
                style={{
                  padding: '12px 14px',
                  marginBottom: 'var(--sp-4)',
                  borderRadius: 'var(--radius-md)',
                  background: aiStatus.ready ? 'color-mix(in srgb, var(--success) 10%, transparent)' : 'color-mix(in srgb, var(--warning) 10%, transparent)',
                  border: `1px solid ${aiStatus.ready ? 'color-mix(in srgb, var(--success) 40%, transparent)' : 'color-mix(in srgb, var(--warning) 40%, transparent)'}`,
                  fontSize: 'var(--text-md)',
                  color: 'var(--text-1)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BrainCircuit size={15} color={aiStatus.ready ? 'var(--success)' : 'var(--warning)'} />
                  {aiStatus.ready
                    ? `当前生效：${aiStatus.provider} · ${aiStatus.model}（对话 / 摘要 / 标签 / 转写均可用）`
                    : aiStatus.reason && `${aiStatus.reason}`}
                </div>
                <div style={{ marginTop: 'var(--sp-2)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}>
                    RAG 语义检索：{aiStatus?.rag?.hasEmbeddings ? '已向量化部分笔记' : '尚未向量化'}
                  </span>
                  <Button size="mini" loading={embedding} disabled={!aiStatus?.ready} onClick={() => void embedAll()}>
                    向量化全部笔记
                  </Button>
                </div>
              </div>
            )}
            {providers.length === 0 && <Text type="secondary">暂无 AI Provider，添加一个开始使用智能功能</Text>}
            <Table
              data={providers}
              pagination={false}
              rowKey="id"
              columns={[
                {
                  title: '名称',
                  dataIndex: 'name',
                  render: (_, r: AiProvider) => (
                    <Space>
                      <Text>{r.name}</Text>
                      {r.isActive && <Tag color="green">活跃</Tag>}
                    </Space>
                  ),
                },
                { title: '类型', dataIndex: 'type', render: (v: string) => <Text>{v}</Text> },
                { title: '模型', dataIndex: 'models', render: (v: string[]) => <Text>{v.join(', ')}</Text> },
                {
                  title: '操作',
                  render: (_, r: AiProvider) => (
                    <Space>
                      <Button size="mini" type="text" onClick={() => openProvider(r)}>编辑</Button>
                      <Button size="mini" type="text" status="danger" onClick={() => void deleteProvider(r.id)}>删除</Button>
                    </Space>
                  ),
                },
              ]}
            />
          </Glass>
        </Tabs.TabPane>

        <Tabs.TabPane key="mcp" title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Server size={13} /> MCP Servers</span>}>
          <Glass style={{ padding: 'var(--sp-5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
              <div className="lumina-label">MCP 工具服务</div>
              <Button size="small" type="primary" onClick={() => void openMcp('new')}>
                ＋ 添加
              </Button>
            </div>
            {mcps.length === 0 && <Text type="secondary">暂无 MCP Server。MCP 让 AI 可以调用外部工具。</Text>}
            <Button size="small" onClick={() => void testMcpTools()} style={{ marginBottom: 'var(--sp-3)' }}>
              检测已启用工具
            </Button>
            {mcpTools && (
              <div style={{ marginBottom: 'var(--sp-3)', fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}>
                可用工具：<Text style={{ color: 'var(--accent)' }}>{mcpTools}</Text>
              </div>
            )}
            <Table
              data={mcps}
              pagination={false}
              rowKey="id"
              columns={[
                {
                  title: '名称',
                  dataIndex: 'name',
                  render: (_, r: McpServer) => (
                    <Space>
                      <Text>{r.name}</Text>
                      {r.isActive && <Tag color="green">启用</Tag>}
                    </Space>
                  ),
                },
                { title: '命令', dataIndex: 'command', render: (v: string, r: McpServer) => <Text>{v} {r.args.join(' ')}</Text> },
                {
                  title: '操作',
                  render: (_, r: McpServer) => (
                    <Space>
                      <Button size="mini" type="text" onClick={() => openMcp(r)}>编辑</Button>
                      <Button size="mini" type="text" status="danger" onClick={() => void deleteMcp(r.id)}>删除</Button>
                    </Space>
                  ),
                },
              ]}
            />
          </Glass>
        </Tabs.TabPane>
        <Tabs.TabPane key="data" title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Database size={13} /> 数据</span>}>
          <Glass style={{ padding: 'var(--sp-5)' }}>
            <div className="lumina-label" style={{ marginBottom: 'var(--sp-3)' }}>服务器连接</div>
            <div style={{ marginBottom: 'var(--sp-4)' }}>
              <FormItem label="服务端地址" style={{ marginBottom: 8 }}>
                <Input
                  value={serverUrlLocal}
                  onChange={(v) => setServerUrlLocal(v)}
                  onBlur={() => saveServerUrl(serverUrlLocal)}
                  placeholder="http://localhost:3001（默认本地，留空使用默认）"
                  style={{ maxWidth: 420 }}
                />
              </FormItem>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', lineHeight: 1.7 }}>
                <p style={{ margin: 0 }}>默认连接本地服务端 <code>http://localhost:3001</code>。如需连接远程服务器，填入完整地址后回车保存。</p>
                <p style={{ margin: 'var(--sp-1) 0 0' }}>更改后立即生效，无需重启。</p>
              </div>
            </div>
            <div style={{ height: 1, background: 'var(--border-1)', margin: 'var(--sp-4) 0' }} />
            <div className="lumina-label" style={{ marginBottom: 'var(--sp-3)' }}>导出 / 导入</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 'var(--sp-3)' }}>
              <Button size="small" loading={exporting} onClick={() => void doExportJson()}>导出 JSON 备份</Button>
              <Button size="small" loading={exporting} onClick={() => void doExportMarkdown()}>导出 Markdown 到文件夹</Button>
              <Button size="small" type="primary" onClick={() => importRef.current?.click()} loading={importing}>
                导入笔记
              </Button>
              <input
                ref={importRef}
                type="file"
                accept=".md,.markdown,.json,application/json,text/markdown"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => void doImport(e.target.files)}
              />
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', lineHeight: 1.7 }}>
              <p style={{ margin: 0 }}>JSON 备份保留全部字段（含来源 URL、标签、创建时间），适合完整迁移与还原。</p>
              <p style={{ margin: 'var(--sp-1) 0 0' }}>Markdown 文件夹导出为 Obsidian 兼容格式（frontmatter 标签 + [[双链]]），可直接拖入 Obsidian；导入支持同格式反向解析。</p>
            </div>
          </Glass>
        </Tabs.TabPane>
      </Tabs>

      <Modal
        visible={providerModal !== null}
        title={providerModal === 'new' ? '添加 AI Provider' : '编辑 AI Provider'}
        onCancel={() => setProviderModal(null)}
        onOk={() => void saveProvider()}
        unmountOnExit
      >
        <Form form={form} layout="vertical">
          <FormItem label="名称" field="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如 OpenAI / 本地 Ollama" />
          </FormItem>
          <FormItem label="类型" field="type" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="openai">OpenAI</Select.Option>
              <Select.Option value="anthropic">Anthropic</Select.Option>
              <Select.Option value="deepseek">DeepSeek</Select.Option>
              <Select.Option value="ollama">Ollama (本地)</Select.Option>
              <Select.Option value="custom">自定义 (OpenAI 兼容)</Select.Option>
            </Select>
          </FormItem>
          <FormItem
            label="API Key"
            field="apiKey"
            extra={providerModal && providerModal !== 'new' && (providerModal as AiProvider).apiKey ? `已保存密钥 ${(providerModal as AiProvider).apiKey}，留空则保持不变` : '本地 AES 加密存储'}
          >
            <Input.Password placeholder={providerModal === 'new' ? '粘贴 API Key' : '留空则保持不变'} />
          </FormItem>
          <FormItem label="Base URL" field="baseUrl">
            <Input placeholder="如 https://api.openai.com/v1，本地可留空" />
          </FormItem>
          <FormItem label="模型（逗号分隔）" field="models">
            <Input placeholder="gpt-4o-mini, gpt-4o" />
          </FormItem>
          <FormItem label="设为默认 Provider" field="isActive" triggerPropName="checked">
            <Switch />
          </FormItem>
        </Form>
      </Modal>

      <Modal
        visible={mcpModal !== null}
        title={mcpModal === 'new' ? '添加 MCP Server' : '编辑 MCP Server'}
        onCancel={() => setMcpModal(null)}
        onOk={() => void saveMcp()}
        unmountOnExit
      >
        <Form form={form} layout="vertical">
          <FormItem label="名称" field="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如 filesystem / github" />
          </FormItem>
          <FormItem label="启动命令" field="command" rules={[{ required: true, message: '请输入命令' }]}>
            <Input placeholder="如 npx 或 /path/to/binary" />
          </FormItem>
          <FormItem label="参数（空格分隔）" field="args">
            <Input placeholder="-y @modelcontextprotocol/server-filesystem ~/Documents" />
          </FormItem>
          <FormItem label="启用" field="isActive" triggerPropName="checked">
            <Switch />
          </FormItem>
        </Form>
      </Modal>
    </div>
  )
}