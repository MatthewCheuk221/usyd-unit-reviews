import { createClient, type Client } from "@libsql/client";
import { randomUUID } from "crypto";
import path from "path";
import type { Review, ReviewInput } from "./types";

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;
let nextRateLimitMaintenanceAt = 0;
const RATE_LIMIT_RETENTION_MS = 2 * 60 * 60 * 1000; // 2 hours
const RATE_LIMIT_MAINTENANCE_INTERVAL_MS = 30 * 1000; // 30 seconds
const RATE_LIMIT_MAX_ROWS = 250_000;
const REVIEW_REPORTS_RETENTION_DAYS = 30;

const SCHEMA_SQL = `
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
`;

function getDatabaseUrl(): string {
  if (process.env.TURSO_DATABASE_URL) {
    return process.env.TURSO_DATABASE_URL;
  }

  if (process.env.VERCEL === "1") {
    throw new Error(
      "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured on Vercel. " +
        "Local SQLite files are not writable on serverless hosting."
    );
  }

  return `file:${path.join(process.cwd(), "data", "reviews.db")}`;
}

async function initSchema(db: Client): Promise<void> {
  await db.executeMultiple(SCHEMA_SQL);

  try {
    await db.execute(
      "ALTER TABLE reviews ADD COLUMN reported_count INTEGER NOT NULL DEFAULT 0"
    );
  } catch {
    // no-op
  }
  try {
    await db.execute("ALTER TABLE reviews ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0");
  } catch {
    // no-op
  }
}

async function getClient(): Promise<Client> {
  if (!client) {
    client = createClient({
      url: getDatabaseUrl(),
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }

  if (!schemaReady) {
    schemaReady = initSchema(client);
  }
  await schemaReady;
  return client;
}

function rowToReview(row: Record<string, unknown>): Review {
  return {
    id: row.id as string,
    unitCode: row.unit_code as string,
    title: row.title as string,
    coordinatorName: row.coordinator_name as string,
    lecturerName: row.lecturer_name as string,
    year: Number(row.year),
    content: row.content as string,
    grade: row.grade as Review["grade"],
    ratingContent: Number(row.rating_content),
    ratingWorkload: Number(row.rating_workload),
    ratingExamDifficulty: Number(row.rating_exam_difficulty),
    ratingFinalResult: Number(row.rating_final_result),
    reportedCount: Number(row.reported_count ?? 0),
    createdAt: row.created_at as string,
  };
}

function rowAsRecord(row: unknown): Record<string, unknown> {
  return row as Record<string, unknown>;
}

export async function getReviewsByUnit(unitCode: string): Promise<Review[]> {
  const db = await getClient();
  const result = await db.execute({
    sql: "SELECT * FROM reviews WHERE unit_code = ? AND hidden = 0 ORDER BY year DESC, created_at DESC",
    args: [unitCode],
  });
  return result.rows.map((row) => rowToReview(rowAsRecord(row)));
}

export async function createReview(input: ReviewInput): Promise<Review> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const db = await getClient();

  await db.execute({
    sql: `INSERT INTO reviews (
      id, unit_code, title, coordinator_name, lecturer_name, year,
      content, grade, rating_content, rating_workload,
      rating_exam_difficulty, rating_final_result, reported_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
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
      createdAt,
    ],
  });

  return {
    id,
    ...input,
    reportedCount: 0,
    createdAt,
  };
}

export async function getReviewCount(unitCode: string): Promise<number> {
  const db = await getClient();
  const result = await db.execute({
    sql: "SELECT COUNT(*) as count FROM reviews WHERE unit_code = ? AND hidden = 0",
    args: [unitCode],
  });
  return Number(result.rows[0]?.count ?? 0);
}

export async function reportReviewWithHash(
  reviewId: string,
  reporterHash: string,
  maxReportsPerWindow = 30,
  windowMs = 24 * 60 * 60 * 1000
): Promise<{ ok: boolean; alreadyReported: boolean; windowExceeded: boolean }> {
  const db = await getClient();
  const tx = await db.transaction("write");

  try {
    const exists = await tx.execute({
      sql: "SELECT id FROM reviews WHERE id = ?",
      args: [reviewId],
    });
    if (exists.rows.length === 0) {
      await tx.rollback();
      return { ok: false, alreadyReported: false, windowExceeded: false };
    }

    const thresholdIso = new Date(Date.now() - windowMs).toISOString();
    const windowCountResult = await tx.execute({
      sql: "SELECT COUNT(*) AS count FROM review_reports WHERE review_id = ? AND created_at >= ?",
      args: [reviewId, thresholdIso],
    });
    const windowCount = Number(windowCountResult.rows[0]?.count ?? 0);
    if (windowCount >= maxReportsPerWindow) {
      await tx.rollback();
      return { ok: false, alreadyReported: false, windowExceeded: true };
    }

    const inserted = await tx.execute({
      sql: "INSERT OR IGNORE INTO review_reports (review_id, reporter_hash, created_at) VALUES (?, ?, ?)",
      args: [reviewId, reporterHash, new Date().toISOString()],
    });

    if (inserted.rowsAffected === 0) {
      await tx.commit();
      return { ok: true, alreadyReported: true, windowExceeded: false };
    }

    await tx.execute({
      sql: "UPDATE reviews SET reported_count = COALESCE(reported_count, 0) + 1 WHERE id = ?",
      args: [reviewId],
    });

    await tx.commit();
    return { ok: true, alreadyReported: false, windowExceeded: false };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function checkRateLimitPersistent(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<boolean> {
  const now = Date.now();
  const threshold = now - windowMs;
  const db = await getClient();
  const shouldRunMaintenance = now >= nextRateLimitMaintenanceAt;
  if (shouldRunMaintenance) {
    nextRateLimitMaintenanceAt = now + RATE_LIMIT_MAINTENANCE_INTERVAL_MS;
  }

  const tx = await db.transaction("write");
  try {
    if (shouldRunMaintenance) {
      await tx.execute({
        sql: "DELETE FROM rate_limit_events WHERE created_at < ?",
        args: [now - RATE_LIMIT_RETENTION_MS],
      });
      await tx.execute({
        sql: "DELETE FROM summary_cache WHERE expires_at < ?",
        args: [now],
      });
      const reportCutoff = new Date(
        now - REVIEW_REPORTS_RETENTION_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();
      await tx.execute({
        sql: "DELETE FROM review_reports WHERE created_at < ?",
        args: [reportCutoff],
      });
      await tx.execute({
        sql: `DELETE FROM rate_limit_events
              WHERE rowid IN (
                SELECT rowid
                FROM rate_limit_events
                ORDER BY created_at ASC
                LIMIT (
                  SELECT MAX(COUNT(*) - ?, 0)
                  FROM rate_limit_events
                )
              )`,
        args: [RATE_LIMIT_MAX_ROWS],
      });
    }

    await tx.execute({
      sql: "DELETE FROM rate_limit_events WHERE key = ? AND created_at < ?",
      args: [key, threshold],
    });

    const countResult = await tx.execute({
      sql: "SELECT COUNT(*) as count FROM rate_limit_events WHERE key = ? AND created_at >= ?",
      args: [key, threshold],
    });
    const count = Number(countResult.rows[0]?.count ?? 0);
    if (count >= maxRequests) {
      await tx.rollback();
      return false;
    }

    await tx.execute({
      sql: "INSERT INTO rate_limit_events (key, created_at) VALUES (?, ?)",
      args: [key, now],
    });

    await tx.commit();
    return true;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function getCachedSummary(
  unitCode: string,
  reviewCount: number,
  reviewHash: string
): Promise<{ summary: string; generatedAt: string } | null> {
  const now = Date.now();
  const db = await getClient();
  const result = await db.execute({
    sql: `SELECT summary, generated_at, expires_at
          FROM summary_cache
          WHERE unit_code = ? AND review_count = ? AND review_hash = ?`,
    args: [unitCode, reviewCount, reviewHash],
  });

  const row = result.rows[0];
  if (!row) return null;

  const expiresAt = Number(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return null;

  return {
    summary: String(row.summary),
    generatedAt: String(row.generated_at),
  };
}

export async function setCachedSummary(
  unitCode: string,
  reviewCount: number,
  reviewHash: string,
  summary: string,
  ttlMs: number
): Promise<void> {
  const now = Date.now();
  const db = await getClient();
  await db.execute({
    sql: `INSERT INTO summary_cache
          (unit_code, review_count, review_hash, summary, generated_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(unit_code) DO UPDATE SET
            review_count = excluded.review_count,
            review_hash = excluded.review_hash,
            summary = excluded.summary,
            generated_at = excluded.generated_at,
            expires_at = excluded.expires_at`,
    args: [
      unitCode,
      reviewCount,
      reviewHash,
      summary,
      new Date(now).toISOString(),
      now + ttlMs,
    ],
  });
}

export interface ModerationReview extends Review {
  hidden: number;
}

export async function getReportedReviews(limit = 100): Promise<ModerationReview[]> {
  const db = await getClient();
  const result = await db.execute({
    sql: "SELECT * FROM reviews WHERE reported_count > 0 ORDER BY reported_count DESC, created_at DESC LIMIT ?",
    args: [limit],
  });

  return result.rows.map((row) => ({
    ...rowToReview(rowAsRecord(row)),
    hidden: Number(row.hidden ?? 0),
  }));
}

export async function hideReview(reviewId: string): Promise<boolean> {
  const db = await getClient();
  const result = await db.execute({
    sql: "UPDATE reviews SET hidden = 1 WHERE id = ?",
    args: [reviewId],
  });
  return result.rowsAffected > 0;
}

export async function unhideReview(reviewId: string): Promise<boolean> {
  const db = await getClient();
  const result = await db.execute({
    sql: "UPDATE reviews SET hidden = 0 WHERE id = ?",
    args: [reviewId],
  });
  return result.rowsAffected > 0;
}
