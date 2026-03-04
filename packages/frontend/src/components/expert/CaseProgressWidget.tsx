// Case Progress Widget - compact vertical timeline of case steps

import {
  User,
  Bot,
  Wrench,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react';

interface CaseProgressWidgetProps {
  steps: any[];
}

const STEP_CONFIG: Record<string, { label: string; Icon: typeof User; color: string; dot: string }> = {
  user_message: {
    label: 'User message',
    Icon: User,
    color: 'text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  assistant_message: {
    label: 'Agent response',
    Icon: Bot,
    color: 'text-green-600 dark:text-green-400',
    dot: 'bg-green-500',
  },
  tool_call: {
    label: 'Tool call',
    Icon: Wrench,
    color: 'text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-400',
  },
  tool_result: {
    label: 'Tool result',
    Icon: CheckCircle,
    color: 'text-green-600 dark:text-green-400',
    dot: 'bg-green-500',
  },
  hitl_request: {
    label: 'Approval needed',
    Icon: AlertTriangle,
    color: 'text-yellow-600 dark:text-yellow-400',
    dot: 'bg-yellow-500',
  },
  hitl_response: {
    label: 'Responded',
    Icon: CheckCircle,
    color: 'text-green-600 dark:text-green-400',
    dot: 'bg-green-500',
  },
  error: {
    label: 'Error',
    Icon: XCircle,
    color: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
  },
};

function getStepLabel(step: any): string {
  const content = typeof step.content === 'string'
    ? (() => { try { return JSON.parse(step.content); } catch { return {}; } })()
    : step.content || {};

  switch (step.type) {
    case 'user_message':
      return content.text ? content.text.slice(0, 30) + (content.text.length > 30 ? '...' : '') : 'User message';
    case 'assistant_message':
      return content.text ? content.text.slice(0, 30) + (content.text.length > 30 ? '...' : '') : 'Agent response';
    case 'tool_call':
      return content.toolName ? `Tool: ${content.toolName}` : 'Tool call';
    case 'tool_result': {
      if (content.status === 'completed') return 'Completed';
      if (content.status === 'waiting_hitl') return 'Waiting for approval';
      if (content.status === 'failed') return 'Failed';
      return 'Tool result';
    }
    case 'hitl_request':
      return 'Approval needed';
    case 'hitl_response':
      return content.status === 'approved' ? 'Approved' : 'Rejected';
    case 'error':
      return 'Error';
    default:
      return step.type;
  }
}

function getToolResultConfig(step: any) {
  const content = typeof step.content === 'string'
    ? (() => { try { return JSON.parse(step.content); } catch { return {}; } })()
    : step.content || {};

  if (content.status === 'failed') {
    return { Icon: XCircle, color: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' };
  }
  if (content.status === 'waiting_hitl') {
    return { Icon: Clock, color: 'text-yellow-600 dark:text-yellow-400', dot: 'bg-yellow-500' };
  }
  return { Icon: CheckCircle, color: 'text-green-600 dark:text-green-400', dot: 'bg-green-500' };
}

function getHitlResponseConfig(step: any) {
  const content = typeof step.content === 'string'
    ? (() => { try { return JSON.parse(step.content); } catch { return {}; } })()
    : step.content || {};

  if (content.status === 'rejected') {
    return { Icon: XCircle, color: 'text-red-600 dark:text-red-400', dot: 'bg-red-500' };
  }
  return { Icon: CheckCircle, color: 'text-green-600 dark:text-green-400', dot: 'bg-green-500' };
}

export function CaseProgressWidget({ steps }: CaseProgressWidgetProps) {
  return (
    <div className="px-3 space-y-0">
      {steps.map((step: any, idx: number) => {
        let config = STEP_CONFIG[step.type] || STEP_CONFIG.error;

        // Override config for tool_result/hitl_response based on content status
        if (step.type === 'tool_result') {
          const override = getToolResultConfig(step);
          config = { ...config, ...override };
        }
        if (step.type === 'hitl_response') {
          const override = getHitlResponseConfig(step);
          config = { ...config, ...override };
        }

        const isLast = idx === steps.length - 1;
        const label = getStepLabel(step);
        const { Icon } = config;

        return (
          <div key={step.id} className="flex items-start gap-2 relative">
            {/* Vertical line */}
            {!isLast && (
              <div className="absolute left-[7px] top-4 w-px h-full bg-border" />
            )}
            {/* Dot */}
            <div className={`w-[15px] h-[15px] rounded-full ${config.dot} flex items-center justify-center flex-shrink-0 mt-0.5 z-10`}>
              <Icon size={9} className="text-white" />
            </div>
            {/* Label */}
            <div className="flex-1 min-w-0 pb-2">
              <p className="text-[11px] leading-tight truncate text-muted-foreground">
                {label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
