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
    <main className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Workflows</h1>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus size={20} />
          New Workflow
        </button>
      </div>

      {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : data?.data.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No workflows yet</p>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              Create your first workflow
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {data?.data.map((workflow) => (
              <div
                key={workflow.id}
                className="bg-card rounded-lg border border-border p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <Link to={`/workflows/${workflow.id}`} className="flex-1">
                    <h3 className="text-lg font-medium text-card-foreground">{workflow.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {workflow.description || 'No description'}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>
                        Created: {new Date(workflow.createdAt).toLocaleDateString()}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded ${
                          workflow.active
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {workflow.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </Link>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => executeMutation.mutate(workflow.id)}
                      className="p-2 text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
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
                      className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
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
  );
}
