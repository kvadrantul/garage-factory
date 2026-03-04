// Artifacts Panel - shows case artifacts grouped by source type

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  FileSpreadsheet,
  Download,
  Trash2,
  ChevronDown,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  Upload,
  Wrench,
  Sparkles,
  Package,
} from 'lucide-react';
import { artifactsApi } from '@/api/client';

interface ArtifactsPanelProps {
  caseId: string;
}

const SOURCE_LABELS: Record<string, string> = {
  upload: 'Uploads',
  skill_output: 'Skill Outputs',
  generated: 'Generated',
};

const SOURCE_ICONS: Record<string, typeof Upload> = {
  upload: Upload,
  skill_output: Wrench,
  generated: Sparkles,
};

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return FileSpreadsheet;
  return FileText;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ArtifactsPanel({ caseId }: ArtifactsPanelProps) {
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['case-artifacts', caseId],
    queryFn: () => artifactsApi.list(caseId),
    refetchInterval: 5000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => artifactsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-artifacts', caseId] });
    },
  });

  const artifacts = data?.data || [];

  // Group by sourceType
  const groups: Record<string, any[]> = {};
  for (const art of artifacts) {
    const key = art.sourceType || 'upload';
    if (!groups[key]) groups[key] = [];
    groups[key].push(art);
  }

  if (collapsed) {
    return (
      <div className="w-10 bg-card border-l border-border flex flex-col items-center py-3 flex-shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Show artifacts"
        >
          <PanelRightOpen size={16} />
        </button>
        {artifacts.length > 0 && (
          <span className="mt-2 text-[10px] font-medium text-muted-foreground bg-muted rounded-full w-5 h-5 flex items-center justify-center">
            {artifacts.length}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-72 bg-card border-l border-border flex flex-col h-full flex-shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={14} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Artifacts</h3>
          {artifacts.length > 0 && (
            <span className="text-[10px] font-medium bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
              {artifacts.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Collapse panel"
        >
          <PanelRightClose size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
        ) : artifacts.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            <Package size={20} className="mx-auto mb-2 opacity-50" />
            No artifacts yet
            <p className="text-xs mt-1">
              Upload files or run skills to see artifacts here.
            </p>
          </div>
        ) : (
          <div className="py-1">
            {(['upload', 'skill_output', 'generated'] as const).map((sourceType) => {
              const items = groups[sourceType];
              if (!items || items.length === 0) return null;
              return (
                <ArtifactGroup
                  key={sourceType}
                  sourceType={sourceType}
                  items={items}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  isDeleting={deleteMutation.isPending}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ArtifactGroup({
  sourceType,
  items,
  onDelete,
  isDeleting,
}: {
  sourceType: string;
  items: any[];
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const [open, setOpen] = useState(true);
  const Icon = SOURCE_ICONS[sourceType] || Package;
  const label = SOURCE_LABELS[sourceType] || sourceType;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:bg-accent/50 transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Icon size={12} />
        <span>{label}</span>
        <span className="ml-auto text-[10px] bg-muted rounded-full px-1.5">{items.length}</span>
      </button>
      {open && (
        <div className="px-1">
          {items.map((art: any) => (
            <ArtifactRow key={art.id} artifact={art} onDelete={onDelete} isDeleting={isDeleting} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArtifactRow({
  artifact,
  onDelete,
  isDeleting,
}: {
  artifact: any;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const FileIcon = getFileIcon(artifact.name);
  const meta = artifact.metadata as Record<string, any> | undefined;
  const rowCount = meta?.rowCount;

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 mx-1 rounded hover:bg-accent/50 transition-colors group">
      <FileIcon size={14} className="text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" title={artifact.name}>
          {artifact.name}
        </p>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{formatFileSize(artifact.size)}</span>
          {rowCount != null && (
            <>
              <span>-</span>
              <span>{rowCount} rows</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <a
          href={`/${artifact.filePath}`}
          download={artifact.name}
          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Download"
        >
          <Download size={12} />
        </a>
        <button
          onClick={() => onDelete(artifact.id)}
          disabled={isDeleting}
          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
