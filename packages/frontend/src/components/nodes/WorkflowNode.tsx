import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
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
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
  'webhook-trigger': Webhook,
  'schedule-trigger': Clock,
  'manual-trigger': Play,
  'http-request': Globe,
  'code': Code,
  'if': GitBranch,
  'switch': GitBranch,
  'merge': Merge,
  'set': Settings,
  'agent': Bot,
  'hitl': UserCheck,
};

const categoryColors: Record<string, { bg: string; border: string; icon: string }> = {
  'webhook-trigger': { bg: 'bg-purple-50', border: 'border-purple-300', icon: 'text-purple-600' },
  'schedule-trigger': { bg: 'bg-purple-50', border: 'border-purple-300', icon: 'text-purple-600' },
  'manual-trigger': { bg: 'bg-purple-50', border: 'border-purple-300', icon: 'text-purple-600' },
  'http-request': { bg: 'bg-blue-50', border: 'border-blue-300', icon: 'text-blue-600' },
  'code': { bg: 'bg-blue-50', border: 'border-blue-300', icon: 'text-blue-600' },
  'if': { bg: 'bg-orange-50', border: 'border-orange-300', icon: 'text-orange-600' },
  'switch': { bg: 'bg-orange-50', border: 'border-orange-300', icon: 'text-orange-600' },
  'merge': { bg: 'bg-orange-50', border: 'border-orange-300', icon: 'text-orange-600' },
  'set': { bg: 'bg-gray-50', border: 'border-gray-300', icon: 'text-gray-600' },
  'agent': { bg: 'bg-green-50', border: 'border-green-300', icon: 'text-green-600' },
  'hitl': { bg: 'bg-amber-50', border: 'border-amber-300', icon: 'text-amber-600' },
};

const statusStyles: Record<string, string> = {
  pending: '',
  running: 'ring-2 ring-blue-400 ring-offset-1 animate-pulse',
  completed: 'ring-2 ring-green-400 ring-offset-1',
  error: 'ring-2 ring-red-400 ring-offset-1',
  waiting_hitl: 'ring-2 ring-amber-400 ring-offset-1 animate-pulse',
  skipped: 'opacity-50',
};

// Nodes that have no inputs (triggers)
const triggerTypes = new Set(['webhook-trigger', 'schedule-trigger', 'manual-trigger']);

// Nodes with multiple outputs
const multiOutputTypes: Record<string, string[]> = {
  'if': ['True', 'False'],
  'switch': ['Case 0', 'Case 1', 'Case 2', 'Default'],
};

function WorkflowNodeComponent({ data, type, selected }: NodeProps) {
  const [showOutput, setShowOutput] = useState(false);
  const Icon = iconMap[type || ''] || Settings;
  const colors = categoryColors[type || ''] || categoryColors['set'];
  const status = data?.executionStatus as string | undefined;
  const output = data?.executionOutput;
  const error = data?.executionError as string | undefined;
  const duration = data?.executionDuration as number | undefined;
  const isTrigger = triggerTypes.has(type || '');
  const outputs = multiOutputTypes[type || ''];

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div
      className={`
        ${colors.bg} ${colors.border} border rounded-lg shadow-sm
        min-w-[160px] max-w-[220px]
        ${selected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
        ${status ? statusStyles[status] || '' : ''}
        transition-all duration-200
      `}
    >
      {/* Input handle */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white"
        />
      )}

      {/* Node content */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className={`${colors.icon} flex-shrink-0`}>
            <Icon size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-800 truncate">
              {data?.name || type}
            </div>
          </div>
        </div>

        {/* Status indicator with duration */}
        {status && (
          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  status === 'completed'
                    ? 'bg-green-500'
                    : status === 'running'
                    ? 'bg-blue-500'
                    : status === 'error'
                    ? 'bg-red-500'
                    : status === 'waiting_hitl'
                    ? 'bg-amber-500'
                    : 'bg-gray-400'
                }`}
              />
              <span className="text-[10px] text-gray-500 capitalize">{status.replace('_', ' ')}</span>
            </div>
            {duration !== undefined && (
              <span className="text-[10px] text-gray-400">{formatDuration(duration)}</span>
            )}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-1 text-[10px] text-red-600 truncate" title={error}>
            {error}
          </div>
        )}

        {/* Output toggle */}
        {(output || error) && status !== 'running' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowOutput(!showOutput);
            }}
            className="mt-1 flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700"
          >
            {showOutput ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {showOutput ? 'Hide output' : 'Show output'}
          </button>
        )}
      </div>

      {/* Output panel */}
      {showOutput && output && (
        <div className="border-t px-2 py-1 max-h-32 overflow-auto bg-white/50">
          <pre className="text-[9px] text-gray-600 whitespace-pre-wrap break-all">
            {JSON.stringify(output, null, 2).slice(0, 500)}
            {JSON.stringify(output).length > 500 && '...'}
          </pre>
        </div>
      )}

      {/* Output handles */}
      {outputs ? (
        outputs.map((_label, i) => (
          <Handle
            key={`output_${i}`}
            type="source"
            position={Position.Right}
            id={`output_${i}`}
            className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white"
            style={{ top: `${((i + 1) / (outputs.length + 1)) * 100}%` }}
          />
        ))
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white"
        />
      )}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
