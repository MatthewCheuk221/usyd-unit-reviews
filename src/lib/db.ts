import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { Review, ReviewInput } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "reviews.db");

let db: Database.Database | null = null;
let nextRateLimitMaintenanceAt = 0;
const RATE_LIMIT_RETENTION_MS = 2 * 60 * 60 * 1000; // 2 hours
const RATE_LIMIT_MAINTENANCE_INTERVAL_MS = 30 * 1000; // 30 seconds
const RATE_LIMIT_MAX_ROWS = 250_000;
const REVIEW_REPORTS_RETENTION_DAYS = 30;

function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // Restrict the data directory to owner-only (rwx------). This covers
    // reviews.db, reviews.db-wal, and reviews.db-shm in one shot because
    // other OS users cannot enter the directory at all.
    try {
      fs.chmodSync(DATA_DIR, 0o700);
    } catch {
      // non-fatal — best-effort on platforms that don't support chmod
    }
    db = new Database(DB_PATH);
    // Belt-and-suspenders: also restrict the DB file itself.
    try {
      fs.chmodSync(DB_PATH, 0o600);
    } catch {
      // non-fatal
    }
    db.pragma("journal_mode = WAL");
    // Under concurrent write load, SQLite normally throws SQLITE_BUSY
    // immediately. A busy_timeout tells it to retry the lock for up to 5 s
    // before giving up, preventing spurious 500 errors under moderate traffic.
    db.pragma("busy_timeout = 5000");
    db.exec(`
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        unit_code TEXT NOT NULL,
        title TEXT NOT NULL,
        coordinator_name TEXT NOT NULL,
        lecturer_name TEXT NOT NULL,
        year INTEGER NOT NULL,
        content TEXT NOT NULL,
        grade TEXT NOT NULL,
        rating_content INTEGER NOT NULL,
        rating_workload INTEGER NOT NULL,
        rating_exam_difficulty INTEGER NOT NULL,
        rating_final_result INTEGER NOT NULL,
        reported_count INTEGER NOT NULL DEFAULT 0,
        hidden INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_unit_code ON reviews(unit_code);

      CREATE TABLE IF NOT EXISTS review_reports (
        review_id TEXT NOT NULL,
        reporter_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (review_id, reporter_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_review_reports_review_time
        ON review_reports(review_id, created_at);

      CREATE TABLE IF NOT EXISTS rate_limit_events (
        key TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rate_limit_key_time
        ON rate_limit_events(key, created_at);
      CREATE INDEX IF NOT EXISTS idx_rate_limit_created_at
        ON rate_limit_events(created_at);

      CREATE TABLE IF NOT EXISTS summary_cache (
        unit_code TEXT PRIMARY KEY,
        review_count INTEGER NOT NULL,
        review_hash TEXT NOT NULL,
        summary TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);

    // Safe schema upgrades for existing databases
    try {
      db.exec("ALTER TABLE reviews ADD COLUMN reported_count INTEGER NOT NULL DEFAULT 0");
    } catch {
      // no-op
    }
    try {
      db.exec("ALTER TABLE reviews ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0");
    } catch {
      // no-op
    }
  }
  return db;
}

function rowToReview(row: Record<string, unknown>): Review {
  return {
    id: row.id as string,
    unitCode: row.unit_code as string,
    title: row.title as string,
    coordinatorName: row.coordinator_name as string,
    lecturerName: row.lecturer_name as string,
    year: row.year as number,
    content: row.content as string,
    grade: row.grade as Review["grade"],
    ratingContent: row.rating_content as number,
    ratingWorkload: row.rating_workload as number,
    ratingExamDifficulty: row.rating_exam_difficulty as number,
    ratingFinalResult: row.rating_final_result as number,
    reportedCount: (row.reported_count as number) ?? 0,
    createdAt: row.created_at as string,
  };
}

export function getReviewsByUnit(unitCode: string): Review[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM reviews WHERE unit_code = ? AND hidden = 0 ORDER BY year DESC, created_at DESC"
    )
    .all(unitCode) as Record<string, unknown>[];
  return rows.map(rowToReview);
}

export function createReview(input: ReviewInput): Review {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO reviews (
        id, unit_code, title, coordinator_name, lecturer_name, year,
        content, grade, rating_content, rating_workload,
        rating_exam_difficulty, rating_final_result, reported_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.unitCode,
      input.title,
      input.coordinatorName,
      input.lecturerName,
      input.year,
      input.content,
      input.grade,
      input.ratingContent,
      input.ratingWorkload,
      input.ratingExamDifficulty,
      input.ratingFinalResult,
      0,
      createdAt
    );
  return {
    id,
    ...input,
    reportedCount: 0,
    createdAt,
  };
}

export function getReviewCount(unitCode: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM reviews WHERE unit_code = ? AND hidden = 0")
    .get(unitCode) as { count: number };
  return row.count;
}

export function reportReviewWithHash(
  reviewId: string,
  reporterHash: string,
  maxReportsPerWindow = 30,
  windowMs = 24 * 60 * 60 * 1000
): { ok: boolean; alreadyReported: boolean; windowExceeded: boolean } {
  const database = getDb();
  const run = database.transaction(() => {
    const exists = database
      .prepare("SELECT id FROM reviews WHERE id = ?")
      .get(reviewId) as { id: string } | undefined;

    if (!exists) {
      return { ok: false, alreadyReported: false, windowExceeded: false };
    }

    // Check per-review flood cap atomically inside the same write transaction
    // to eliminate a TOCTOU race between the count check and the insert.
    const thresholdIso = new Date(Date.now() - windowMs).toISOString();
    const windowCount = (
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM review_reports WHERE review_id = ? AND created_at >= ?"
        )
        .get(reviewId, thresholdIso) as { count: number }
    ).count;

    if (windowCount >= maxReportsPerWindow) {
      return { ok: false, alreadyReported: false, windowExceeded: true };
    }

    const inserted = database
      .prepare(
        "INSERT OR IGNORE INTO review_reports (review_id, reporter_hash, created_at) VALUES (?, ?, ?)"
      )
      .run(reviewId, reporterHash, new Date().toISOString());

    if (inserted.changes === 0) {
      return { ok: true, alreadyReported: true, windowExceeded: false };
    }

    database
      .prepare(
        "UPDATE reviews SET reported_count = COALESCE(reported_count, 0) + 1 WHERE id = ?"
      )
      .run(reviewId);

    return { ok: true, alreadyReported: false, windowExceeded: false };
  });

  return run();
}

export function checkRateLimitPersistent(
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const threshold = now - windowMs;
  const database = getDb();
  const shouldRunMaintenance = now >= nextRateLimitMaintenanceAt;
  if (shouldRunMaintenance) {
    nextRateLimitMaintenanceAt = now + RATE_LIMIT_MAINTENANCE_INTERVAL_MS;
  }

  const run = database.transaction(() => {
    // Deterministic periodic maintenance prevents unbounded growth under
    // key-churn attacks (e.g. rapidly rotating client identifiers).
    if (shouldRunMaintenance) {
      database
        .prepare("DELETE FROM rate_limit_events WHERE created_at < ?")
        .run(now - RATE_LIMIT_RETENTION_MS);
      database
        .prepare("DELETE FROM summary_cache WHERE expires_at < ?")
        .run(now);
      // Prune old report records — they are only needed for the 24 h dedup
      // window. Keeping 30 days is generous; anything older is dead weight.
      const reportCutoff = new Date(
        now - REVIEW_REPORTS_RETENTION_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();
      database
        .prepare("DELETE FROM review_reports WHERE created_at < ?")
        .run(reportCutoff);
      database
        .prepare(
          `DELETE FROM rate_limit_events
           WHERE rowid IN (
             SELECT rowid
             FROM rate_limit_events
             ORDER BY created_at ASC
             LIMIT (
               SELECT MAX(COUNT(*) - ?, 0)
               FROM rate_limit_events
             )
           )`
        )
        .run(RATE_LIMIT_MAX_ROWS);
    }

    database
      .prepare("DELETE FROM rate_limit_events WHERE key = ? AND created_at < ?")
      .run(key, threshold);

    const countRow = database
      .prepare(
        "SELECT COUNT(*) as count FROM rate_limit_events WHERE key = ? AND created_at >= ?"
      )
      .get(key, threshold) as { count: number };

    if (countRow.count >= maxRequests) {
      return false;
    }

    database
      .prepare("INSERT INTO rate_limit_events (key, created_at) VALUES (?, ?)")
      .run(key, now);
    return true;
  });

  return run();
}

export function getCachedSummary(
  unitCode: string,
  reviewCount: number,
  reviewHash: string
): { summary: string; generatedAt: string } | null {
  const now = Date.now();
  const row = getDb()
    .prepare(
      `SELECT summary, generated_at, expires_at
       FROM summary_cache
       WHERE unit_code = ? AND review_count = ? AND review_hash = ?`
    )
    .get(unitCode, reviewCount, reviewHash) as
    | { summary: string; generated_at: string; expires_at: number }
    | undefined;

  if (!row) return null;
  if (row.expires_at < now) return null;
  return { summary: row.summary, generatedAt: row.generated_at };
}

export function setCachedSummary(
  unitCode: string,
  reviewCount: number,
  reviewHash: string,
  summary: string,
  ttlMs: number
): void {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO summary_cache
       (unit_code, review_count, review_hash, summary, generated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(unit_code) DO UPDATE SET
         review_count = excluded.review_count,
         review_hash = excluded.review_hash,
         summary = excluded.summary,
         generated_at = excluded.generated_at,
         expires_at = excluded.expires_at`
    )
    .run(
      unitCode,
      reviewCount,
      reviewHash,
      summary,
      new Date(now).toISOString(),
      now + ttlMs
    );
}

export interface ModerationReview extends Review {
  hidden: number;
}

export function getReportedReviews(limit = 100): ModerationReview[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM reviews WHERE reported_count > 0 ORDER BY reported_count DESC, created_at DESC LIMIT ?"
    )
    .all(limit) as Record<string, unknown>[];

  return rows.map((row) => ({
    ...rowToReview(row),
    hidden: (row.hidden as number) ?? 0,
  }));
}

export function hideReview(reviewId: string): boolean {
  const result = getDb()
    .prepare("UPDATE reviews SET hidden = 1 WHERE id = ?")
    .run(reviewId);
  return result.changes > 0;
}

export function unhideReview(reviewId: string): boolean {
  const result = getDb()
    .prepare("UPDATE reviews SET hidden = 0 WHERE id = ?")
    .run(reviewId);
  return result.changes > 0;
}
