// Workflow List Page

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Play, Trash2 } from 'lucide-react';
import { workflowsApi } from '@/api/client';

export function WorkflowList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workflowsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workflows'] }),
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => workflowsApi.execute(id),
  });

  const handleCreate = async () => {
    navigate('/workflows/new');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-bold text-gray-900">Orchestrator</h1>
            <nav className="flex items-center gap-4">
              <Link to="/workflows" className="text-blue-600 font-medium">
                Workflows
              </Link>
              <Link to="/executions" className="text-gray-600 hover:text-gray-900">
                Executions
              </Link>
              <Link to="/hitl" className="text-gray-600 hover:text-gray-900">
                HITL Requests
              </Link>
            </nav>
          </div>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={20} />
            New Workflow
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : data?.data.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No workflows yet</p>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create your first workflow
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {data?.data.map((workflow) => (
              <div
                key={workflow.id}
                className="bg-white rounded-lg border p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <Link to={`/workflows/${workflow.id}`} className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900">{workflow.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {workflow.description || 'No description'}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span>
                        Created: {new Date(workflow.createdAt).toLocaleDateString()}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded ${
                          workflow.active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {workflow.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </Link>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => executeMutation.mutate(workflow.id)}
                      className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                      title="Execute"
                    >
                      <Play size={18} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this workflow?')) {
                          deleteMutation.mutate(workflow.id);
                        }
                      }}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
