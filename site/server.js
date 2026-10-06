'use strict';

const { createHash, randomBytes } = require('node:crypto');
const { createServer: createHttpServer } = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const { mkdirSync, readFileSync, statSync } = require('node:fs');
const path = require('node:path');

const siteDirectory = __dirname;
const defaultDatabasePath = path.join(siteDirectory, '..', 'data', 'surveys.sqlite');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function createDatabase(databasePath = defaultDatabasePath) {
  const resolvedPath = path.resolve(databasePath);
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const database = new DatabaseSync(resolvedPath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS survey_invites (
      id INTEGER PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS survey_submissions (
      id INTEGER PRIMARY KEY,
      invite_id INTEGER NOT NULL UNIQUE REFERENCES survey_invites(id),
      answers_json TEXT NOT NULL,
      score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 5),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS survey_clients (
      client_hash TEXT PRIMARY KEY,
      invite_id INTEGER NOT NULL UNIQUE REFERENCES survey_invites(id),
      created_at TEXT NOT NULL
    );
  `);
  return database;
}

function createSqliteStore(database) {
  let transactionTail = Promise.resolve();

  const store = {
    kind: 'sqlite',
    async get(sql, parameters = []) {
      return database.prepare(sql).get(...parameters) || null;
    },
    async run(sql, parameters = []) {
      return database.prepare(sql).run(...parameters);
    },
    async health() {
      database.prepare('SELECT 1').get();
    },
    async transaction(callback) {
      let release;
      const previousTransaction = transactionTail;
      transactionTail = new Promise((resolve) => {
        release = resolve;
      });
      await previousTransaction;
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = await callback(store);
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      } finally {
        release();
      }
    }
  };

  return store;
}

function createPostgresStore(pool) {
  const parameterize = (sql) => {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
  };

  const store = {
    kind: 'postgres',
    async get(sql, parameters = []) {
      const result = await pool.query(parameterize(sql), parameters);
      return result.rows[0] || null;
    },
    async run(sql, parameters = []) {
      return pool.query(parameterize(sql), parameters);
    },
    async health() {
      await pool.query('SELECT 1');
    },
    async transaction(callback) {
      const client = await pool.connect();
      const transactionStore = {
        get: async (sql, parameters = []) => {
          const result = await client.query(parameterize(sql), parameters);
          return result.rows[0] || null;
        },
        run: (sql, parameters = []) => client.query(parameterize(sql), parameters)
      };

      try {
        await client.query('BEGIN');
        const result = await callback(transactionStore);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    }
  };

  return store;
}

function createPostgresDatabase(connectionString) {
  if (!connectionString) {
    throw new Error('DATABASE_URL é obrigatória para conectar ao Supabase.');
  }

  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: true },
    max: 5,
    connectionTimeoutMillis: 10000
  });
  const store = createPostgresStore(pool);
  store.ready = pool.query(`
    CREATE TABLE IF NOT EXISTS survey_invites (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      code_hash CHAR(64) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS survey_submissions (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      invite_id BIGINT NOT NULL UNIQUE REFERENCES survey_invites(id),
      answers_json JSONB NOT NULL,
      score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 5),
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS survey_clients (
      client_hash CHAR(64) PRIMARY KEY,
      invite_id BIGINT NOT NULL UNIQUE REFERENCES survey_invites(id),
      created_at TIMESTAMPTZ NOT NULL
    );
    ALTER TABLE survey_invites ENABLE ROW LEVEL SECURITY;
    ALTER TABLE survey_submissions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE survey_clients ENABLE ROW LEVEL SECURITY;
  `);
  return store;
}

function normalizeCode(code) {
  if (typeof code !== 'string') return null;
  const normalized = code.replaceAll('-', '').trim().toUpperCase();
  return /^[A-F0-9]{32}$/.test(normalized) ? normalized : null;
}

function normalizeClientId(clientId) {
  if (typeof clientId !== 'string') return null;
  const normalized = clientId.trim().toUpperCase();
  return /^[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}$/.test(normalized)
    ? normalized
    : null;
}

function hashCode(code) {
  return createHash('sha256').update(code).digest('hex');
}

function issueInviteCode(database) {
  const code = randomBytes(16).toString('hex').toUpperCase();
  database.prepare(
    'INSERT INTO survey_invites (code_hash, created_at) VALUES (?, ?)'
  ).run(hashCode(code), new Date().toISOString());
  return code.match(/.{1,8}/g).join('-');
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const contentLength = Number(request.headers['content-length'] || 0);
  if (contentLength > 8192) {
    const error = new Error('Request body is too large.');
    error.statusCode = 413;
    throw error;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8192) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function createServer({ database = createDatabase(), staticDirectory = siteDirectory } = {}) {
  const resolvedStaticDirectory = path.resolve(staticDirectory);
  const store = database.kind ? database : createSqliteStore(database);
  const failedAccessAttempts = new Map();
  const registrationAttempts = new Map();

  function checkRateLimit(request, attempts, maxAttempts, windowMs) {
    const now = Date.now();
    const address = request.socket.remoteAddress || 'unknown';
    const record = attempts.get(address);
    if (record && record.resetAt > now && record.count >= maxAttempts) return false;
    if (!record || record.resetAt <= now) {
      attempts.set(address, { count: 1, resetAt: now + windowMs });
    } else {
      record.count += 1;
    }
    return true;
  }

  async function handleSurveyRegistration(request, response) {
    if (!checkRateLimit(request, registrationAttempts, 10, 24 * 60 * 60 * 1000)) {
      sendJson(response, 429, { error: 'Este navegador já atingiu o limite de novos códigos. Tente novamente amanhã.' });
      return;
    }
    const body = await readJson(request);
    const clientId = normalizeClientId(body.clientId);
    if (!clientId) {
      sendJson(response, 400, { error: 'Identificador deste navegador inválido. Recarregue a página e tente novamente.' });
      return;
    }

    const clientHash = hashCode(clientId);
    const code = randomBytes(16).toString('hex').toUpperCase();
    const createdAt = new Date().toISOString();
    try {
      const registered = await store.transaction(async (transaction) => {
        const existingClient = await transaction.get(
          'SELECT invite_id FROM survey_clients WHERE client_hash = ?',
          [clientHash]
        );
        if (existingClient) return false;

        const invite = await transaction.get(
          'INSERT INTO survey_invites (code_hash, created_at) VALUES (?, ?) RETURNING id',
          [hashCode(code), createdAt]
        );
        await transaction.run(
          'INSERT INTO survey_clients (client_hash, invite_id, created_at) VALUES (?, ?, ?)',
          [clientHash, invite.id, createdAt]
        );
        return true;
      });
      if (!registered) {
        sendJson(response, 409, { error: 'Este navegador já recebeu um código individual.' });
        return;
      }
      sendJson(response, 201, { code: code.match(/.{1,8}/g).join('-') });
    } catch (error) {
      if (
        error.code === 'ERR_SQLITE_CONSTRAINT_PRIMARYKEY' ||
        error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE' ||
        error.code === '23505'
      ) {
        sendJson(response, 409, { error: 'Este navegador já recebeu um código individual.' });
        return;
      }
      throw error;
    }
  }

  async function getInvite(code) {
    const normalizedCode = normalizeCode(code);
    if (!normalizedCode) return null;
    return store.get(
      'SELECT id, used_at FROM survey_invites WHERE code_hash = ?',
      [hashCode(normalizedCode)]
    );
  }

  async function handleSurveyAccess(request, response) {
    if (!checkRateLimit(request, failedAccessAttempts, 30, 15 * 60 * 1000)) {
      sendJson(response, 429, { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
      return;
    }
    const body = await readJson(request);
    const invite = await getInvite(body.code);
    if (!invite) {
      sendJson(response, 404, { error: 'Código não encontrado.' });
      return;
    }
    if (invite.used_at) {
      sendJson(response, 409, { error: 'Este código já foi usado.' });
      return;
    }
    sendJson(response, 200, { available: true });
  }

  async function handleSurveySubmission(request, response) {
    const body = await readJson(request);
    const normalizedCode = normalizeCode(body.code);
    const answers = body.answers;
    const questionNames = ['q1', 'q2', 'q3', 'q4', 'q5'];
    if (
      !normalizedCode ||
      !answers ||
      typeof answers !== 'object' ||
      Array.isArray(answers) ||
      Object.keys(answers).length !== questionNames.length ||
      !questionNames.every((question) =>
        Object.hasOwn(answers, question) &&
        (answers[question] === 0 || answers[question] === 1)
      )
    ) {
      sendJson(response, 400, { error: 'Responda todas as perguntas com valores válidos.' });
      return;
    }

    const codeHash = hashCode(normalizedCode);
    const score = questionNames.reduce((total, question) => total + answers[question], 0);
    const createdAt = new Date().toISOString();

    try {
      const submissionStatus = await store.transaction(async (transaction) => {
        const invite = await transaction.get(
          'SELECT id, used_at FROM survey_invites WHERE code_hash = ?',
          [codeHash]
        );
        if (!invite) return 'missing';
        if (invite.used_at) return 'used';

        await transaction.run(`
          INSERT INTO survey_submissions (invite_id, answers_json, score, created_at)
          VALUES (?, ?, ?, ?)
        `, [invite.id, JSON.stringify(answers), score, createdAt]);
        await transaction.run(
          'UPDATE survey_invites SET used_at = ? WHERE id = ? AND used_at IS NULL',
          [createdAt, invite.id]
        );
        return 'saved';
      });
      if (submissionStatus === 'missing') {
        sendJson(response, 404, { error: 'Código não encontrado.' });
        return;
      }
      if (submissionStatus === 'used') {
        sendJson(response, 409, { error: 'Este código já foi usado.' });
        return;
      }
      sendJson(response, 201, { saved: true });
    } catch (error) {
      if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
        sendJson(response, 409, { error: 'Este código já foi usado.' });
        return;
      }
      throw error;
    }
  }

  function serveStatic(request, response, pathname) {
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathname);
    } catch {
      sendJson(response, 400, { error: 'Endereço inválido.' });
      return;
    }

    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    const filePath = path.resolve(resolvedStaticDirectory, relativePath);
    if (!filePath.startsWith(`${resolvedStaticDirectory}${path.sep}`)) {
      sendJson(response, 404, { error: 'Arquivo não encontrado.' });
      return;
    }

    try {
      if (!statSync(filePath).isFile()) {
        sendJson(response, 404, { error: 'Arquivo não encontrado.' });
        return;
      }
      const body = readFileSync(filePath);
      response.writeHead(200, {
        'Cache-Control': 'no-cache',
        'Content-Length': body.length,
        'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
        'Content-Security-Policy': "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        sendJson(response, 404, { error: 'Arquivo não encontrado.' });
        return;
      }
      throw error;
    }
  }

  return createHttpServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, 'http://localhost');
      if (requestUrl.pathname === '/health') {
        try {
          await store.health();
          sendJson(response, 200, { status: 'ok' });
        } catch (error) {
          console.error('Verificação de saúde do banco falhou:', error);
          sendJson(response, 503, { status: 'unavailable' });
        }
        return;
      }
      if (
        requestUrl.pathname === '/api/survey/register' ||
        requestUrl.pathname === '/api/survey/access' ||
        requestUrl.pathname === '/api/survey/submit'
      ) {
        if (request.method !== 'POST') {
          response.setHeader('Allow', 'POST');
          sendJson(response, 405, { error: 'Método não permitido.' });
          return;
        }
        if (!request.headers['content-type']?.startsWith('application/json')) {
          sendJson(response, 415, { error: 'Envie os dados como JSON.' });
          return;
        }
        if (requestUrl.pathname === '/api/survey/register') {
          await handleSurveyRegistration(request, response);
        } else if (requestUrl.pathname === '/api/survey/access') {
          await handleSurveyAccess(request, response);
        } else {
          await handleSurveySubmission(request, response);
        }
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        sendJson(response, 405, { error: 'Método não permitido.' });
        return;
      }
      serveStatic(request, response, requestUrl.pathname);
    } catch (error) {
      if (error.statusCode) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }
      console.error('Erro ao processar requisição:', error);
      sendJson(response, 500, { error: 'Erro interno do servidor.' });
    }
  });
}

if (require.main === module) {
  async function startServer() {
    const database = process.env.DATABASE_URL
      ? createPostgresDatabase(process.env.DATABASE_URL)
      : createDatabase(process.env.DB_PATH || defaultDatabasePath);
    if (database.ready) await database.ready;

    const server = createServer({ database });
    const port = Number(process.env.PORT || 3000);
    const host = process.env.HOST || '127.0.0.1';
    server.listen(port, host, () => {
      console.log(`Site iniciado em http://${host}:${port}`);
      console.log(process.env.DATABASE_URL ? 'Banco de dados: Supabase PostgreSQL' : `Banco de dados SQLite: ${process.env.DB_PATH || defaultDatabasePath}`);
    });
    const shutdown = () => {
      server.close(async () => {
        if (database.close) await database.close();
        else database.close();
        process.exit(0);
      });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  startServer().catch((error) => {
    console.error('Não foi possível iniciar o servidor:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  createDatabase,
  createPostgresDatabase,
  createPostgresStore,
  createServer,
  createSqliteStore,
  issueInviteCode,
  normalizeClientId,
  normalizeCode
};
