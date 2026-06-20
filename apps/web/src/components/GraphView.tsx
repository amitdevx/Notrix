import React, { useEffect, useRef, useState } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import forceAtlas2 from 'graphology-layout-forceatlas2';

interface GraphViewProps {
  data: {
    nodes: { id: string; label: string; size: number }[];
    edges: { source: string; target: string }[];
  };
  onNodeClick: (nodeId: string) => void;
}

export function GraphView({ data, onNodeClick }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !data) return;

    const graph = new Graph();
    
    // Add nodes
    data.nodes.forEach((node) => {
      if (!graph.hasNode(node.id)) {
        graph.addNode(node.id, {
          x: Math.random(),
          y: Math.random(),
          size: Math.max(3, Math.min(15, node.size)),
          label: node.label,
          color: '#5E6AD2', // Brand Primary
        });
      }
    });

    // Add edges
    data.edges.forEach((edge) => {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        if (!graph.hasEdge(edge.source, edge.target)) {
          graph.addEdge(edge.source, edge.target, {
            size: 1,
            color: '#3F3F46', // Zinc-700
          });
        }
      }
    });

    // Run layout
    if (graph.order > 0) {
      forceAtlas2.assign(graph, {
        iterations: 100,
        settings: forceAtlas2.inferSettings(graph),
      });
    }

    const sigma = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: false,
      defaultEdgeColor: '#3F3F46',
      labelColor: { color: '#E4E4E7' },
      labelSize: 12,
      labelFont: 'Inter, sans-serif'
    });

    // Events
    sigma.on('clickNode', (e) => {
      onNodeClick(e.node);
    });

    sigma.on('enterNode', (e) => {
      setHoveredNode(e.node);
      document.body.style.cursor = 'pointer';
      
      const neighbors = new Set(graph.neighbors(e.node));
      neighbors.add(e.node);

      graph.forEachNode((node) => {
        if (neighbors.has(node)) {
          graph.setNodeAttribute(node, 'highlighted', true);
          graph.setNodeAttribute(node, 'color', '#8B94E5');
        } else {
          graph.setNodeAttribute(node, 'color', 'rgba(94, 106, 210, 0.15)');
        }
      });

      graph.forEachEdge((edge) => {
        if (graph.extremities(edge).some(n => n === e.node)) {
          graph.setEdgeAttribute(edge, 'color', '#5E6AD2');
          graph.setEdgeAttribute(edge, 'size', 2);
        } else {
          graph.setEdgeAttribute(edge, 'color', 'rgba(63, 63, 70, 0.2)');
        }
      });
    });

    sigma.on('leaveNode', () => {
      setHoveredNode(null);
      document.body.style.cursor = 'default';
      
      graph.forEachNode((node) => {
        graph.setNodeAttribute(node, 'highlighted', false);
        graph.setNodeAttribute(node, 'color', '#5E6AD2');
      });

      graph.forEachEdge((edge) => {
        graph.setEdgeAttribute(edge, 'color', '#3F3F46');
        graph.setEdgeAttribute(edge, 'size', 1);
      });
    });

    return () => {
      sigma.kill();
    };
  }, [data, onNodeClick]);

  return (
    <div className="w-full h-full relative" style={{ backgroundImage: 'radial-gradient(circle at center, var(--color-workspace-elevated) 0%, var(--color-workspace-bg) 100%)' }}>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute top-6 left-6 text-neutral-200 text-xs bg-workspace-panel/80 backdrop-blur-md px-4 py-3 rounded-xl shadow-floating border border-workspace-border pointer-events-none flex flex-col gap-1 transition-all">
        <div className="font-semibold text-neutral-100 uppercase tracking-widest text-[10px]">Knowledge Graph</div>
        <div className="text-neutral-400">{data.nodes.length} nodes · {data.edges.length} edges</div>
        {hoveredNode && <div className="mt-2 pt-2 border-t border-workspace-border text-brand-primary font-mono truncate max-w-[200px]">{hoveredNode}</div>}
      </div>
    </div>
  );
}
