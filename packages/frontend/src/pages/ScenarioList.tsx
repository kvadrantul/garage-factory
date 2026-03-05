// Scenario List Page

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Plus, Trash2, Edit2, Workflow, ToggleLeft, ToggleRight, Sparkles, ArrowLeft } from 'lucide-react';
import { scenariosApi, domainsApi, workflowsApi } from '@/api/client';

const RISK_CLASSES = [
  { value: 'read_only', label: 'Read Only', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'write', label: 'Write', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  { value: 'financial', label: 'Financial', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  { value: 'legal_opinion', label: 'Legal Opinion', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
];

const DURATIONS = [
  { value: 'fast', label: 'Fast (<10s)' },
  { value: 'medium', label: 'Medium (10s-60s)' },
  { value: 'long', label: 'Long (>60s)' },
];

export function ScenarioList() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const domainId = searchParams.get('domain_id') || undefined;
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingScenario, setEditingScenario] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['scenarios', domainId],
    queryFn: () => scenariosApi.list({ domain_id: domainId }),
  });

  const { data: domainsData } = useQuery({
    queryKey: ['domains'],
    queryFn: () => domainsApi.list(),
  });

  const { data: workflowsData } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowsApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => scenariosApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scenarios'] }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => scenariosApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setShowCreateModal(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => scenariosApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setEditingScenario(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      scenariosApi.update(id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scenarios'] }),
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
            Tools {currentDomain && `- ${currentDomain.name}`}
          </h1>
          <p className="text-muted-foreground mt-1">
            Workflow-backed tools available to expert agents
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (domainId) {
                navigate(`/domains/${domainId}/workflows/new?generate=true`);
              } else {
                navigate('/domains');
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
          >
            <Sparkles size={20} />
            Generate Skill
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus size={20} />
            New Tool
          </button>
        </div>
      </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : data?.data.length === 0 ? (
          <div className="text-center py-12">
            <Workflow size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No tools yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              Create your first tool
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {data?.data.map((scenario) => {
              const riskClass = RISK_CLASSES.find((r) => r.value === scenario.riskClass);
              return (
                <div
                  key={scenario.id}
                  className="bg-card rounded-lg border border-border p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-card-foreground">{scenario.name}</h3>
                        <code className="text-xs bg-muted px-2 py-0.5 rounded">
                          {scenario.toolName}
                        </code>
                        <span className={`text-xs px-2 py-0.5 rounded ${riskClass?.color}`}>
                          {riskClass?.label}
                        </span>
                        {!scenario.enabled && (
                          <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            Disabled
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {scenario.shortDescription}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Office: {scenario.domainName}</span>
                        <span>Workflow: {scenario.workflowName}</span>
                        <span>Duration: {DURATIONS.find((d) => d.value === scenario.estimatedDuration)?.label}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-4">
                      <button
                        onClick={() => toggleMutation.mutate({ id: scenario.id, enabled: !scenario.enabled })}
                        className={`p-1.5 rounded transition-colors ${
                          scenario.enabled
                            ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                            : 'text-muted-foreground hover:bg-muted'
                        }`}
                        title={scenario.enabled ? 'Disable' : 'Enable'}
                      >
                        {scenario.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      </button>
                      <button
                        onClick={() => setEditingScenario(scenario)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this tool?')) {
                            deleteMutation.mutate(scenario.id);
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

      {/* Create/Edit Modal */}
      {(showCreateModal || editingScenario) && (
        <ScenarioModal
          scenario={editingScenario}
          domains={domainsData?.data || []}
          workflows={workflowsData?.data || []}
          defaultDomainId={domainId}
          onClose={() => {
            setShowCreateModal(false);
            setEditingScenario(null);
          }}
          onSave={(data) => {
            if (editingScenario) {
              updateMutation.mutate({ id: editingScenario.id, data });
            } else {
              createMutation.mutate(data);
            }
          }}
          isLoading={createMutation.isPending || updateMutation.isPending}
        />
      )}

    </main>
  );
}

function ScenarioModal({
  scenario,
  domains,
  workflows,
  defaultDomainId,
  onClose,
  onSave,
  isLoading,
}: {
  scenario?: any;
  domains: any[];
  workflows: any[];
  defaultDomainId?: string;
  onClose: () => void;
  onSave: (data: any) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    domainId: scenario?.domainId || defaultDomainId || '',
    workflowId: scenario?.workflowId || '',
    toolName: scenario?.toolName || '',
    name: scenario?.name || '',
    shortDescription: scenario?.shortDescription || '',
    whenToApply: scenario?.whenToApply || '',
    riskClass: scenario?.riskClass || 'read_only',
    estimatedDuration: scenario?.estimatedDuration || 'fast',
    enabled: scenario?.enabled ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border border-border p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">
          {scenario ? 'Edit Tool' : 'Create Tool'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Workflow *</label>
              <select
                value={formData.workflowId}
                onChange={(e) => setFormData({ ...formData, workflowId: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              >
                <option value="">Select workflow...</option>
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tool Name *</label>
              <input
                type="text"
                value={formData.toolName}
                onChange={(e) => setFormData({ ...formData, toolName: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                placeholder="check_contract"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Display Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Check Contract"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Short Description *</label>
            <input
              type="text"
              value={formData.shortDescription}
              onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Analyzes contract for compliance issues"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">When to Apply *</label>
            <textarea
              value={formData.whenToApply}
              onChange={(e) => setFormData({ ...formData, whenToApply: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              rows={2}
              placeholder="Use this tool when the user asks to review or check a contract for legal compliance..."
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Risk Class</label>
              <select
                value={formData.riskClass}
                onChange={(e) => setFormData({ ...formData, riskClass: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {RISK_CLASSES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Estimated Duration</label>
              <select
                value={formData.estimatedDuration}
                onChange={(e) => setFormData({ ...formData, estimatedDuration: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="enabled" className="text-sm">Enabled</label>
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
              {isLoading ? 'Saving...' : scenario ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


