const http = require('node:http');
const tls = require('node:tls');
const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, ...args) {
  if (event === 'request' && args[0].url?.startsWith('/api/auth/')) {
    const [req, res] = args;
    const path = req.url.split('?')[0];
    const start = Date.now();
    console.error('[boundary] request', req.method, path, 'length', req.headers['content-length'], 'complete', req.complete);
    req.once('end', () => console.error('[boundary] request-end', path, Date.now() - start));
    req.once('aborted', () => console.error('[boundary] request-aborted', path, Date.now() - start));
    res.once('finish', () => console.error('[boundary] response-finish', path, res.statusCode, Date.now() - start));
    res.once('close', () => console.error('[boundary] response-close', path, res.statusCode, Date.now() - start));
  }
  return emit.call(this, event, ...args);
};
const connect = tls.connect;
tls.connect = function (...args) {
  const options = typeof args[0] === 'object' ? args[0] : {};
  const start = Date.now();
  console.error('[boundary] tls-start', options.host, options.port, options.servername);
  const socket = connect.apply(this, args);
  socket.once('secureConnect', () => console.error('[boundary] tls-secure', options.host, Date.now() - start));
  socket.once('error', error => console.error('[boundary] tls-error', error.code, Date.now() - start));
  return socket;
};
