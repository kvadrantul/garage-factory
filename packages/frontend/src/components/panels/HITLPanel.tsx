// HITL Panel Component

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, CheckCircle, XCircle, Send, AlertCircle } from 'lucide-react';
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
    timeoutSeconds?: number;
  };
  expiresAt?: string;
  createdAt: string;
}

interface HITLPanelProps {
  request: HITLRequest;
  onResolved: () => void;
}

export function HITLPanel({ request, onResolved }: HITLPanelProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [selectedOption, setSelectedOption] = useState<string>('');

  const respondMutation = useMutation({
    mutationFn: (response: { action: string; data?: any; reason?: string }) =>
      hitlApi.respond(request.id, response),
    onSuccess: () => {
      onResolved();
    },
  });

  const handleApprove = () => {
    respondMutation.mutate({ action: 'approve' });
  };

  const handleReject = () => {
    respondMutation.mutate({ action: 'reject', reason: 'Rejected by user' });
  };

  const handleSubmitInput = () => {
    respondMutation.mutate({ action: 'submit', data: formData });
  };

  const handleSubmitSelection = () => {
    respondMutation.mutate({ action: 'submit', data: { selection: selectedOption } });
  };

  const { requestData } = request;
  const isExpired = request.expiresAt && new Date(request.expiresAt) < new Date();

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white rounded-lg shadow-xl border border-amber-200 overflow-hidden z-50">
      {/* Header */}
      <div className="bg-amber-50 px-4 py-3 border-b border-amber-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="text-amber-500" size={20} />
            <span className="font-medium text-amber-800">
              {requestData.type === 'approval' && 'Approval Required'}
              {requestData.type === 'input' && 'Input Required'}
              {requestData.type === 'selection' && 'Selection Required'}
            </span>
          </div>
          <button
            onClick={onResolved}
            className="p-1 hover:bg-amber-100 rounded text-amber-600"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Message */}
        <p className="text-gray-900 font-medium mb-2">{requestData.message}</p>

        {/* Details */}
        {requestData.details && (
          <p className="text-sm text-gray-600 mb-4">{requestData.details}</p>
        )}

        {/* Node info */}
        <p className="text-xs text-gray-400 mb-4">
          Node: {request.nodeId}
        </p>

        {isExpired ? (
          <div className="p-3 bg-red-50 text-red-700 rounded text-sm">
            This request has expired
          </div>
        ) : (
          <>
            {/* Approval type */}
            {requestData.type === 'approval' && (
              <div className="flex gap-2">
                <button
                  onClick={handleApprove}
                  disabled={respondMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckCircle size={16} />
                  Approve
                </button>
                <button
                  onClick={handleReject}
                  disabled={respondMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
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
                    {field.type === 'textarea' ? (
                      <textarea
                        value={formData[field.name] || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        rows={3}
                      />
                    ) : (
                      <input
                        type={field.type || 'text'}
                        value={formData[field.name] || ''}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))
                        }
                        className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    )}
                  </div>
                ))}
                <button
                  onClick={handleSubmitInput}
                  disabled={respondMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send size={16} />
                  Submit
                </button>
              </div>
            )}

            {/* Selection type */}
            {requestData.type === 'selection' && requestData.options && (
              <div className="space-y-3">
                <div className="space-y-2">
                  {requestData.options.map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-center p-3 border rounded cursor-pointer transition-colors ${
                        selectedOption === option.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="selection"
                        value={option.value}
                        checked={selectedOption === option.value}
                        onChange={(e) => setSelectedOption(e.target.value)}
                        className="mr-3"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={handleSubmitSelection}
                  disabled={respondMutation.isPending || !selectedOption}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send size={16} />
                  Submit Selection
                </button>
              </div>
            )}
          </>
        )}

        {/* Error */}
        {respondMutation.isError && (
          <div className="mt-3 p-2 bg-red-50 text-red-700 text-sm rounded">
            Failed to submit response
          </div>
        )}
      </div>
    </div>
  );
}
