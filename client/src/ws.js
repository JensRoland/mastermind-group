let socket = null;
let listeners = [];
let reconnectTimer = null;
let currentThreadId = null;

export function connectWebSocket() {
  if (socket && socket.readyState <= 1) return; // already connected or connecting

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

  socket.onopen = () => {
    console.log('WebSocket connected');
    // Re-subscribe to the current thread after reconnect
    if (currentThreadId) {
      socket.send(JSON.stringify({ type: 'subscribe', threadId: currentThreadId }));
    }
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      listeners.forEach(fn => fn(data));
    } catch (e) {
      // ignore malformed messages
    }
  };

  socket.onclose = () => {
    console.log('WebSocket disconnected, reconnecting...');
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWebSocket, 3000);
  };

  socket.onerror = () => {
    socket.close();
  };
}

export function subscribe(threadId) {
  currentThreadId = threadId;
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'subscribe', threadId }));
  }
}

export function unsubscribe() {
  currentThreadId = null;
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'unsubscribe' }));
  }
}

export function onMessage(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter(l => l !== fn);
  };
}
