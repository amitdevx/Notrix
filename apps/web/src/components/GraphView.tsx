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
          color: '#60A5FA', // Blue-400
        });
      }
    });

    // Add edges
    data.edges.forEach((edge) => {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        if (!graph.hasEdge(edge.source, edge.target)) {
          graph.addEdge(edge.source, edge.target, {
            size: 1,
            color: '#4B5563', // Gray-600
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
      renderEdgeLabels: true,
      defaultEdgeColor: '#4B5563',
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
          graph.setNodeAttribute(node, 'color', '#93C5FD');
        } else {
          graph.setNodeAttribute(node, 'color', '#1F2937');
        }
      });
    });

    sigma.on('leaveNode', () => {
      setHoveredNode(null);
      document.body.style.cursor = 'default';
      
      graph.forEachNode((node) => {
        graph.setNodeAttribute(node, 'highlighted', false);
        graph.setNodeAttribute(node, 'color', '#60A5FA');
      });
    });

    return () => {
      sigma.kill();
    };
  }, [data, onNodeClick]);

  return (
    <div className="w-full h-full relative bg-neutral-900">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute top-4 left-4 text-white text-sm bg-neutral-800 px-3 py-1 rounded shadow-lg pointer-events-none">
        Global Graph ({data.nodes.length} nodes, {data.edges.length} edges)
        {hoveredNode && <span className="ml-2 text-blue-400">Hovering: {hoveredNode}</span>}
      </div>
    </div>
  );
}
