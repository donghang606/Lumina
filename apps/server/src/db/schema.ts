import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core'

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''),
  content: text('content').notNull().default(''),
  type: text('type', { enum: ['card', 'note', 'bookmark', 'file'] }).notNull().default('note'),
  summary: text('summary'),
  status: text('status', { enum: ['draft', 'indexed', 'failed'] }).notNull().default('draft'),
  meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  color: text('color'),
  parentId: text('parent_id'),
  order: integer('order').notNull().default(0),
  createdAt: text('created_at').notNull(),
})

export const tagsOnNotes = sqliteTable('tags_on_notes', {
  noteId: text('note_id').references(() => notes.id, { onDelete: 'cascade' }),
  tagId: text('tag_id').references(() => tags.id, { onDelete: 'cascade' }),
  assignedBy: text('assigned_by', { enum: ['manual', 'auto'] }).notNull().default('manual'),
  confidence: real('confidence'),
})

export const noteLinks = sqliteTable('note_links', {
  id: text('id').primaryKey(),
  sourceNoteId: text('source_note_id').references(() => notes.id, { onDelete: 'cascade' }),
  targetNoteId: text('target_note_id').references(() => notes.id, { onDelete: 'cascade' }),
  context: text('context'),
  createdAt: text('created_at').notNull(),
})

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  noteId: text('note_id').references(() => notes.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull().default('application/octet-stream'),
  size: integer('size').notNull().default(0),
  storageKey: text('storage_key').notNull(),
  createdAt: text('created_at').notNull(),
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''),
  model: text('model').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system', 'tool'] }).notNull(),
  content: text('content').notNull().default(''),
  toolCalls: text('tool_calls', { mode: 'json' }).$type<unknown[]>(),
  createdAt: text('created_at').notNull(),
})

export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  title: text('title').notNull().default(''),
  description: text('description'),
  siteName: text('site_name'),
  favicon: text('favicon'),
  content: text('content').notNull().default(''),
  noteId: text('note_id').references(() => notes.id, { onDelete: 'cascade' }),
  collectedAt: text('collected_at').notNull(),
})

export const aiProviders = sqliteTable('ai_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['openai', 'anthropic', 'ollama', 'deepseek', 'custom'] }).notNull(),
  apiKey: text('api_key').notNull().default(''),
  baseUrl: text('base_url'),
  models: text('models', { mode: 'json' }).$type<string[]>().default([]),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  order: integer('order').notNull().default(0),
})

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  theme: text('theme', { enum: ['light', 'dark'] }).notNull().default('light'),
  skin: text('skin', { enum: ['glass', 'nothing', 'bloomberg', 'effect'] }).notNull().default('glass'),
  locale: text('locale').notNull().default('zh-CN'),
  autoTag: integer('auto_tag', { mode: 'boolean' }).notNull().default(true),
  autoSummary: integer('auto_summary', { mode: 'boolean' }).notNull().default(true),
  autoClassify: integer('auto_classify', { mode: 'boolean' }).notNull().default(false),
  defaultProviderId: text('default_provider_id'),
  defaultModel: text('default_model'),
  taskModels: text('task_models', { mode: 'json' }).$type<Record<string, string>>().default({}),
  serverUrl: text('server_url'),
  sttEnabled: integer('stt_enabled', { mode: 'boolean' }).notNull().default(false),
  sttBaseUrl: text('stt_base_url'),
  sttApiKey: text('stt_api_key'),
  sttModel: text('stt_model'),
})

export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  command: text('command').notNull(),
  args: text('args', { mode: 'json' }).$type<string[]>().default([]),
  env: text('env', { mode: 'json' }).$type<Record<string, string>>().default({}),
  tools: text('tools', { mode: 'json' }).$type<string[]>().default([]),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
})

export const noteBlocks = sqliteTable('note_blocks', {
  id: text('id').primaryKey(),
  noteId: text('note_id').references(() => notes.id, { onDelete: 'cascade' }),
  index: integer('idx').notNull().default(0),
  chunkContent: text('chunk_content').notNull(),
  embedding: blob('embedding'),
  tokenCount: integer('token_count').notNull().default(0),
})

/** 块级引用：从 source 笔记引用 target 笔记的某个块（note_blocks.id） */
export const blockRefs = sqliteTable('block_refs', {
  id: text('id').primaryKey(),
  sourceNoteId: text('source_note_id').references(() => notes.id, { onDelete: 'cascade' }),
  targetNoteId: text('target_note_id').references(() => notes.id, { onDelete: 'cascade' }),
  targetBlockId: text('target_block_id').references(() => noteBlocks.id, { onDelete: 'cascade' }),
  context: text('context'),
  createdAt: text('created_at').notNull(),
})

/** 保存的查询视图：按标签 / 关键词 / 最近 / 链接聚合笔记 */
export const views = sqliteTable('views', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['tag', 'keyword', 'recent', 'backlink'] }).notNull(),
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/** 已注册的同步设备（本地优先 / 多端合并用） */
export const syncDevices = sqliteTable('sync_devices', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  createdAt: text('created_at').notNull(),
})

/** 删除墓碑：记录已删除的笔记 id，用于跨端合并时传播删除 */
export const noteTombstones = sqliteTable('note_tombstones', {
  noteId: text('note_id').primaryKey(),
  deletedAt: text('deleted_at').notNull(),
  deletedBy: text('deleted_by').notNull(),
})