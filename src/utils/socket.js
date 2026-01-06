// Minimal WebSocket helper for chat
// Usage: import socket from '../utils/socket';
// socket.connect(); socket.on('message', cb); socket.send({ type:'message', data });

let ws = null;
let listeners = { open: [], close: [], error: [], message: [] };
let connected = false;
let lastOptions = { host: null, recipient: null, path: null };
let reconnectTimer = null;
let manualClose = false;

function buildUrl({ host = null, recipient = null, path = null } = {}) {
  // if host provided, use it directly (allowing IP:port), otherwise derive from window.location
  let protocol, base;
  if (host) {
    // host may be like '172.20.120.103:8000' or include protocol
    // strip common http/https/ws protocols if present
    host = host.replace(/^\s+|\s+$/g, "").replace(/\/$/, "");
    if (/^https?:\/\//i.test(host)) host = host.replace(/^https?:\/\//i, "");
    if (/^wss?:\/\//i.test(host)) host = host.replace(/^wss?:\/\//i, "");
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
  // build path; prefer explicit path argument, otherwise use recipient-based chat path
  const finalPath = path
    ? path.replace(/(^\/|\/$)/g, "").startsWith("ws")
      ? `/${path.replace(/^\/+/, "")}`
      : `/${path.replace(/^\/+/, "")}`
    : recipient
    ? `/ws/chat/${recipient}/`
    : `/ws/chat/`;
  return `${base}${finalPath}`;
}

function connect({ host = null, recipient = null, path = null } = {}) {
  // if options changed, close existing socket so we recreate with new path
  const opts = {
    host: host || null,
    recipient: recipient || null,
    path: path || null,
  };
  const sameOpts =
    lastOptions.host === opts.host &&
    String(lastOptions.recipient) === String(opts.recipient) &&
    String(lastOptions.path) === String(opts.path);
  // if already connected or connecting with same options, reuse
  if (
    ws &&
    sameOpts &&
    (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
  )
    return ws;
  if (ws && !sameOpts) {
    try {
      ws.close();
    } catch {}
    ws = null;
    connected = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }
  lastOptions = opts;
  const url = buildUrl({ host, recipient });
  // if a custom path was provided, include it in the built URL
  const finalUrl = buildUrl({ host, recipient, path });
  try {
    const token = (() => {
      try {
        const u = JSON.parse(localStorage.getItem("user"));
        return u?.token || null;
      } catch {
        return null;
      }
    })();
    const connector = token
      ? `${finalUrl}?token=${encodeURIComponent(token)}`
      : finalUrl;
    console.debug(
      "[socket] connecting ->",
      connector,
      "lastOptions:",
      lastOptions
    );
    // avoid creating new WebSocket if previous exists and is connecting/open (guard above), but ensure we start fresh
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
      // if this close was caused by manual close() call, do not reconnect
      if (manualClose) {
        manualClose = false;
        return;
      }
      // schedule a single reconnect attempt if not already scheduled
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (!connected) {
            ws = null;
            console.debug(
              "[socket] attempting reconnect with lastOptions",
              lastOptions
            );
            try {
              connect(lastOptions);
            } catch (e) {
              console.error("reconnect failed", e);
            }
          }
        }, 3000);
      }
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
    manualClose = true;
    ws.close();
  } finally {
    ws = null;
    connected = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }
}

export default {
  connect,
  on,
  send,
  close,
  isConnected: () => !!ws && ws.readyState === WebSocket.OPEN,
};

// --- multi-connection factory -------------------------------------------------
// returns an isolated connection handle with same small API: connect/on/send/close/isConnected
const connections = new Map();

function buildFinalUrl({ host = null, recipient = null, path = null } = {}) {
  return buildUrl({ host, recipient, path });
}

function createConnection({ host = null, recipient = null, path = null } = {}) {
  const finalUrl = buildFinalUrl({ host, recipient, path });
  if (connections.has(finalUrl)) {
    return connections.get(finalUrl).handle;
  }

  let localWs = null;
  let localListeners = { open: [], close: [], error: [], message: [] };
  let localConnected = false;
  let localReconnect = null;
  let localManualClose = false;

  function localBuildConnector() {
    const token = (() => {
      try {
        const u = JSON.parse(localStorage.getItem("user"));
        return u?.token || null;
      } catch {
        return null;
      }
    })();
    return token ? `${finalUrl}?token=${encodeURIComponent(token)}` : finalUrl;
  }

  function localConnect() {
    if (
      localWs &&
      (localWs.readyState === WebSocket.OPEN ||
        localWs.readyState === WebSocket.CONNECTING)
    )
      return localWs;
    try {
      const conn = localBuildConnector();
      localWs = new WebSocket(conn);
      localWs.addEventListener("open", (ev) => {
        localConnected = true;
        localListeners.open.forEach((cb) => cb(ev));
      });
      localWs.addEventListener("close", (ev) => {
        localConnected = false;
        localListeners.close.forEach((cb) => cb(ev));
        if (localManualClose) {
          localManualClose = false;
          return;
        }
        if (!localReconnect) {
          localReconnect = setTimeout(() => {
            localReconnect = null;
            if (!localConnected) {
              localWs = null;
              localConnect();
            }
          }, 3000);
        }
      });
      localWs.addEventListener("error", (ev) =>
        localListeners.error.forEach((cb) => cb(ev))
      );
      localWs.addEventListener("message", (ev) => {
        let payload = null;
        try {
          payload = JSON.parse(ev.data);
        } catch (e) {
          payload = ev.data;
        }
        localListeners.message.forEach((cb) => cb(payload));
      });
    } catch (e) {
      console.error("local ws connect failed", e);
    }
    return localWs;
  }

  function localOn(event, cb) {
    if (!localListeners[event]) localListeners[event] = [];
    localListeners[event].push(cb);
    return () => {
      localListeners[event] = localListeners[event].filter((f) => f !== cb);
    };
  }

  function localSend(obj) {
    if (!localWs || localWs.readyState !== WebSocket.OPEN) return false;
    try {
      localWs.send(JSON.stringify(obj));
      return true;
    } catch (err) {
      console.error("local ws send failed", err);
      return false;
    }
  }

  function localClose() {
    if (!localWs) return;
    try {
      localManualClose = true;
      localWs.close();
    } finally {
      localWs = null;
      localConnected = false;
      if (localReconnect) {
        clearTimeout(localReconnect);
        localReconnect = null;
      }
      connections.delete(finalUrl);
    }
  }

  const handle = {
    connect: localConnect,
    on: localOn,
    send: localSend,
    close: localClose,
    isConnected: () => !!localWs && localWs.readyState === WebSocket.OPEN,
  };

  connections.set(finalUrl, { handle, localWs });
  // start connecting immediately
  handle.connect();
  return handle;
}

export { createConnection };
