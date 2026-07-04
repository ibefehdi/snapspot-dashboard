import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { getConfig } from './config'

const SCHEMA_VERSION = 1

let db: Database.Database | null = null

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE log_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host TEXT NOT NULL,
      datetime TEXT NOT NULL,
      level TEXT NOT NULL,
      detail TEXT NOT NULL,
      custom TEXT NOT NULL DEFAULT '{}',
      UNIQUE(host, datetime, detail)
    );
    CREATE INDEX idx_log_events_host_datetime ON log_events(host, datetime);
    CREATE INDEX idx_log_events_detail ON log_events(detail);
    CREATE INDEX idx_log_events_level ON log_events(level);

    CREATE VIRTUAL TABLE log_events_fts USING fts5(
      detail,
      custom,
      content='log_events',
      content_rowid='id'
    );

    CREATE TRIGGER log_events_ai AFTER INSERT ON log_events BEGIN
      INSERT INTO log_events_fts(rowid, detail, custom) VALUES (new.id, new.detail, new.custom);
    END;
    CREATE TRIGGER log_events_ad AFTER DELETE ON log_events BEGIN
      INSERT INTO log_events_fts(log_events_fts, rowid, detail, custom) VALUES ('delete', old.id, old.detail, old.custom);
    END;
    CREATE TRIGGER log_events_au AFTER UPDATE ON log_events BEGIN
      INSERT INTO log_events_fts(log_events_fts, rowid, detail, custom) VALUES ('delete', old.id, old.detail, old.custom);
      INSERT INTO log_events_fts(rowid, detail, custom) VALUES (new.id, new.detail, new.custom);
    END;

    CREATE TABLE journeys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journey_id TEXT,
      host TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      is_ok INTEGER,
      duration_s REAL,
      steps TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX idx_journeys_host_started ON journeys(host, started_at DESC);
    CREATE UNIQUE INDEX idx_journeys_host_journey_id ON journeys(host, journey_id)
      WHERE journey_id IS NOT NULL;

    CREATE TABLE vitals_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host TEXT NOT NULL,
      at TEXT NOT NULL,
      cpu_temp_c REAL NOT NULL,
      mem_used_pct REAL NOT NULL,
      disk_used_pct REAL NOT NULL,
      load1 REAL NOT NULL
    );
    CREATE INDEX idx_vitals_host_at ON vitals_samples(host, at);

    CREATE TABLE status_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host TEXT NOT NULL,
      at TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE INDEX idx_status_host_at ON status_changes(host, at);

    CREATE TABLE version_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host TEXT NOT NULL,
      at TEXT NOT NULL,
      app_version TEXT NOT NULL
    );
    CREATE INDEX idx_version_host_at ON version_changes(host, at);

    CREATE TABLE alerts (
      id TEXT PRIMARY KEY,
      host TEXT NOT NULL,
      rule TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX idx_alerts_at ON alerts(at DESC);

    CREATE TABLE ingest_state (
      host TEXT PRIMARY KEY,
      last_status TEXT,
      last_version TEXT
    );
  `,
}

function runMigrations(database: Database.Database) {
  database.pragma('journal_mode = WAL')
  const current = database.pragma('user_version', { simple: true }) as number
  for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
    const sql = MIGRATIONS[v]
    if (!sql) continue
    database.exec(sql)
    database.pragma(`user_version = ${v}`)
  }
}

export function initDb(path?: string): Database.Database {
  if (db) return db

  const cfg = getConfig()
  const dbPath = path ?? cfg.SQLITE_PATH

  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true })
  }

  db = new Database(dbPath)
  runMigrations(db)
  return db
}

export function getDb(): Database.Database {
  if (!db) {
    return initDb()
  }
  return db
}

/** For tests — reset singleton and open a fresh database. */
export function resetDb(path: string = ':memory:'): Database.Database {
  if (db) {
    db.close()
    db = null
  }
  return initDb(path)
}

export function closeDb() {
  if (db) {
    db.close()
    db = null
  }
}

export function pruneOldData() {
  const cfg = getConfig()
  const cutoff = new Date(Date.now() - cfg.HISTORY_RETENTION_DAYS * 86400000).toISOString()
  const database = getDb()

  database.prepare('DELETE FROM log_events WHERE datetime < ?').run(cutoff)
  database.prepare('DELETE FROM journeys WHERE started_at < ?').run(cutoff)
  database.prepare('DELETE FROM vitals_samples WHERE at < ?').run(cutoff)
  database.prepare('DELETE FROM status_changes WHERE at < ?').run(cutoff)
  database.prepare('DELETE FROM version_changes WHERE at < ?').run(cutoff)
  database.prepare('DELETE FROM alerts WHERE at < ?').run(cutoff)
}

let pruneTimer: ReturnType<typeof setInterval> | null = null

export function startRetentionJob() {
  if (pruneTimer) return
  void Promise.resolve().then(() => pruneOldData())
  pruneTimer = setInterval(() => {
    try {
      pruneOldData()
    }
    catch {
      // ignore prune errors
    }
  }, 24 * 60 * 60 * 1000)
}

export function stopRetentionJob() {
  if (pruneTimer) {
    clearInterval(pruneTimer)
    pruneTimer = null
  }
}
