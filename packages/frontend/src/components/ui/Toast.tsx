import { createContext, useCallback, useContext, useState } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ToastEntry {
  id: string;
  title: string;
  description?: string;
  variant: 'default' | 'success' | 'destructive';
}

interface ToastContextValue {
  toast: (opts: Omit<ToastEntry, 'id'>) => void;
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Variant styles                                                     */
/* ------------------------------------------------------------------ */

const variantClasses: Record<ToastEntry['variant'], string> = {
  default: 'border-l-4 border-l-blue-500',
  success: 'border-l-4 border-l-green-500',
  destructive: 'border-l-4 border-l-red-500',
};

const titleClasses: Record<ToastEntry['variant'], string> = {
  default: 'text-foreground',
  success: 'text-green-500',
  destructive: 'text-red-500',
};

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const toast = useCallback((opts: Omit<ToastEntry, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...opts, id }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider duration={4000}>
        {children}

        {toasts.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            className={`bg-card border border-border rounded-md shadow-lg p-4 pr-8 relative ${variantClasses[t.variant]} data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-5 data-[state=closed]:animate-out data-[state=closed]:fade-out`}
            onOpenChange={(open) => {
              if (!open) dismiss(t.id);
            }}
          >
            <ToastPrimitive.Title className={`text-sm font-semibold ${titleClasses[t.variant]}`}>
              {t.title}
            </ToastPrimitive.Title>
            {t.description && (
              <ToastPrimitive.Description className="text-xs text-muted-foreground mt-1">
                {t.description}
              </ToastPrimitive.Description>
            )}
            <ToastPrimitive.Close className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
              <X size={14} />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}

        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
