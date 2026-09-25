// Shared request/response helpers for the /api functions.
// Files under api/_lib are not routes: Vercel skips paths starting with "_".

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Wraps a handler so every failure becomes a clean JSON error. Unexpected
// errors are logged server-side and never echoed (no stack traces to clients).
export function handler(methods, fn) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        throw new HttpError(405, 'method_not_allowed', `Use ${methods.join(' or ')}.`);
      }
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.code, message: err.message });
      } else {
        console.error(err);
        sendJson(res, 500, { error: 'server_error', message: 'Something went wrong on our end. Please try again.' });
      }
    }
  };
}

// Vercel parses JSON bodies for us when Content-Type is application/json;
// fall back to parsing a raw string so a missing header isn't a 500.
export function jsonBody(req) {
  let body;
  try {
    body = req.body; // Vercel parses lazily and throws on malformed JSON
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be JSON.');
  }
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      throw new HttpError(400, 'invalid_json', 'Request body must be JSON.');
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'invalid_body', 'Request body must be a JSON object.');
  }
  return body;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value, field) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new HttpError(400, 'invalid_' + field, `${field} must be a UUID.`);
  }
  return value.toLowerCase();
}

export function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new HttpError(401, 'not_signed_in', 'Sign in first.');
  return match[1].trim();
}
