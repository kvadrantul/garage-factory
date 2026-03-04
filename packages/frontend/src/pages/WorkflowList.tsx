// Workflow List Page

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Play, Trash2, Sparkles } from 'lucide-react';
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
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workflows</h1>
          <p className="text-muted-foreground mt-1">
            Build and manage automation workflows with visual editor
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/workflows/new?generate=true')}
            className="flex items-center gap-2 px-4 py-2 border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-400 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
          >
            <Sparkles size={18} />
            Generate Skill
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus size={20} />
            New Workflow
          </button>
        </div>
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data?.data.map((workflow) => (
              <div
                key={workflow.id}
                className="bg-card rounded-lg border border-border p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <Link to={`/workflows/${workflow.id}`} className="flex-1 min-w-0">
                    <h3 className="font-medium text-card-foreground">{workflow.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {workflow.description || 'No description'}
                    </p>
                  </Link>
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    <button
                      onClick={() => executeMutation.mutate(workflow.id)}
                      className="p-1.5 text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                      title="Execute"
                    >
                      <Play size={16} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this workflow?')) {
                          deleteMutation.mutate(workflow.id);
                        }
                      }}
                      className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
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
              </div>
            ))}
          </div>
        )}
      </main>
  );
}
