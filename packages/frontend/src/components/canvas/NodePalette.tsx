// Node Palette - Sidebar with draggable nodes

import {
  Webhook,
  Clock,
  Play,
  Globe,
  Code,
  GitBranch,
  Merge,
  Bot,
  UserCheck,
  Settings,
} from 'lucide-react';

interface NodeDefinition {
  type: string;
  name: string;
  icon: React.ReactNode;
  category: string;
}

const nodeDefinitions: NodeDefinition[] = [
  // Triggers
  { type: 'webhook-trigger', name: 'Webhook', icon: <Webhook size={16} />, category: 'Triggers' },
  { type: 'schedule-trigger', name: 'Schedule', icon: <Clock size={16} />, category: 'Triggers' },
  { type: 'manual-trigger', name: 'Manual', icon: <Play size={16} />, category: 'Triggers' },

  // Actions
  { type: 'http-request', name: 'HTTP Request', icon: <Globe size={16} />, category: 'Actions' },
  { type: 'code', name: 'Code', icon: <Code size={16} />, category: 'Actions' },

  // Logic
  { type: 'if', name: 'If', icon: <GitBranch size={16} />, category: 'Logic' },
  { type: 'switch', name: 'Switch', icon: <GitBranch size={16} />, category: 'Logic' },
  { type: 'merge', name: 'Merge', icon: <Merge size={16} />, category: 'Logic' },

  // AI
  { type: 'agent', name: 'Agent', icon: <Bot size={16} />, category: 'AI' },
  { type: 'hitl', name: 'Human Approval', icon: <UserCheck size={16} />, category: 'AI' },

  // Utility
  { type: 'set', name: 'Set', icon: <Settings size={16} />, category: 'Utility' },
];

const categories = ['Triggers', 'Actions', 'Logic', 'AI', 'Utility'];

export function NodePalette() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-56 bg-white border-r p-4 overflow-y-auto">
      <h2 className="font-semibold text-gray-700 mb-4">Nodes</h2>

      {categories.map((category) => {
        const categoryNodes = nodeDefinitions.filter((n) => n.category === category);
        if (categoryNodes.length === 0) return null;

        return (
          <div key={category} className="mb-4">
            <h3 className="text-xs font-medium text-gray-400 uppercase mb-2">{category}</h3>
            <div className="space-y-1">
              {categoryNodes.map((node) => (
                <div
                  key={node.type}
                  className="flex items-center gap-2 p-2 bg-gray-50 rounded cursor-grab hover:bg-gray-100 transition-colors"
                  draggable
                  onDragStart={(e) => onDragStart(e, node.type)}
                >
                  <span className="text-gray-600">{node.icon}</span>
                  <span className="text-sm text-gray-700">{node.name}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
