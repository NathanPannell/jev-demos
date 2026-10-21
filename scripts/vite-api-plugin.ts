import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import * as health from '../api/health.js'

type Handler = (request: Request) => Response | Promise<Response>
type Route = Partial<Record<'GET' | 'POST', Handler>>

// Mirrors the Vercel Functions in /api so `vite dev` and `vite preview` (used by e2e) serve them too.
const routes: Record<string, Route> = {
  '/api/health': health,
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

function toRequest(req: IncomingMessage, body: Buffer): Request {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value)
    else if (Array.isArray(value)) headers.set(key, value.join(', '))
  }
  if (!headers.has('x-forwarded-for') && req.socket.remoteAddress) {
    headers.set('x-forwarded-for', req.socket.remoteAddress)
  }
  const method = req.method ?? 'GET'
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : new Uint8Array(body),
  })
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(Buffer.from(await response.arrayBuffer()))
}

const middleware: Connect.NextHandleFunction = (req, res, next) => {
  const path = (req.url ?? '').split('?')[0]
  const route = routes[path]
  if (!route) return next()
  const handler = route[(req.method ?? 'GET') as 'GET' | 'POST']
  if (!handler) {
    res.statusCode = 405
    res.end()
    return
  }
  readBody(req)
    .then((body) => handler(toRequest(req, body)))
    .then((response) => send(res, response))
    .catch(next)
}

export function apiPlugin(): Plugin {
  return {
    name: 'jev-api',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
