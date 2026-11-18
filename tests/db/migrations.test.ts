import { beforeAll, afterAll, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { migrateDatabase } from "@firstscene/server-data";
import { isolatedDatabase, sessionFixture } from "./fixture";
let db: Awaited<ReturnType<typeof isolatedDatabase>>;
beforeAll(async () => {
  db = await isolatedDatabase();
});
afterAll(async () => {
  await db?.cleanup();
});
it("P04 QA-D01 fresh realPostgreSQL17 has exactly8private tables with owner tracking", async () => {
  const rows = await db.owner.query(
    "SELECT tablename FROM pg_tables WHERE schemaname=$1",
    ["firstscene"],
  );
  expect(rows.rows).toHaveLength(8);
  expect(
    Number(
      (await db.owner.query("SHOW server_version_num")).rows[0]
        .server_version_num,
    ),
  ).toBeGreaterThanOrEqual(170000);
  expect(
    (
      await db.owner.query(
        "SELECT version,sha256 FROM firstscene.schema_migrations",
      )
    ).rows,
  ).toHaveLength(1);
});
it("P04 QA-D01 rerun is safe and altered checksum is rejected without changing source/schema", async () => {
  expect((await migrateDatabase(db.owner, db.directory)).applied).toEqual([]);
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), "firstscene-migration-drift-"),
  );
  try {
    await fs.writeFile(
      path.join(temporary, "0001_initial.sql"),
      (await fs.readFile(path.join(db.directory, "0001_initial.sql"), "utf8")) +
        "\n-- deliberate test drift\n",
    );
    await expect(migrateDatabase(db.owner, temporary)).rejects.toThrow(
      /CHECKSUM_DRIFT/,
    );
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
  expect((await migrateDatabase(db.owner, db.directory)).applied).toEqual([]);
});
it("P04 runtime role has no DDL, superuser, membership, publicschema or migration-table privileges", async () => {
  const role = (
    await db.runtime.query(
      "SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=current_user",
    )
  ).rows[0];
  expect(role).toMatchObject({
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolbypassrls: false,
    rolinherit: false,
  });
  expect(
    Number(
      (
        await db.runtime.query(
          "SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)",
        )
      ).rows[0].count,
    ),
  ).toBe(0);
  for (const sql of [
    "CREATE TABLE firstscene.forbidden(id int)",
    "CREATE SCHEMA forbidden",
    "CREATE TEMP TABLE forbidden_temp(id int)",
    "SELECT * FROM firstscene.schema_migrations",
  ])
    await expect(db.runtime.query(sql)).rejects.toMatchObject({
      code: "42501",
    });
  const access = (
    await db.runtime.query(
      "SELECT has_schema_privilege('firstscene','CREATE') AS can_create,has_schema_privilege('public','USAGE') AS public_usage",
    )
  ).rows[0];
  expect(access).toEqual({ can_create: false, public_usage: false });
});
it("P04 runtime CRUD is allowed on app tables, foreign keys cascade only the owned session", async () => {
  const a = sessionFixture(),
    b = sessionFixture();
  for (const s of [a, b]) {
    await db.runtime.query(
      "INSERT INTO firstscene.sessions(id,epoch,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
      [s.id, s.epoch, s.tokenHash],
    );
    await db.runtime.query(
      "INSERT INTO firstscene.preferences(session_id) VALUES($1)",
      [s.id],
    );
    await db.runtime.query(
      "INSERT INTO firstscene.bookmarks(session_id,story_id,target_id,content_version) VALUES($1,'post-office','__story__',1)",
      [s.id],
    );
  }
  await db.runtime.query("DELETE FROM firstscene.sessions WHERE id=$1", [a.id]);
  expect(
    (
      await db.runtime.query(
        "SELECT session_id FROM firstscene.preferences WHERE session_id=$1",
        [a.id],
      )
    ).rowCount,
  ).toBe(0);
  expect(
    (
      await db.runtime.query(
        "SELECT session_id FROM firstscene.bookmarks WHERE session_id=$1",
        [b.id],
      )
    ).rowCount,
  ).toBe(1);
  await db.runtime.query("DELETE FROM firstscene.sessions WHERE id=$1", [b.id]);
});
it("P04 database rejects overlong absolute expiry and invalidfont at constraint boundary", async () => {
  const s = sessionFixture();
  await expect(
    db.runtime.query(
      "INSERT INTO firstscene.sessions(id,epoch,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '31 days')",
      [s.id, s.epoch, s.tokenHash],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await db.runtime.query(
    "INSERT INTO firstscene.sessions(id,epoch,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
    [s.id, s.epoch, s.tokenHash],
  );
  await expect(
    db.runtime.query(
      "INSERT INTO firstscene.preferences(session_id,font_size) VALUES($1,200)",
      [s.id],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await db.runtime.query("DELETE FROM firstscene.sessions WHERE id=$1", [s.id]);
});
it("P04 server indexes cover expiry and session-child access without orphan writes", async () => {
  const indexes = (
    await db.owner.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname='firstscene'",
    )
  ).rows.map((r) => r.indexname);
  expect(indexes).toEqual(
    expect.arrayContaining([
      "sessions_expiry",
      "receipts_expiry",
      "rate_expiry",
      "feedback_session_day",
    ]),
  );
  await expect(
    db.runtime.query(
      "INSERT INTO firstscene.preferences(session_id) VALUES($1)",
      [randomUUID()],
    ),
  ).rejects.toMatchObject({ code: "23503" });
});
