import { useEffect, useRef, useCallback } from 'react';

type WSEventHandler = (event: { type: string; payload: Record<string, unknown> }) => void;

export function useWebSocket(onMessage: WSEventHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(onMessage);
  handlersRef.current = onMessage;

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const ws = new WebSocket(`${protocol}//${host}:3000/ws`);

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handlersRef.current(data);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  const subscribe = useCallback((executionId: string) => {
    wsRef.current?.send(
      JSON.stringify({ type: 'subscribe:execution', executionId }),
    );
  }, []);

  const unsubscribe = useCallback((executionId: string) => {
    wsRef.current?.send(
      JSON.stringify({ type: 'unsubscribe:execution', executionId }),
    );
  }, []);

  return { subscribe, unsubscribe };
}
