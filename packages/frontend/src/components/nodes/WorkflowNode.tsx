import { memo } from 'react';
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
  'webhook-trigger': { bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-300 dark:border-purple-700', icon: 'text-purple-600 dark:text-purple-400' },
  'schedule-trigger': { bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-300 dark:border-purple-700', icon: 'text-purple-600 dark:text-purple-400' },
  'manual-trigger': { bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-300 dark:border-purple-700', icon: 'text-purple-600 dark:text-purple-400' },
  'http-request': { bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-300 dark:border-blue-700', icon: 'text-blue-600 dark:text-blue-400' },
  'code': { bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-300 dark:border-blue-700', icon: 'text-blue-600 dark:text-blue-400' },
  'if': { bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-300 dark:border-orange-700', icon: 'text-orange-600 dark:text-orange-400' },
  'switch': { bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-300 dark:border-orange-700', icon: 'text-orange-600 dark:text-orange-400' },
  'merge': { bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-300 dark:border-orange-700', icon: 'text-orange-600 dark:text-orange-400' },
  'set': { bg: 'bg-muted', border: 'border-border', icon: 'text-muted-foreground' },
  'agent': { bg: 'bg-green-50 dark:bg-green-950/40', border: 'border-green-300 dark:border-green-700', icon: 'text-green-600 dark:text-green-400' },
  'hitl': { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-300 dark:border-amber-700', icon: 'text-amber-600 dark:text-amber-400' },
};

const statusStyles: Record<string, string> = {
  pending: '',
  running: 'ring-2 ring-blue-500 ring-offset-2 ring-offset-background shadow-lg shadow-blue-500/20',
  completed: 'ring-2 ring-green-500 ring-offset-2 ring-offset-background',
  error: 'ring-2 ring-red-500 ring-offset-2 ring-offset-background',
  waiting_hitl: 'ring-2 ring-amber-500 ring-offset-2 ring-offset-background',
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
  const Icon = iconMap[type || ''] || Settings;
  const colors = categoryColors[type || ''] || categoryColors['set'];
  const status = data?.executionStatus as string | undefined;
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
          className="!w-3 !h-3 !bg-gray-400 dark:!bg-gray-500 !border-2 !border-white dark:!border-gray-800"
        />
      )}

      {/* Node content */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className={`${colors.icon} flex-shrink-0`}>
            <Icon size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground truncate">
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
              <span className="text-[10px] text-muted-foreground capitalize">{status.replace('_', ' ')}</span>
            </div>
            {duration !== undefined && (
              <span className="text-[10px] text-muted-foreground">{formatDuration(duration)}</span>
            )}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-1 text-[10px] text-red-600 dark:text-red-400 truncate" title={error}>
            {error}
          </div>
        )}
      </div>

      {/* Output handles */}
      {outputs ? (
        outputs.map((_label, i) => (
          <Handle
            key={`output_${i}`}
            type="source"
            position={Position.Right}
            id={`output_${i}`}
            className="!w-3 !h-3 !bg-gray-400 dark:!bg-gray-500 !border-2 !border-white dark:!border-gray-800"
            style={{ top: `${((i + 1) / (outputs.length + 1)) * 100}%` }}
          />
        ))
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-gray-400 dark:!bg-gray-500 !border-2 !border-white dark:!border-gray-800"
        />
      )}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
