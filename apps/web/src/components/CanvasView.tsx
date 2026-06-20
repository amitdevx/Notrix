/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { OPFSClient } from '@notrix/core-engine';

interface CanvasViewProps {
  path: string;
  opfs: OPFSClient;
}

const TextNode = ({ data }: { data: any }) => {
  return (
    <div style={{ width: data.width, height: data.height }} className="bg-white dark:bg-gray-800 p-4 rounded shadow-md border border-gray-200 dark:border-gray-700">
      <div className="prose dark:prose-invert max-w-none text-sm" dangerouslySetInnerHTML={{ __html: data.text?.replace(/\n/g, '<br />') }} />
    </div>
  );
};

const FileNode = ({ data }: { data: any }) => {
  return (
    <div style={{ width: data.width, height: data.height }} className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded shadow-md border border-blue-200 dark:border-blue-800 flex items-center justify-center">
      <div className="text-center">
        <svg className="w-8 h-8 mx-auto mb-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
        <div className="font-medium text-sm">{data.file}</div>
      </div>
    </div>
  );
};

const GroupNode = ({ data }: { data: any }) => {
  return (
    <div style={{ width: data.width, height: data.height }} className="bg-gray-100/50 dark:bg-gray-800/30 rounded border-2 border-dashed border-gray-300 dark:border-gray-600 relative">
      <div className="absolute top-2 left-2 font-bold text-gray-500">{data.label}</div>
    </div>
  );
};

const LinkNode = ({ data }: { data: any }) => {
  return (
    <div style={{ width: data.width, height: data.height }} className="bg-purple-50 dark:bg-purple-900/30 p-4 rounded shadow-md border border-purple-200 dark:border-purple-800 flex items-center justify-center overflow-hidden">
      <a href={data.url} target="_blank" rel="noreferrer" className="text-purple-600 dark:text-purple-400 font-medium truncate block w-full text-center hover:underline">
        {data.url}
      </a>
    </div>
  );
};

const nodeTypes = {
  text: TextNode,
  file: FileNode,
  group: GroupNode,
  link: LinkNode,
};

export function CanvasView({ path, opfs }: CanvasViewProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCanvas() {
      try {
        const content = await opfs.readFile(path);
        const data = JSON.parse(content);
        
        // Map json-canvas to reactflow
        const rfNodes: Node[] = (data.nodes || []).map((n: any) => ({
          id: n.id,
          type: n.type,
          position: { x: n.x, y: n.y },
          data: { ...n },
          style: { width: n.width, height: n.height },
        }));
        
        const rfEdges: Edge[] = (data.edges || []).map((e: any) => ({
          id: e.id,
          source: e.fromNode,
          target: e.toNode,
          sourceHandle: e.fromSide,
          targetHandle: e.toSide,
          label: e.label,
        }));
        
        setNodes(rfNodes);
        setEdges(rfEdges);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    loadCanvas();
  }, [path, opfs]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const fileName = event.dataTransfer.getData('text/plain');
      if (!fileName) return;

      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      const position = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      };

      const newNode: Node = {
        id: Math.random().toString(16).slice(2, 18),
        type: 'file',
        position,
        data: { file: fileName },
        style: { width: 300, height: 200 },
      };

      setNodes((nds) => {
        const newNodes = nds.concat(newNode);
        // Auto save to OPFS
        const jsonCanvas = {
          nodes: newNodes.map(n => ({ id: n.id, type: n.type, x: n.position.x, y: n.position.y, width: n.style?.width || 300, height: n.style?.height || 200, ...n.data })),
          edges: edges.map(e => ({ id: e.id, fromNode: e.source, toNode: e.target, fromSide: e.sourceHandle, toSide: e.targetHandle, label: e.label }))
        };
        opfs.updateFile(path, JSON.stringify(jsonCanvas, null, 2)).catch(console.error);
        return newNodes;
      });
    },
    [edges, opfs, path]
  );

  if (error) return <div className="p-4 text-red-500">Error loading canvas: {error}</div>;

  return (
    <div className="w-full h-full bg-neutral-900" style={{ minHeight: '100%' }} onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        className="react-flow-dark"
      >
        <Background color="#333" gap={20} />
        <Controls />
        <MiniMap nodeColor="#444" maskColor="rgba(0,0,0,0.5)" />
      </ReactFlow>
    </div>
  );
}
