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
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <AlertCircle className="text-amber-500" size={20} />
          <div>
            <p className="font-medium text-gray-900">{requestData.message}</p>
            <p className="text-xs text-gray-500">
              Node: {request.nodeId} | Type: {requestData.type}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to={`/executions/${request.executionId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-blue-600 hover:underline"
          >
            View Execution
          </Link>
          <span
            className={`px-2 py-1 text-xs rounded ${
              isPending
                ? 'bg-amber-100 text-amber-700'
                : request.status === 'approved'
                ? 'bg-green-100 text-green-700'
                : request.status === 'rejected'
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {request.status}
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 py-4 border-t bg-gray-50">
          {requestData.details && (
            <p className="text-sm text-gray-600 mb-4">{requestData.details}</p>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
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
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle size={16} />
                    Approve
                  </button>
                  <button
                    onClick={() => respondMutation.mutate({ action: 'reject', reason: 'Rejected' })}
                    disabled={respondMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      <input
                        type={field.type || 'text'}
                        value={formData[field.name] || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => respondMutation.mutate({ action: 'submit', data: formData })}
                    disabled={respondMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
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
                      className={`flex items-center p-3 border rounded cursor-pointer ${
                        selectedOption === option.value ? 'border-blue-500 bg-blue-50' : 'bg-white'
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
                      {option.label}
                    </label>
                  ))}
                  <button
                    onClick={() =>
                      respondMutation.mutate({ action: 'submit', data: { selection: selectedOption } })
                    }
                    disabled={respondMutation.isPending || !selectedOption}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Send size={16} />
                    Submit
                  </button>
                </div>
              )}

              {respondMutation.isError && (
                <p className="mt-2 text-sm text-red-600">Failed to submit response</p>
              )}
            </>
          ) : isExpired ? (
            <p className="text-sm text-red-600">This request has expired</p>
          ) : (
            <p className="text-sm text-gray-500">This request has been {request.status}</p>
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
              <Link to="/executions" className="text-gray-600 hover:text-gray-900">
                Executions
              </Link>
              <Link to="/hitl" className="text-blue-600 font-medium">
                HITL Requests
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Human-in-the-Loop Requests</h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </select>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : data?.data.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle className="mx-auto text-gray-300 mb-4" size={48} />
            <p className="text-gray-500">No {statusFilter || ''} HITL requests</p>
            <p className="text-sm text-gray-400 mt-2">
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
    </div>
  );
}
