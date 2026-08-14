import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GraphPage from './GraphPage'
import type { GraphData } from '@lumina/shared'

const graphData: GraphData = {
  nodes: [
    { id: 'n1', title: '笔记A', type: 'note', summary: null, createdAt: '2026-08-01', degree: 2, tagCount: 1 },
    { id: 'c1', title: '卡片B', type: 'card', summary: null, createdAt: '2026-08-02', degree: 1, tagCount: 0 },
    { id: 'b1', title: '收藏C', type: 'bookmark', summary: null, createdAt: '2026-08-03', degree: 0, tagCount: 0 },
  ],
  edges: [
    { id: 'e1', sourceNoteId: 'n1', targetNoteId: 'c1', context: null, createdAt: '2026-08-01' },
  ],
}

const services = {
  getGraphData: vi.fn(),
  expandNode: vi.fn(),
  stats: vi.fn(),
  getById: vi.fn(),
}

vi.mock('../../services/feedService', () => ({
  graphService: {
    getGraphData: (...a: unknown[]) => services.getGraphData(...a),
    expandNode: (...a: unknown[]) => services.expandNode(...a),
  },
}))

vi.mock('../../services/noteService', () => ({
  noteService: {
    stats: (...a: unknown[]) => services.stats(...a),
    getById: (...a: unknown[]) => services.getById(...a),
  },
}))

const layoutMock = { setNav: vi.fn() }
vi.mock('../../stores/layoutStore', () => ({
  useLayoutStore: (selector: any) => selector(layoutMock),
}))

const noteStoreMock = { setSelected: vi.fn() }
vi.mock('../../stores/noteStore', () => ({
  useNoteStore: Object.assign(() => noteStoreMock, { getState: () => noteStoreMock }),
}))

vi.mock('d3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('d3')>()
  const makeSim = () => {
    const sim: any = {
      _tick: null,
      force: () => sim,
      alphaTarget: () => sim,
      restart: () => sim,
      stop: vi.fn(),
      on: (evt: string, cb: any) => {
        if (evt === 'tick' && cb) sim._tick = cb
        return sim
      },
    }
    return sim
  }
  return { ...actual, forceSimulation: vi.fn(() => makeSim()) }
})

describe('GraphPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    services.getGraphData.mockResolvedValue(graphData)
    services.stats.mockResolvedValue({ total: 3, today: 1, byType: {} })
  })

  it('renders stats and filter buttons after load', async () => {
    render(<GraphPage />)
    await waitFor(() => {
      expect(screen.getByText(/笔记 3 · 今日 \+1/)).toBeDefined()
    })
    expect(screen.getByText('全部')).toBeDefined()
    expect(screen.getByText('笔记')).toBeDefined()
    expect(screen.getByText('卡片')).toBeDefined()
    expect(screen.getByText('收藏')).toBeDefined()
    expect(screen.getByText('文件')).toBeDefined()
  })

  it('renders all nodes as svg groups', async () => {
    const { container } = render(<GraphPage />)
    await waitFor(() => {
      expect(container.querySelectorAll('svg > g > g > g')).toHaveLength(3)
    })
  })

  it('filters nodes by type when filter clicked', async () => {
    const { container } = render(<GraphPage />)
    await waitFor(() => {
      expect(container.querySelectorAll('svg > g > g > g')).toHaveLength(3)
    })
    fireEvent.click(screen.getByText('卡片'))
    await waitFor(() => {
      expect(container.querySelectorAll('svg > g > g > g')).toHaveLength(1)
    })
  })

  it('reloads graph data on reset click', async () => {
    render(<GraphPage />)
    await waitFor(() => {
      expect(services.getGraphData).toHaveBeenCalledTimes(1)
    })
    fireEvent.click(screen.getByTitle('重置布局'))
    await waitFor(() => {
      expect(services.getGraphData).toHaveBeenCalledTimes(2)
    })
  })

  it('opens a node: fetches note, selects it and navigates to notes', async () => {
    services.getById.mockResolvedValue({ id: 'n1', title: '笔记A' })
    const { container } = render(<GraphPage />)
    await waitFor(() => {
      expect(container.querySelectorAll('svg > g > g > g')).toHaveLength(3)
    })
    const nodeG = container.querySelectorAll('svg > g > g > g')[0] as SVGGElement
    fireEvent.click(nodeG)
    await waitFor(() => {
      expect(services.getById).toHaveBeenCalled()
      expect(noteStoreMock.setSelected).toHaveBeenCalled()
      expect(layoutMock.setNav).toHaveBeenCalledWith('notes')
    })
  })
})