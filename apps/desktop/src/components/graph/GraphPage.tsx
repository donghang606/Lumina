import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Typography, Spin } from '@arco-design/web-react'
import { RotateCcw } from 'lucide-react'
import { graphService } from '../../services/feedService'
import { noteService } from '../../services/noteService'
import { useLayoutStore } from '../../stores/layoutStore'
import { useNoteStore } from '../../stores/noteStore'
import { filterEdgesByNodes, toForceEdges } from '../../lib/graph'
import { Glass } from '../ui/primitives'
import type { GraphData, Note } from '@lumina/shared'

const { Text } = Typography

const typeColor: Record<string, string> = {
  note: 'var(--accent)',
  card: 'var(--warning)',
  bookmark: 'var(--success)',
  file: 'var(--text-2)',
}

const typeLabel: Record<string, string> = {
  card: '卡片',
  note: '笔记',
  bookmark: '收藏',
  file: '文件',
}

export default function GraphPage() {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<{ total: number; today: number } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | Note['type']>('all')
  const draggedRef = useRef(false)
  const setNav = useLayoutStore((s) => s.setNav)

  useEffect(() => {
    let disposed = false
    void (async () => {
      try {
        const [gd, st] = await Promise.all([
          graphService.getGraphData(200),
          noteService.stats(),
        ])
        if (disposed) return
        setData(gd)
        setStats({ total: st.total, today: st.today })
        setLoading(false)
      } catch {
        setLoading(false)
      }
    })()
    return () => {
      disposed = true
    }
  }, [])

  const viewData = useMemo(() => {
    if (!data) return data
    const nodes = data.nodes.filter((n) => filter === 'all' || n.type === filter)
    return {
      nodes,
      edges: filterEdgesByNodes(data.edges, nodes.map((n) => n.id)),
    }
  }, [data, filter])

  const reload = async () => {
    setLoading(true)
    try {
      setData(await graphService.getGraphData(200))
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }

  const expandNode = async (id: string) => {
    try {
      const res = await graphService.expandNode(id)
      if (res.nodes.length === 0) return
      setData((prev) => {
        if (!prev) return prev
        const nodeMap = new Map(prev.nodes.map((n) => [n.id, n]))
        for (const n of res.nodes) if (!nodeMap.has(n.id)) nodeMap.set(n.id, n)
        const seen = new Set(prev.edges.map((e) => e.id))
        const edges = [...prev.edges]
        for (const e of res.edges) {
          if (!seen.has(e.id)) {
            seen.add(e.id)
            edges.push(e)
          }
        }
        return { nodes: [...nodeMap.values()], edges }
      })
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!viewData || !svgRef.current || !containerRef.current) return
    const svg = svgRef.current
    const width = containerRef.current.clientWidth
    const height = containerRef.current.clientHeight || 600
    const isDark = document.body.getAttribute('arco-theme') === 'dark'

    const nodeRgb = (c: string) => {
      const m = c.match(/^var\(--([a-z]+)\)$/)
      if (!m) return c
      const v = getComputedStyle(document.body).getPropertyValue(`--${m[1]}`).trim()
      return v || c
    }

    d3.select(svg).selectAll('*').remove()

    const g = d3.select(svg).append('g')

    const edges = toForceEdges(viewData.edges)

    const sim = d3
      .forceSimulation(viewData.nodes as never)
      .force('link', d3.forceLink(edges as never).id((n: any) => n.id as string).distance(90))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(60))

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 3]).on('zoom', (ev: d3.D3ZoomEvent<SVGSVGElement, unknown>) => g.attr('transform', String(ev.transform)))
    d3.select(svg).call(zoom)
    d3.select(svg).on('dblclick.zoom', null)

    const edge = g
      .append('g')
      .selectAll('line')
      .data(edges as any)
      .join('line')
      .attr('stroke', isDark ? 'rgba(148,184,255,0.22)' : 'rgba(23,43,77,0.16)')
      .attr('stroke-width', 1.2)
      .attr('opacity', 0.7)

    const node = g
      .append('g')
      .selectAll('g')
      .data(viewData.nodes as any)
      .join('g')
      .style('cursor', 'pointer')

    node
      .append('circle')
      .attr('r', (n: any) => Math.max(8, Math.min(20, 8 + (n.degree ?? 0) * 2)))
      .attr('fill', (n: any) => nodeRgb(typeColor[n.type] ?? 'var(--text-2)'))
      .attr('fill-opacity', 0.9)
      .attr('stroke', isDark ? '#0d1220' : '#fff')
      .attr('stroke-width', 2)

    node
      .append('circle')
      .attr('r', (n: any) => Math.max(8, Math.min(20, 8 + (n.degree ?? 0) * 2)) + 7)
      .attr('fill', 'none')
      .attr('stroke', (n: any) => nodeRgb(typeColor[n.type] ?? 'var(--text-2)'))
      .attr('stroke-width', 1)
      .attr('opacity', isDark ? 0.3 : 0.35)

    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 32)
      .attr('font-size', 11)
      .attr('font-family', 'var(--font-body)')
      .attr('fill', isDark ? 'rgba(232,238,252,0.72)' : 'rgba(24,34,48,0.66)')
      .text((n: any) => (n.title?.length > 14 ? n.title.slice(0, 13) + '…' : n.title || '(无标题)'))

    const tooltip = d3.select(containerRef.current).selectAll('.lumina-graph-tooltip').data([0]).join('div').attr('class', 'lumina-graph-tooltip')

    // 节点拖拽：固定坐标参与模拟
    const drag = d3
      .drag<SVGGElement, unknown>()
      .on('start', (ev, d) => {
        const nd = d as unknown as { x: number; y: number; fx?: number | null; fy?: number | null }
        if (!ev.active) sim.alphaTarget(0.3).restart()
        nd.fx = nd.x
        nd.fy = nd.y
        draggedRef.current = false
      })
      .on('drag', (ev, d) => {
        const nd = d as unknown as { x: number; y: number; fx?: number | null; fy?: number | null }
        nd.fx = ev.x
        nd.fy = ev.y
        draggedRef.current = true
      })
      .on('end', (ev, d) => {
        const nd = d as unknown as { x: number; y: number; fx?: number | null; fy?: number | null }
        if (!ev.active) sim.alphaTarget(0)
        nd.fx = null
        nd.fy = null
      })

    node.call(drag as never)

    node
      .on('click', (_ev: unknown, n: any) => {
        if (draggedRef.current) {
          draggedRef.current = false
          return
        }
        setSelected(n.id)
        void openSelected(n.id)
      })
      .on('dblclick', (_ev: unknown, n: any) => {
        void expandNode(n.id)
      })
      .on('mousemove', (ev: MouseEvent, n: any) => {
        const rect = (containerRef.current as HTMLDivElement).getBoundingClientRect()
        tooltip
          .style('opacity', 1)
          .style('left', `${Math.min(ev.clientX - rect.left + 14, rect.width - 252)}px`)
          .style('top', `${Math.min(ev.clientY - rect.top + 14, rect.height - 120)}px`)
          .html(
            `<b>${n.title || '(无标题)'}</b><br/><span style="opacity:0.6">${typeLabel[n.type] ?? n.type} · 连接 ${n.degree} · 标签 ${n.tagCount}</span>${n.summary ? `<div style="margin-top:4px;opacity:0.8">${String(n.summary).slice(0, 80)}</div>` : ''}`,
          )
      })
      .on('mouseleave', () => tooltip.style('opacity', 0))

    sim.on('tick', () => {
      edge
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)
      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    return () => {
      sim.stop()
    }
  }, [viewData])

  const openSelected = async (id: string) => {
    const note = await noteService.getById(id)
    if (!note) return
    useNoteStore.getState().setSelected(id)
    setNav('notes')
  }

  return (
    <Glass style={{ position: 'relative', height: 'calc(100vh - 150px)', minHeight: 480, overflow: 'hidden', padding: 0 }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)' }}>
          <Spin />
        </div>
      )}

      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
        {stats && (
          <div
            style={{
              position: 'absolute',
              top: 14,
              left: 14,
              zIndex: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <span className="glass" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}>
              笔记 {stats.total} · 今日 +{stats.today}
            </span>
            <div className="glass" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 4, borderRadius: 'var(--radius-pill)', width: 'fit-content' }}>
              {(['all', 'note', 'card', 'bookmark', 'file'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  style={{
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 'var(--text-sm)',
                    color: filter === t ? '#fff' : 'var(--text-2)',
                    background: filter === t ? 'var(--accent)' : 'transparent',
                  }}
                >
                  {t === 'all' ? '全部' : typeLabel[t]}
                </button>
              ))}
              <button
                onClick={() => void reload()}
                title="重置布局"
                style={{ border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-sm)', color: 'var(--text-3)', background: 'transparent' }}
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </div>
        )}

        <svg ref={svgRef} width="100%" height="100%" style={{ background: 'transparent' }} />
        <div style={{ position: 'absolute', bottom: 12, left: 14, zIndex: 2, fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
          单击打开笔记 · 双击展开关联 · 拖拽调整布局 · 滚轮缩放
        </div>
      </div>

      <style>{`
        .lumina-graph-tooltip {
          position: absolute; left: 0; top: 0;
          background: var(--glass-bg);
          -webkit-backdrop-filter: var(--glass-blur);
          backdrop-filter: var(--glass-blur);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-md);
          padding: 10px 14px;
          box-shadow: var(--shadow-3);
          font-size: var(--text-md);
          line-height: 1.5;
          color: var(--text-1);
          opacity: 0; pointer-events: none;
          transition: opacity var(--dur-2) var(--ease-out);
          z-index: 3; max-width: 240px;
        }
      `}</style>
    </Glass>
  )
}