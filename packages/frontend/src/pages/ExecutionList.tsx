// Execution List Page

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Trash2, StopCircle, Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { executionsApi } from '@/api/client';

const statusConfig: Record<string, { icon: typeof Clock; color: string; bg: string }> = {
  pending: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100' },
  running: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-100' },
  waiting_hitl: { icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-100' },
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100' },
  stopped: { icon: StopCircle, color: 'text-gray-500', bg: 'bg-gray-100' },
};

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const duration = end - start;

  if (duration < 1000) return `${duration}ms`;
  if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
  return `${(duration / 60000).toFixed(1)}m`;
}

export function ExecutionList() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['executions'],
    queryFn: () => executionsApi.list(),
    refetchInterval: 5000, // Poll every 5s for running executions
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => executionsApi.stop(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['executions'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => executionsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['executions'] }),
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/workflows" className="text-2xl font-bold text-gray-900">
              Orchestrator
            </Link>
            <nav className="flex items-center gap-4">
              <Link to="/workflows" className="text-gray-600 hover:text-gray-900">
                Workflows
              </Link>
              <Link to="/executions" className="text-blue-600 font-medium">
                Executions
              </Link>
              <Link to="/hitl" className="text-gray-600 hover:text-gray-900">
                HITL Requests
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Executions</h2>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : data?.data.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No executions yet</p>
            <p className="text-sm text-gray-400 mt-2">
              Execute a workflow to see results here
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Workflow
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Trigger
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Started
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.data.map((execution) => {
                  const config = statusConfig[execution.status] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  const isRunning = execution.status === 'running' || execution.status === 'waiting_hitl';

                  return (
                    <tr key={execution.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link
                          to={`/executions/${execution.id}`}
                          className="flex items-center gap-2"
                        >
                          <span className={`p-1 rounded ${config.bg}`}>
                            <StatusIcon
                              size={16}
                              className={`${config.color} ${
                                execution.status === 'running' ? 'animate-spin' : ''
                              }`}
                            />
                          </span>
                          <span className="text-sm capitalize">{execution.status.replace('_', ' ')}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/executions/${execution.id}`}
                          className="text-sm font-medium text-gray-900 hover:text-blue-600"
                        >
                          {execution.workflowName || 'Unknown'}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-500 capitalize">
                          {execution.triggerType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-500">
                          {execution.startedAt
                            ? new Date(execution.startedAt).toLocaleString()
                            : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-500">
                          {formatDuration(execution.startedAt, execution.finishedAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {isRunning && (
                            <button
                              onClick={() => stopMutation.mutate(execution.id)}
                              className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded"
                              title="Stop"
                            >
                              <StopCircle size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (confirm('Delete this execution?')) {
                                deleteMutation.mutate(execution.id);
                              }
                            }}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
