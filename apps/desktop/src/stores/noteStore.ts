import { create } from 'zustand'
import type { Note, TagWithCount, FeedItem } from '@lumina/shared'
import { feedService, type FeedFilter } from '../services/feedService'
import { noteService, tagService } from '../services/noteService'

interface NoteState {
  notes: Note[]
  loaded: boolean
  feed: FeedItem[]
  feedTotal: number
  feedHasMore: boolean
  feedOffset: number
  feedFilter: FeedFilter
  selectedId: string | null
  tags: TagWithCount[]
  loadFeed: (reset?: boolean) => Promise<void>
  setFeedFilter: (filter: FeedFilter) => void
  loadNotes: () => Promise<void>
  loadTags: () => Promise<void>
  createNote: (input: { title: string; content?: string; type?: Note['type']; tagIds?: string[] }) => Promise<string | null>
  updateNote: (input: { id: string; title?: string; content?: string }) => Promise<Note | null>
  deleteNote: (id: string) => Promise<boolean>
  createTag: (name: string, color?: string, parentId?: string) => Promise<boolean>
  setTagsForNote: (noteId: string, tagIds: string[]) => Promise<boolean>
  setSelected: (id: string | null) => void
  setNotes: (notes: Note[]) => void
  setTags: (tags: TagWithCount[]) => void
}

const PAGE_SIZE = 20

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  loaded: false,
  feed: [],
  feedTotal: 0,
  feedHasMore: false,
  feedOffset: 0,
  feedFilter: {},
  selectedId: null,
  tags: [],

  loadFeed: async (reset = false) => {
    try {
      const { feedOffset, feed, feedFilter } = get()
      const offset = reset ? 0 : feedOffset
      const page = await feedService.list(offset, PAGE_SIZE, feedFilter)
      set({
        feed: reset || offset === 0 ? page.items : [...feed, ...page.items],
        feedTotal: page.total,
        feedHasMore: page.hasMore,
        feedOffset: offset + page.items.length,
      })
    } catch (e) {
      console.error('loadFeed error', e)
    }
  },

  setFeedFilter: (filter) => {
    set({ feedFilter: { ...get().feedFilter, ...filter } })
    void get().loadFeed(true)
  },

  loadNotes: async () => {
    try {
      const notes = await noteService.list()
      set({ notes, loaded: true })
    } catch (e) {
      console.error('loadNotes error', e)
    }
  },

  loadTags: async () => {
    try {
      const tags = await tagService.list()
      set({ tags })
    } catch (e) {
      console.error('loadTags error', e)
    }
  },

  createNote: async (input) => {
    try {
      const { id } = await noteService.create(input)
      await get().loadFeed(true)
      await get().loadNotes()
      await get().loadTags()
      return id
    } catch (e) {
      console.error('createNote error', e)
      return null
    }
  },

  updateNote: async (input) => {
    try {
      const note = await noteService.update(input)
      await get().loadFeed(true)
      await get().loadNotes()
      return note
    } catch (e) {
      console.error('updateNote error', e)
      return null
    }
  },

  deleteNote: async (id) => {
    try {
      await noteService.remove(id)
      await get().loadFeed(true)
      await get().loadNotes()
      return true
    } catch (e) {
      console.error('deleteNote error', e)
      return false
    }
  },

  createTag: async (name, color, parentId) => {
    try {
      const result = await tagService.create(name, color, parentId)
      await get().loadTags()
      return result.ok
    } catch (e) {
      console.error('createTag error', e)
      return false
    }
  },

  setTagsForNote: async (noteId, tagIds) => {
    try {
      await noteService.setTags(noteId, tagIds)
      await get().loadFeed(true)
      return true
    } catch (e) {
      console.error('setTagsForNote error', e)
      return false
    }
  },

  setSelected: (id) => set({ selectedId: id }),
  setNotes: (notes) => set({ notes }),
  setTags: (tags) => set({ tags }),
}))