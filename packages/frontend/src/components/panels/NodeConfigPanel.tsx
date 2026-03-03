// Node Configuration Panel

import { useWorkflowStore } from '@/stores/workflowStore';
import { X } from 'lucide-react';

export function NodeConfigPanel() {
  const { nodes, selectedNode, updateNodeData, setSelectedNode } = useWorkflowStore();

  const node = nodes.find((n) => n.id === selectedNode);
  if (!node) return null;

  const handleNameChange = (name: string) => {
    updateNodeData(node.id, { ...node.data, name });
  };

  const handleConfigChange = (key: string, value: any) => {
    updateNodeData(node.id, {
      ...node.data,
      config: { ...node.data.config, [key]: value },
    });
  };

  return (
    <div className="w-80 bg-white border-l overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold text-gray-700">Configure Node</h2>
        <button
          onClick={() => setSelectedNode(null)}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Node Type */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
          <div className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded">
            {node.type}
          </div>
        </div>

        {/* Node Name */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
          <input
            type="text"
            value={node.data.name || ''}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={node.type}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Node-specific config */}
        <NodeConfig type={node.type || ''} config={node.data.config} onChange={handleConfigChange} />
      </div>
    </div>
  );
}

// Node-specific configuration forms
function NodeConfig({
  type,
  config,
  onChange,
}: {
  type: string;
  config: Record<string, any>;
  onChange: (key: string, value: any) => void;
}) {
  switch (type) {
    case 'http-request':
      return (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Method</label>
            <select
              value={config.method || 'GET'}
              onChange={(e) => onChange('method', e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
              <option value="PATCH">PATCH</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">URL</label>
            <input
              type="text"
              value={config.url || ''}
              onChange={(e) => onChange('url', e.target.value)}
              placeholder="https://api.example.com"
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </>
      );

    case 'code':
      return (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Code</label>
          <textarea
            value={config.code || ''}
            onChange={(e) => onChange('code', e.target.value)}
            placeholder="// Your JavaScript code here"
            rows={10}
            className="w-full px-3 py-2 border rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      );

    case 'agent':
      return (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Provider</label>
            <select
              value={config.provider || 'openai'}
              onChange={(e) => onChange('provider', e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="openai">OpenAI</option>
              <option value="openclaw">OpenClaw CLI</option>
            </select>
          </div>
          {config.provider === 'openclaw' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Agent ID</label>
              <input
                type="text"
                value={config.agentId || ''}
                onChange={(e) => onChange('agentId', e.target.value)}
                placeholder="agent-xxx"
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Model</label>
            <input
              type="text"
              value={config.model || ''}
              onChange={(e) => onChange('model', e.target.value)}
              placeholder={config.provider === 'openclaw' ? 'claude-3-5-sonnet' : 'gpt-4o-mini'}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">System Prompt</label>
            <textarea
              value={config.systemPrompt || ''}
              onChange={(e) => onChange('systemPrompt', e.target.value)}
              placeholder="You are a helpful assistant..."
              rows={3}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Message</label>
            <textarea
              value={config.message || ''}
              onChange={(e) => onChange('message', e.target.value)}
              placeholder="Message to send (or leave empty to use input)"
              rows={4}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {config.provider !== 'openclaw' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Temperature: {config.temperature ?? 0.7}
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={config.temperature ?? 0.7}
                onChange={(e) => onChange('temperature', parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Timeout (seconds)</label>
            <input
              type="number"
              value={config.timeout || 180}
              onChange={(e) => onChange('timeout', parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </>
      );

    case 'hitl':
      return (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select
              value={config.type || 'approval'}
              onChange={(e) => onChange('type', e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="approval">Approval</option>
              <option value="input">Input</option>
              <option value="selection">Selection</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Message</label>
            <input
              type="text"
              value={config.message || ''}
              onChange={(e) => onChange('message', e.target.value)}
              placeholder="Approval required"
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </>
      );

    case 'schedule-trigger':
      return (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Cron Expression</label>
          <input
            type="text"
            value={config.cronExpression || ''}
            onChange={(e) => onChange('cronExpression', e.target.value)}
            placeholder="0 9 * * *"
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">e.g., "0 9 * * *" for every day at 9 AM</p>
        </div>
      );

    default:
      return (
        <div className="text-sm text-gray-500">
          No additional configuration for this node type.
        </div>
      );
  }
}
