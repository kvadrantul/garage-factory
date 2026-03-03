// Execution Detail Page

import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  StopCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import { executionsApi } from '@/api/client';

const statusConfig: Record<string, { icon: typeof Clock; color: string; bg: string; text: string }> = {
  pending: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100', text: 'Pending' },
  running: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-100', text: 'Running' },
  waiting_hitl: { icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-100', text: 'Waiting for Input' },
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100', text: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100', text: 'Failed' },
  stopped: { icon: StopCircle, color: 'text-gray-500', bg: 'bg-gray-100', text: 'Stopped' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100', text: 'Error' },
  skipped: { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-50', text: 'Skipped' },
};

function JsonViewer({ data, label }: { data: unknown; label: string }) {
  const [isOpen, setIsOpen] = useState(false);

  if (data === null || data === undefined) {
    return (
      <div className="text-sm text-gray-400 italic">No {label.toLowerCase()}</div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {label}
      </button>
      {isOpen && (
        <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto max-h-64">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function ExecutionDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: execution, isLoading } = useQuery({
    queryKey: ['execution', id],
    queryFn: () => executionsApi.get(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'running' || status === 'waiting_hitl' ? 2000 : false;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Execution not found</p>
          <Link to="/executions" className="text-blue-600 hover:underline mt-2 inline-block">
            Back to executions
          </Link>
        </div>
      </div>
    );
  }

  const config = statusConfig[execution.status] || statusConfig.pending;
  const StatusIcon = config.icon;

  // Convert nodes object to array for display
  const nodeResults = execution.nodes
    ? Object.entries(execution.nodes).map(([nodeId, data]: [string, any]) => ({
        nodeId,
        ...data,
      }))
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/executions"
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
            >
              <ArrowLeft size={20} />
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-gray-900">Execution Details</h1>
              <p className="text-sm text-gray-500 mt-0.5">ID: {execution.id}</p>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bg}`}>
              <StatusIcon
                size={16}
                className={`${config.color} ${execution.status === 'running' ? 'animate-spin' : ''}`}
              />
              <span className={`text-sm font-medium ${config.color}`}>{config.text}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Summary Card */}
        <div className="bg-white rounded-lg border p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-500">Workflow</p>
              <p className="font-medium">{execution.workflowName || execution.workflowId}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Trigger</p>
              <p className="font-medium capitalize">{execution.triggerType}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Started</p>
              <p className="font-medium">
                {execution.startedAt
                  ? new Date(execution.startedAt).toLocaleString()
                  : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Finished</p>
              <p className="font-medium">
                {execution.finishedAt
                  ? new Date(execution.finishedAt).toLocaleString()
                  : execution.status === 'running'
                  ? 'In progress...'
                  : '-'}
              </p>
            </div>
          </div>

          {execution.error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-sm font-medium text-red-800">Error</p>
              <p className="text-sm text-red-600 mt-1">{execution.error}</p>
            </div>
          )}

          {execution.triggerData && (
            <div className="mt-4">
              <JsonViewer data={execution.triggerData} label="Trigger Data" />
            </div>
          )}
        </div>

        {/* Node Results */}
        <div className="bg-white rounded-lg border">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-medium text-gray-900">Node Results</h2>
          </div>

          {nodeResults.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No node results yet
            </div>
          ) : (
            <div className="divide-y">
              {nodeResults.map((node) => {
                const nodeConfig = statusConfig[node.status] || statusConfig.pending;
                const NodeStatusIcon = nodeConfig.icon;

                return (
                  <div key={node.nodeId} className="px-6 py-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded ${nodeConfig.bg}`}>
                        <NodeStatusIcon
                          size={16}
                          className={`${nodeConfig.color} ${
                            node.status === 'running' ? 'animate-spin' : ''
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <h3 className="font-medium text-gray-900">{node.nodeId}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded ${nodeConfig.bg} ${nodeConfig.color}`}>
                            {nodeConfig.text}
                          </span>
                        </div>

                        {node.startedAt && (
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(node.startedAt).toLocaleString()}
                            {node.finishedAt && (
                              <> - {new Date(node.finishedAt).toLocaleString()}</>
                            )}
                          </p>
                        )}

                        {node.error && (
                          <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">
                            {node.error}
                          </div>
                        )}

                        <div className="mt-3 space-y-2">
                          <JsonViewer data={node.input} label="Input" />
                          <JsonViewer data={node.output} label="Output" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
