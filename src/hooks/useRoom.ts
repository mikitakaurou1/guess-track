import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuestInfo, GuestSnapshot } from '../types/room';

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
const wsUrl = () =>
  API
    ? `${API.replace(/^http/, 'ws')}/ws`
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

/* ---------- Хост ---------- */
export function useHostRoom(onGuestMessage: (guestId: string, data: any) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [guests, setGuests] = useState<GuestInfo[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cb = useRef(onGuestMessage);
  cb.current = onGuestMessage;

  const open = useCallback(() => {
    if (wsRef.current) return;
    setError(null);
    setConnecting(true);
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ t: 'create' }));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'created') {
        setCode(m.code);
        setConnecting(false);
      } else if (m.t === 'guest_joined') {
        setGuests((g) => [...g.filter((x) => x.id !== m.id), { id: m.id, name: m.name }]);
      } else if (m.t === 'guest_left') {
        setGuests((g) => g.filter((x) => x.id !== m.id));
      } else if (m.t === 'guest_msg') {
        cb.current(m.id, m.data);
      }
    };
    ws.onerror = () => setError('Нет соединения с сервером комнат. Запущен ли «node server/index.js»?');
    ws.onclose = () => {
      wsRef.current = null;
      setCode(null);
      setGuests([]);
      setConnecting(false);
    };
  }, []);

  const close = useCallback(() => wsRef.current?.close(), []);

  const send = useCallback((obj: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }, []);

  useEffect(() => () => wsRef.current?.close(), []);

  return { code, guests, connecting, error, open, close, send };
}

export type HostRoom = ReturnType<typeof useHostRoom>;

/* ---------- Гость ---------- */
export function useGuestRoom() {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'joined' | 'closed'>('idle');
  const [myId, setMyId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<GuestSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const join = useCallback((code: string, name: string) => {
    wsRef.current?.close();
    setError(null);
    setStatus('connecting');
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', code, name }));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'joined') {
        setMyId(m.id);
        setStatus('joined');
      } else if (m.t === 'host_msg') {
        setSnapshot(m.data);
      } else if (m.t === 'room_closed') {
        setStatus('closed');
      } else if (m.t === 'error') {
        setError(m.message);
        setStatus('idle');
        ws.close();
      }
    };
    ws.onerror = () => {
      setError('Не удалось подключиться к серверу');
      setStatus('idle');
    };
    ws.onclose = () => setStatus((s) => (s === 'joined' ? 'closed' : s === 'connecting' ? 'idle' : s));
  }, []);

  const send = useCallback((data: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'to_host', data }));
  }, []);

  const leave = useCallback(() => {
    wsRef.current?.close();
    setStatus('idle');
    setSnapshot(null);
  }, []);

  useEffect(() => () => wsRef.current?.close(), []);

  return { status, myId, snapshot, error, join, send, leave };
}
