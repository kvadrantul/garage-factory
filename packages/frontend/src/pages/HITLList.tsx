// HITL List Page - Shows all pending HITL requests

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle,
  XCircle,
  Send,
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { hitlApi } from '@/api/client';

interface HITLRequest {
  id: string;
  executionId: string;
  nodeId: string;
  type: 'approval' | 'input' | 'selection';
  status: string;
  requestData: {
    type: string;
    message: string;
    details?: string;
    fields?: Array<{ name: string; label: string; type: string; required?: boolean }>;
    options?: Array<{ label: string; value: string }>;
  };
  expiresAt?: string;
  createdAt: string;
}

function HITLRequestCard({ request, onRespond }: { request: HITLRequest; onRespond: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [selectedOption, setSelectedOption] = useState<string>('');

  const respondMutation = useMutation({
    mutationFn: (response: { action: string; data?: any; reason?: string }) =>
      hitlApi.respond(request.id, response),
    onSuccess: onRespond,
  });

  const { requestData } = request;
  const isExpired = request.expiresAt && new Date(request.expiresAt) < new Date();
  const isPending = request.status === 'pending';

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
          <AlertCircle className="text-amber-500" size={20} />
          <div>
            <p className="font-medium text-foreground">{requestData.message}</p>
            <p className="text-xs text-muted-foreground">
              Node: {request.nodeId} | Type: {requestData.type}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to={`/executions/${request.executionId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-primary hover:underline"
          >
            View Execution
          </Link>
          <span
            className={`px-2 py-1 text-xs rounded ${
              isPending
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                : request.status === 'approved'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : request.status === 'rejected'
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {request.status}
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 py-4 border-t border-border bg-muted/50">
          {requestData.details && (
            <p className="text-sm text-muted-foreground mb-4">{requestData.details}</p>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <Clock size={12} />
            <span>Created: {new Date(request.createdAt).toLocaleString()}</span>
            {request.expiresAt && (
              <span className={isExpired ? 'text-red-500' : ''}>
                | Expires: {new Date(request.expiresAt).toLocaleString()}
              </span>
            )}
          </div>

          {isPending && !isExpired ? (
            <>
              {/* Approval type */}
              {requestData.type === 'approval' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => respondMutation.mutate({ action: 'approve' })}
                    disabled={respondMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle size={16} />
                    Approve
                  </button>
                  <button
                    onClick={() => respondMutation.mutate({ action: 'reject', reason: 'Rejected' })}
                    disabled={respondMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    <XCircle size={16} />
                    Reject
                  </button>
                </div>
              )}

              {/* Input type */}
              {requestData.type === 'input' && requestData.fields && (
                <div className="space-y-3">
                  {requestData.fields.map((field) => (
                    <div key={field.name}>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      <input
                        type={field.type || 'text'}
                        value={formData[field.name] || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                        className="w-full px-3 py-2 border border-input bg-background rounded focus:ring-2 focus:ring-ring transition-colors"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => respondMutation.mutate({ action: 'submit', data: formData })}
                    disabled={respondMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    <Send size={16} />
                    Submit
                  </button>
                </div>
              )}

              {/* Selection type */}
              {requestData.type === 'selection' && requestData.options && (
                <div className="space-y-3">
                  {requestData.options.map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-center p-3 border rounded cursor-pointer transition-colors ${
                        selectedOption === option.value ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`selection-${request.id}`}
                        value={option.value}
                        checked={selectedOption === option.value}
                        onChange={(e) => setSelectedOption(e.target.value)}
                        className="mr-3"
                      />
                      <span className="text-foreground">{option.label}</span>
                    </label>
                  ))}
                  <button
                    onClick={() =>
                      respondMutation.mutate({ action: 'submit', data: { selection: selectedOption } })
                    }
                    disabled={respondMutation.isPending || !selectedOption}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    <Send size={16} />
                    Submit
                  </button>
                </div>
              )}

              {respondMutation.isError && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">Failed to submit response</p>
              )}
            </>
          ) : isExpired ? (
            <p className="text-sm text-red-600 dark:text-red-400">This request has expired</p>
          ) : (
            <p className="text-sm text-muted-foreground">This request has been {request.status}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function HITLList() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['hitl', statusFilter],
    queryFn: () => hitlApi.list({ status: statusFilter || undefined }),
    refetchInterval: 5000,
  });

  const handleRespond = () => {
    queryClient.invalidateQueries({ queryKey: ['hitl'] });
  };

  return (
    <main className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-foreground">Human-in-the-Loop Requests</h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-input bg-background text-foreground rounded focus:ring-2 focus:ring-ring transition-colors"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </select>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : data?.data.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle className="mx-auto text-muted-foreground/30 mb-4" size={48} />
            <p className="text-muted-foreground">No {statusFilter || ''} HITL requests</p>
            <p className="text-sm text-muted-foreground mt-2">
              When a workflow pauses for human input, requests will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {data?.data.map((request: HITLRequest) => (
              <HITLRequestCard key={request.id} request={request} onRespond={handleRespond} />
            ))}
          </div>
        )}
      </main>
  );
}
