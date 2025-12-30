// Minimal WebSocket helper for chat
// Usage: import socket from '../utils/socket';
// socket.connect(); socket.on('message', cb); socket.send({ type:'message', data });

let ws = null;
let listeners = { open: [], close: [], error: [], message: [] };
let connected = false;
let lastOptions = { host: null, recipient: null };

function buildUrl({ host = null, recipient = null } = {}) {
  // if host provided, use it directly (allowing IP:port), otherwise derive from window.location
  let protocol, base;
  if (host) {
    // host may be like '172.20.120.103:8000' or include protocol
    if (host.startsWith("ws://") || host.startsWith("wss://")) {
      base = host.replace(/\/$/, "");
      protocol = base.split(":")[0];
    } else {
      const loc = window.location;
      protocol = loc.protocol === "https:" ? "wss" : "ws";
      base = `${protocol}://${host}`;
    }
  } else {
    const loc = window.location;
    protocol = loc.protocol === "https:" ? "wss" : "ws";
    base = `${protocol}://${loc.host}`;
  }
  // build path; include recipient if provided
  const path = recipient ? `/ws/chat/${recipient}/` : `/ws/chat/`;
  return `${base}${path}`;
}

function connect({ host = null, recipient = null } = {}) {
  // if options changed, close existing socket so we recreate with new path
  const opts = { host: host || null, recipient: recipient || null };
  const sameOpts =
    lastOptions.host === opts.host &&
    String(lastOptions.recipient) === String(opts.recipient);
  if (ws && sameOpts) return ws;
  if (ws && !sameOpts) {
    try {
      ws.close();
    } catch {}
    ws = null;
    connected = false;
  }
  lastOptions = opts;
  const url = buildUrl({ host, recipient });
  try {
    const token = (() => {
      try {
        const u = JSON.parse(localStorage.getItem("user"));
        return u?.token || null;
      } catch {
        return null;
      }
    })();
    const connector = token ? `${url}?token=${encodeURIComponent(token)}` : url;
    console.debug(
      "[socket] connecting ->",
      connector,
      "lastOptions:",
      lastOptions
    );
    ws = new WebSocket(connector);

    ws.addEventListener("open", (ev) => {
      connected = true;
      console.debug("[socket] open event", ev);
      listeners.open.forEach((cb) => cb(ev));
    });
    ws.addEventListener("close", (ev) => {
      connected = false;
      console.warn("[socket] close event", {
        code: ev.code,
        reason: ev.reason,
        wasClean: ev.wasClean,
      });
      listeners.close.forEach((cb) => cb(ev));
      // attempt a reconnect after a short backoff using lastOptions
      setTimeout(() => {
        // if still not connected try reconnect with previous options
        if (!connected) {
          ws = null;
          console.debug(
            "[socket] attempting reconnect with lastOptions",
            lastOptions
          );
          connect(lastOptions);
        }
      }, 3000);
    });
    ws.addEventListener("error", (ev) => {
      console.error("[socket] error event", ev);
      listeners.error.forEach((cb) => cb(ev));
    });
    ws.addEventListener("message", (ev) => {
      let payload = null;
      try {
        payload = JSON.parse(ev.data);
      } catch (e) {
        payload = ev.data;
      }
      listeners.message.forEach((cb) => cb(payload));
    });
  } catch (err) {
    console.error("ws connect failed", err);
  }
  return ws;
}

function on(event, cb) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(cb);
  return () => {
    listeners[event] = listeners[event].filter((f) => f !== cb);
  };
}

function send(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch (err) {
    console.error("ws send failed", err);
    return false;
  }
}

function close() {
  if (!ws) return;
  try {
    ws.close();
  } finally {
    ws = null;
    connected = false;
  }
}

export default {
  connect,
  on,
  send,
  close,
  isConnected: () => !!ws && ws.readyState === WebSocket.OPEN,
};
