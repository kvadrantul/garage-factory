// Credentials List Page

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Key, Edit2, X } from 'lucide-react';
import { credentialsApi } from '@/api/client';
import { AppHeader } from '@/components/AppHeader';

interface Credential {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

const CREDENTIAL_TYPES = [
  { value: 'api_key', label: 'API Key' },
  { value: 'basic_auth', label: 'Basic Auth' },
  { value: 'bearer_token', label: 'Bearer Token' },
  { value: 'oauth2', label: 'OAuth2' },
  { value: 'custom', label: 'Custom' },
];

export function CredentialsList() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => credentialsApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => credentialsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credentials'] }),
  });

  const handleCreate = () => {
    setEditingCredential(null);
    setIsModalOpen(true);
  };

  const handleEdit = (credential: Credential) => {
    setEditingCredential(credential);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingCredential(null);
  };

  const getTypeIcon = (_type: string) => {
    return <Key size={18} className="text-muted-foreground" />;
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus size={20} />
          New Credential
        </button>
      </AppHeader>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : data?.data.length === 0 ? (
          <div className="text-center py-12">
            <Key size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No credentials yet</p>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              Create your first credential
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {data?.data.map((credential: Credential) => (
              <div
                key={credential.id}
                className="bg-card rounded-lg border border-border p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {getTypeIcon(credential.type)}
                    <div>
                      <h3 className="text-lg font-medium text-card-foreground">
                        {credential.name}
                      </h3>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span className="px-2 py-0.5 rounded bg-muted">
                          {CREDENTIAL_TYPES.find(t => t.value === credential.type)?.label || credential.type}
                        </span>
                        <span>
                          Updated: {new Date(credential.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(credential)}
                      className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this credential?')) {
                          deleteMutation.mutate(credential.id);
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

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <CredentialModal
          credential={editingCredential}
          onClose={handleModalClose}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['credentials'] });
            handleModalClose();
          }}
        />
      )}
    </div>
  );
}

// Credential Modal for Create/Edit
function CredentialModal({
  credential,
  onClose,
  onSuccess,
}: {
  credential: Credential | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEditing = !!credential;
  const [name, setName] = useState(credential?.name || '');
  const [type, setType] = useState(credential?.type || 'api_key');
  const [credentialData, setCredentialData] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; type: string; data: Record<string, unknown> }) =>
      credentialsApi.create(data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; type?: string; data?: Record<string, unknown> } }) =>
      credentialsApi.update(id, data),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (Object.keys(credentialData).length === 0 && !isEditing) {
      setError('Please fill in the credential data');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: credential.id,
          data: {
            name,
            type,
            ...(Object.keys(credentialData).length > 0 ? { data: credentialData } : {}),
          },
        });
      } else {
        await createMutation.mutateAsync({
          name,
          type,
          data: credentialData,
        });
      }
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDataFields = () => {
    const inputClass = "w-full px-3 py-2 border border-input bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-ring transition-colors text-sm";
    const labelClass = "block text-sm font-medium text-foreground mb-1";

    switch (type) {
      case 'api_key':
        return (
          <div>
            <label className={labelClass}>API Key</label>
            <input
              type="password"
              value={credentialData.apiKey || ''}
              onChange={(e) => setCredentialData({ ...credentialData, apiKey: e.target.value })}
              placeholder={isEditing ? '••••••••' : 'Enter API key'}
              className={inputClass}
            />
          </div>
        );

      case 'basic_auth':
        return (
          <>
            <div>
              <label className={labelClass}>Username</label>
              <input
                type="text"
                value={credentialData.username || ''}
                onChange={(e) => setCredentialData({ ...credentialData, username: e.target.value })}
                placeholder="Username"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <input
                type="password"
                value={credentialData.password || ''}
                onChange={(e) => setCredentialData({ ...credentialData, password: e.target.value })}
                placeholder={isEditing ? '••••••••' : 'Password'}
                className={inputClass}
              />
            </div>
          </>
        );

      case 'bearer_token':
        return (
          <div>
            <label className={labelClass}>Token</label>
            <input
              type="password"
              value={credentialData.token || ''}
              onChange={(e) => setCredentialData({ ...credentialData, token: e.target.value })}
              placeholder={isEditing ? '••••••••' : 'Enter bearer token'}
              className={inputClass}
            />
          </div>
        );

      case 'oauth2':
        return (
          <>
            <div>
              <label className={labelClass}>Client ID</label>
              <input
                type="text"
                value={credentialData.clientId || ''}
                onChange={(e) => setCredentialData({ ...credentialData, clientId: e.target.value })}
                placeholder="Client ID"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Client Secret</label>
              <input
                type="password"
                value={credentialData.clientSecret || ''}
                onChange={(e) => setCredentialData({ ...credentialData, clientSecret: e.target.value })}
                placeholder={isEditing ? '••••••••' : 'Client Secret'}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Access Token (optional)</label>
              <input
                type="password"
                value={credentialData.accessToken || ''}
                onChange={(e) => setCredentialData({ ...credentialData, accessToken: e.target.value })}
                placeholder={isEditing ? '••••••••' : 'Access Token'}
                className={inputClass}
              />
            </div>
          </>
        );

      case 'custom':
        return (
          <div>
            <label className={labelClass}>Data (JSON)</label>
            <textarea
              value={credentialData._raw || ''}
              onChange={(e) => {
                setCredentialData({ _raw: e.target.value });
                try {
                  const parsed = JSON.parse(e.target.value);
                  setCredentialData(parsed);
                } catch {
                  // Keep raw value for editing
                }
              }}
              placeholder='{"key": "value"}'
              rows={4}
              className={`${inputClass} font-mono`}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg border border-border w-full max-w-md mx-4 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {isEditing ? 'Edit Credential' : 'New Credential'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-500 text-sm rounded p-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My API Key"
              className="w-full px-3 py-2 border border-input bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-ring transition-colors text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setCredentialData({});
              }}
              className="w-full px-3 py-2 border border-input bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-ring transition-colors text-sm"
            >
              {CREDENTIAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-border pt-4 space-y-4">
            {renderDataFields()}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
            >
              {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
