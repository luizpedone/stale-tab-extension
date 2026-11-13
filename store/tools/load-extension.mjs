// Loads an unpacked extension through the CDP Extensions domain.
// Usage: node cdp-load.mjs <port> <absolute-path>
const [port, extPath] = process.argv.slice(2);

const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, (m) => (m.error ? reject(new Error(method + ": " + m.error.message)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

await new Promise((r) => ws.addEventListener("open", r, { once: true }));

try {
  const res = await send("Extensions.loadUnpacked", { path: extPath });
  console.log("loaded:", JSON.stringify(res));
} catch (e) {
  console.error("FAILED", e.message);
  process.exitCode = 1;
}
ws.close();
