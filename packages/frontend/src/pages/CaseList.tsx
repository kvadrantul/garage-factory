// Case List Page

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, MessageSquare, CheckCircle, XCircle, Clock, ArrowLeft } from 'lucide-react';
import { casesApi, domainsApi } from '@/api/client';

const STATUS_CONFIG = {
  open: { label: 'Open', icon: Clock, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  completed: { label: 'Completed', icon: CheckCircle, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  abandoned: { label: 'Abandoned', icon: XCircle, color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400' },
};

export function CaseList() {
  const [searchParams] = useSearchParams();
  const domainId = searchParams.get('domain_id') || undefined;
  const status = searchParams.get('status') || undefined;
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['cases', domainId, status],
    queryFn: () => casesApi.list({ domain_id: domainId, status }),
  });

  const { data: domainsData } = useQuery({
    queryKey: ['domains'],
    queryFn: () => domainsApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => casesApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cases'] }),
  });

  const createMutation = useMutation({
    mutationFn: (data: { domainId: string; title?: string }) => casesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      setShowCreateModal(false);
    },
  });

  const currentDomain = domainsData?.data.find((d: any) => d.id === domainId);

  return (
    <main className="p-6">
      {domainId && (
        <div className="mb-4">
          <Link
            to="/domains"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} />
            Offices
          </Link>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Cases {currentDomain && `- ${currentDomain.name}`}
          </h1>
          <p className="text-muted-foreground mt-1">
            Expert consultation sessions
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus size={20} />
          New Case
        </button>
      </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          <Link
            to={domainId ? `/cases?domain_id=${domainId}` : '/cases'}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              !status ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
            }`}
          >
            All
          </Link>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <Link
              key={key}
              to={domainId ? `/cases?domain_id=${domainId}&status=${key}` : `/cases?status=${key}`}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                status === key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {config.label}
            </Link>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : data?.data.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No cases yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              Start a new case
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {data?.data.map((caseItem) => {
              const statusConfig = STATUS_CONFIG[caseItem.status as keyof typeof STATUS_CONFIG];
              const StatusIcon = statusConfig?.icon || Clock;
              return (
                <div
                  key={caseItem.id}
                  className="bg-card rounded-lg border border-border p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <Link to={`/cases/${caseItem.id}/chat`} className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-card-foreground">
                          {caseItem.title || 'Untitled Case'}
                        </h3>
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${statusConfig?.color}`}>
                          <StatusIcon size={12} />
                          {statusConfig?.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Office: {caseItem.domainName}</span>
                        <span>Created: {new Date(caseItem.createdAt).toLocaleDateString()}</span>
                        {caseItem.updatedAt !== caseItem.createdAt && (
                          <span>Updated: {new Date(caseItem.updatedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                      {caseItem.summary && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {caseItem.summary}
                        </p>
                      )}
                    </Link>
                    <div className="flex items-center gap-1 ml-4">
                      <Link
                        to={`/cases/${caseItem.id}/chat`}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
                        title="Open Chat"
                      >
                        <MessageSquare size={18} />
                      </Link>
                      <button
                        onClick={() => {
                          if (confirm('Delete this case? All conversation history will be lost.')) {
                            deleteMutation.mutate(caseItem.id);
                          }
                        }}
                        className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateCaseModal
          domains={domainsData?.data || []}
          defaultDomainId={domainId}
          onClose={() => setShowCreateModal(false)}
          onSave={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      )}
    </main>
  );
}

function CreateCaseModal({
  domains,
  defaultDomainId,
  onClose,
  onSave,
  isLoading,
}: {
  domains: any[];
  defaultDomainId?: string;
  onClose: () => void;
  onSave: (data: { domainId: string; title?: string }) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    domainId: defaultDomainId || '',
    title: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      domainId: formData.domainId,
      title: formData.title || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border border-border p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Start New Case</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Office *</label>
            <select
              value={formData.domainId}
              onChange={(e) => setFormData({ ...formData, domainId: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              <option value="">Select domain...</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.icon || '🏢'} {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Title (optional)</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Contract review for Project X"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Start Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
