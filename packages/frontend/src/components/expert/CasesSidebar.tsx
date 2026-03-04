// Cases Sidebar - shows cases for current domain + progress widget

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { casesApi } from '@/api/client';
import { CaseProgressWidget } from './CaseProgressWidget';

interface CasesSidebarProps {
  domainId: string;
  currentCaseId: string;
  steps: any[];
}

const STATUS_ICON: Record<string, typeof Clock> = {
  open: Clock,
  completed: CheckCircle,
  abandoned: XCircle,
};

const STATUS_COLOR: Record<string, string> = {
  open: 'text-blue-500',
  completed: 'text-green-500',
  abandoned: 'text-gray-400',
};

export function CasesSidebar({ domainId, currentCaseId, steps }: CasesSidebarProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [progressOpen, setProgressOpen] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['sidebar-cases', domainId],
    queryFn: () => casesApi.list({ domain_id: domainId }),
  });

  const createMutation = useMutation({
    mutationFn: () => casesApi.create({ domainId }),
    onSuccess: (newCase: any) => {
      queryClient.invalidateQueries({ queryKey: ['sidebar-cases', domainId] });
      navigate(`/cases/${newCase.id}/chat`);
    },
  });

  const cases = data?.data || [];

  if (collapsed) {
    return (
      <div className="w-10 bg-card border-r border-border flex flex-col items-center py-3 flex-shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Expand sidebar"
        >
          <PanelLeftOpen size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 bg-card border-r border-border flex flex-col h-full flex-shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Cases</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
            title="New Case"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>
      </div>

      {/* Cases list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
        ) : cases.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            <MessageSquare size={20} className="mx-auto mb-2 opacity-50" />
            No cases yet
          </div>
        ) : (
          <div className="divide-y divide-border">
            {cases.map((caseItem: any) => {
              const isActive = caseItem.id === currentCaseId;
              const StatusIcon = STATUS_ICON[caseItem.status] || Clock;
              const statusColor = STATUS_COLOR[caseItem.status] || 'text-gray-400';
              return (
                <button
                  key={caseItem.id}
                  onClick={() => navigate(`/cases/${caseItem.id}/chat`)}
                  className={`w-full p-3 text-left hover:bg-accent/50 transition-colors ${
                    isActive ? 'bg-accent' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <StatusIcon size={14} className={statusColor} />
                    <span className="text-sm truncate flex-1">
                      {caseItem.title || 'Untitled Case'}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 ml-5">
                    {new Date(caseItem.createdAt).toLocaleDateString()}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Progress Widget Section */}
      {steps.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setProgressOpen(!progressOpen)}
            className="w-full p-3 flex items-center justify-between text-sm font-semibold text-foreground hover:bg-accent/50 transition-colors"
          >
            Progress
            {progressOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {progressOpen && (
            <div className="max-h-48 overflow-y-auto pb-2">
              <CaseProgressWidget steps={steps} />
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="p-2 border-t border-border text-center">
        <span className="text-xs text-muted-foreground">
          {cases.length} case{cases.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
