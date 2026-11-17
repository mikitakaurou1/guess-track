export interface ChatMessage { id: string; name: string; text: string; reaction: boolean; }
interface ChatState { connected: boolean; messages: ChatMessage[]; }
let state: ChatState = { connected: false, messages: [] };
let sender: ((text: string, reaction: boolean) => void) | null = null;
const listeners = new Set<() => void>();
export const reactions = ['😄', '😡', '😢'] as const;
export const chatSnapshot = () => state;
export const subscribeChat = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const notify = () => listeners.forEach(fn => fn());
export function sendChat(text: string, reaction = false) { sender?.(text, reaction); }
export function attachChat(ws: WebSocket, host: boolean): () => void {
  const names = new Map<string, string>();
  const limits = new Map<string, number>();
  let seq = 0;
  const emit = (obj: unknown) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); };
  const add = (m: ChatMessage) => { state = { ...state, messages: [...state.messages, m].slice(-60) }; notify(); };
  const publish = (id: string, text: unknown, reaction: unknown) => {
    if (typeof text !== 'string' || text.length > 300) return;
    const clean = text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (!clean || (reaction === true && !(reactions as readonly string[]).includes(clean))) return;
    const now = performance.now();
    if (now - (limits.get(id) ?? -Infinity) < 900) return;
    limits.set(id, now);
    const m: ChatMessage = { id: `${Date.now()}-${++seq}`, name: id === 'host' ? 'Ведущий' : (names.get(id) ?? 'Игрок'), text: clean, reaction: reaction === true };
    add(m); emit({ t: 'broadcast', data: { k: 'room_chat_message', message: m } });
  };
  const localSend = (text: string, reaction: boolean) => {
    if (host) publish('host', text, reaction);
    else emit({ t: 'to_host', data: { k: 'room_chat_send', text, reaction } });
  };
  const receive = (event: MessageEvent) => {
    let m: any; try { m = JSON.parse(event.data); } catch { return; }
    if (m.t === 'created' || m.t === 'joined') {
      sender = localSend; state = { connected: true, messages: [] }; notify();
    }
    if (host) {
      if (m.t === 'guest_joined') names.set(String(m.id), String(m.name).slice(0, 20));
      if (m.t === 'guest_left') { names.delete(String(m.id)); limits.delete(String(m.id)); }
      if (m.t === 'guest_msg' && m.data?.k === 'room_chat_send' && names.has(String(m.id))) publish(String(m.id), m.data.text, m.data.reaction);
    } else if (m.t === 'host_msg' && m.data?.k === 'room_chat_message') {
      const c = m.data.message;
      if (c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.text === 'string' && c.text.length <= 300) add({ id: c.id.slice(0,80), name: c.name.slice(0,20), text: c.text, reaction: c.reaction === true });
    }
    if (m.t === 'room_closed') close();
  };
  const close = () => { if (sender !== localSend) return; sender = null; state = { connected: false, messages: [] }; notify(); };
  ws.addEventListener('message', receive); ws.addEventListener('close', close);
  return () => { ws.removeEventListener('message', receive); ws.removeEventListener('close', close); close(); };
}
