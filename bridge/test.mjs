// Integration test with fake Ollama + fake STT servers (no real models needed).
import http from 'node:http';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const json = (res, o) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(o));
let lastChat;
const fake = http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
    if (req.url === '/api/chat') {
      lastChat = JSON.parse(Buffer.concat(chunks));
      const user = lastChat.messages.at(-1).content;
      if (user.includes('電話')) return json(res, { message: { content: '田中さんに発信します', tool_calls: [
        { function: { name: 'make_call', arguments: { name: '田中', evil: 'x' } } },
        { function: { name: 'rm_rf', arguments: {} } }] } });
      return json(res, { message: { content: '心拍は72です' } });
    }
    if (req.url === '/v1/audio/transcriptions') return json(res, { text: '田中に電話して' });
    res.writeHead(404).end();
  });
});
await new Promise(r => fake.listen(0, '127.0.0.1', r));
const fp = fake.address().port;
process.env.OLLAMA_URL = `http://127.0.0.1:${fp}`;
process.env.STT_URL = `http://127.0.0.1:${fp}/v1/audio/transcriptions`;
const { server } = await import('./server.mjs');
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const ws = new WebSocket(`ws://127.0.0.1:${port}`);
const next = () => new Promise(r => ws.once('message', d => r(JSON.parse(d))));
const hello = await new Promise(r => ws.once('message', d => r(JSON.parse(d))));
assert.equal(hello.type, 'hello'); assert.equal(hello.stt, true);

ws.send(JSON.stringify({ type: 'text', text: '田中に電話して', context: { contacts: ['田中'] } }));
let r = await next();
assert.deepEqual(r.calls, [{ name: 'make_call', args: { name: '田中' } }], 'unknown tools/args are dropped');
assert.match(lastChat.messages[0].content, /"contacts":\["田中"\]/, 'HUD context reaches the model');

ws.send(JSON.stringify({ type: 'audio', wav: Buffer.from('RIFF').toString('base64'), context: {} }));
r = await next();
assert.equal(r.heard, '田中に電話して'); assert.equal(r.calls[0].name, 'make_call');

ws.send(JSON.stringify({ type: 'text', text: '心拍は？', context: {} }));
r = await next();
assert.equal(r.say, '心拍は72です'); assert.deepEqual(r.calls, []);

const bad = await fetch(`http://127.0.0.1:${port}/bridge/server.mjs`); assert.equal(bad.status, 404, 'only HUD files are served');
const trav = await fetch(`http://127.0.0.1:${port}/src/..%2f..%2fetc/passwd`); assert.equal(trav.status, 404);
const xo = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'http://evil.example' });
await new Promise(r => xo.on('error', r).on('unexpected-response', r)); 
console.log('bridge tests passed'); process.exit(0);
