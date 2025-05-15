import React, { useMemo } from "react";
import ReactFlow, { MiniMap, Controls } from "react-flow-renderer";

export default function VersionGraph({ edges, onSelectDraft }) {
  const { nodes, links } = useMemo(() => {
    const uniqueDrafts = new Set();
    const nodeMap = {};
    const reactNodes = [];
    const reactEdges = [];

    edges.forEach(({ from, to }, i) => {
      if (!uniqueDrafts.has(to)) {
        reactNodes.push({
          id: to,
          data: { label: to },
          position: { x: Math.random() * 500, y: Math.random() * 500 },
        });
        uniqueDrafts.add(to);
      }
      if (from && !uniqueDrafts.has(from)) {
        reactNodes.push({
          id: from,
          data: { label: from },
          position: { x: Math.random() * 500, y: Math.random() * 500 },
        });
        uniqueDrafts.add(from);
      }
      if (from) {
        reactEdges.push({
          id: `e-${from}-${to}-${i}`,
          source: from,
          target: to,
        });
      }
    });

    return { nodes: reactNodes, links: reactEdges };
  }, [edges]);

  return (
    <div style={{ height: 400 }} className="border rounded p-2 bg-white">
      <ReactFlow
        nodes={nodes}
        edges={links}
        fitView
        onNodeClick={(_, node) => onSelectDraft(node.id)}
      >
        <MiniMap />
        <Controls />
      </ReactFlow>
    </div>
  );
}
