/**
 * Write-behind commits for classroom rooms: edits are acknowledged at once and
 * carried to the database in coalesced background commits. These tests drive the
 * room through the real protocol against the shared classroom fixture and fire
 * its alarm the way the runtime would.
 */
import { LIVE_PROTOCOL_VERSION } from "@brick-studio/core";
import { evictDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCESS_CACHE_TTL_MS, COMMIT_DEBOUNCE_MS, COMMIT_RETRY_BACKOFF_MS } from "../src/worldRoom";
import {
  alarmAfter, applied, brick, bricksOf, commitGate, fixture, join, openRoom, randomWorldUuid, saveNow, send, snapshotted, sockets,
  stillOpen, teacher, withClockAhead, worldDocument,
} from "./classroomFixture";

afterEach(() => {
  for (const socket of sockets.splice(0)) {
    try { socket.close(1000, "test complete"); } catch { /* already closed */ }
  }
  vi.restoreAllMocks();
});

describe("classroom write-behind commits", () => {
  it("coalesces a burst of 20 edits into one commit and acknowledges each before the database answers", async () => {
    const { db, studentAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const first = await join(room, studentAccess(0, world.id));
    const second = await join(room, studentAccess(1, world.id));
    await first.inbox.next("players");
    const gate = commitGate();
    db.commitGate = gate.wait;

    const opIds = Array.from({ length: 20 }, (_, index) => first.edit(`burst-${index}`, index));
    for (const [index, opId] of opIds.entries()) await applied(opId, 2 + index, first, second);
    expect(db.commitAttempts).toBe(0);
    const pending = await room.stored();
    expect(pending).toMatchObject({ revision: 21, dbRevision: 1 });
    expect(bricksOf(pending.document)).toHaveLength(20);
    expect(pending.commitDueAt! - pending.dirtySince!).toBe(COMMIT_DEBOUNCE_MS);
    expect(await room.alarmAt()).toBe(pending.commitDueAt);

    // An alarm before the debounce elapses runs the permission sweep, not a commit.
    expect(await runDurableObjectAlarm(room.stub)).toBe(true);
    expect(db.commitAttempts).toBe(0);
    expect(await room.alarmAt()).toBe(pending.commitDueAt);

    // The debounce elapses: one commit carries all twenty bricks. The database is
    // slow to answer, and the room keeps taking edits meanwhile.
    const settled = db.nextCommit();
    const alarm = alarmAfter(room, COMMIT_DEBOUNCE_MS + 50);
    await vi.waitFor(() => expect(db.commitAttempts).toBe(1));
    await applied(second.edit("during-commit", 30), 22, first, second);
    expect(db.commits).toHaveLength(0);
    gate.release();
    await settled;
    await alarm;
    expect(db.commits).toEqual([expect.objectContaining({ expectedRevision: 1, actorId: first.access.userId, sessionId: first.access.sessionId })]);
    expect(bricksOf(world.document)).toEqual(opIds.map((_, index) => `burst-${index}`));
    const after = await room.stored();
    expect(after).toMatchObject({ dbRevision: 2, revision: 22 });
    expect(after.dirtySince).toBeDefined();

    // The edit that arrived mid-commit forms the next burst and lands on the next alarm.
    db.commitGate = null;
    await alarmAfter(room, 2 * COMMIT_DEBOUNCE_MS + 100);
    expect(db.commits).toHaveLength(2);
    expect(db.commits[1]).toMatchObject({ expectedRevision: 2, actorId: second.access.userId });
    expect(bricksOf(world.document)).toContain("during-commit");
    expect((await room.stored()).dirtySince).toBeUndefined();
    expect(first.inbox.peek("reject")).toEqual([]);
    expect(second.inbox.peek("reject")).toEqual([]);
  });

  it("commits at once on a mode change and when the last builder leaves", async () => {
    const { db, studentAccess, teacherAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const student = await join(room, studentAccess(0, world.id));
    const supervising = await join(room, teacherAccess(world.id));
    await student.inbox.next("players");
    await applied(student.edit("before-explore", 0), 2, student, supervising);
    expect(db.commitAttempts).toBe(0);

    let settled = db.nextCommit();
    send(supervising.socket, { v: LIVE_PROTOCOL_VERSION, type: "setMode", mode: "explore" });
    for (const builder of [student, supervising]) expect(await builder.inbox.next("modeChanged")).toMatchObject({ mode: "explore", revision: 3 });
    await settled;
    expect(db.commits).toEqual([expect.objectContaining({ expectedRevision: 1, actorId: student.access.userId })]);
    expect(bricksOf(world.document)).toEqual(["before-explore"]);
    await vi.waitFor(async () => expect((await room.stored()).dirtySince).toBeUndefined());

    send(supervising.socket, { v: LIVE_PROTOCOL_VERSION, type: "setMode", mode: "build" });
    for (const builder of [student, supervising]) expect(await builder.inbox.next("modeChanged")).toMatchObject({ mode: "build", revision: 4 });
    expect(db.commitAttempts).toBe(1);
    await applied(student.edit("before-leaving", 4), 5, student, supervising);

    // The teacher leaving is not the last disconnect; the student leaving is.
    supervising.socket.close(1000, "teacher leaves");
    await student.inbox.next("players");
    expect(db.commitAttempts).toBe(1);
    settled = db.nextCommit();
    student.socket.close(1000, "student leaves");
    await settled;
    expect(db.commits).toHaveLength(2);
    expect(db.commits[1]).toMatchObject({ expectedRevision: 2, actorId: student.access.userId });
    expect(bricksOf(world.document)).toEqual(["before-explore", "before-leaving"]);
    await vi.waitFor(async () => expect((await room.stored()).dirtySince).toBeUndefined());
  });

  it("keeps edits through database failures, retries on the alarm with backoff, and never rejects a builder", async () => {
    const { db, studentAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const builder = await join(room, studentAccess(0, world.id));
    db.commitFailure = new Error("database unavailable");
    await applied(builder.edit("kept", 0), 2, builder);

    await saveNow(builder, db);
    expect(db.commitAttempts).toBe(1);
    expect(db.commits).toHaveLength(0);
    let stored = await room.stored();
    expect(stored).toMatchObject({ commitFailures: 1, dbRevision: 1, revision: 2 });
    expect(bricksOf(stored.document)).toEqual(["kept"]);
    expect(stored.commitDueAt! - Date.now()).toBeLessThanOrEqual(COMMIT_RETRY_BACKOFF_MS[0]);
    expect(await room.alarmAt()).toBe(stored.commitDueAt);

    // Each retry backs off further; the third failure tells the builder saving is delayed.
    let clock = await alarmAfter(room, COMMIT_RETRY_BACKOFF_MS[0] + 50);
    expect(clock.ran).toBe(true);
    expect(db.commitAttempts).toBe(2);
    stored = await room.stored();
    expect(stored.commitFailures).toBe(2);
    expect(stored.commitDueAt).toBe(clock.now + COMMIT_RETRY_BACKOFF_MS[1]);
    expect(builder.inbox.peek("error")).toEqual([]);

    clock = await alarmAfter(room, COMMIT_RETRY_BACKOFF_MS[0] + COMMIT_RETRY_BACKOFF_MS[1] + 100);
    expect(db.commitAttempts).toBe(3);
    stored = await room.stored();
    expect(stored.commitFailures).toBe(3);
    expect(stored.commitDueAt).toBe(clock.now + COMMIT_RETRY_BACKOFF_MS[2]);
    expect(await builder.inbox.next("error")).toMatchObject({ code: "save_conflict", message: expect.stringContaining("delayed") });

    // The database recovers: the next retry lands the edit exactly as the room holds it.
    db.commitFailure = null;
    await alarmAfter(room, COMMIT_RETRY_BACKOFF_MS[0] + COMMIT_RETRY_BACKOFF_MS[1] + COMMIT_RETRY_BACKOFF_MS[2] + 150);
    expect(db.commitAttempts).toBe(4);
    expect(db.commits).toEqual([expect.objectContaining({ expectedRevision: 1 })]);
    expect(bricksOf(world.document)).toEqual(["kept"]);
    stored = await room.stored();
    expect(stored).toMatchObject({ dbRevision: 2, revision: 2 });
    expect(stored.dirtySince).toBeUndefined();
    expect(stored.commitFailures).toBeUndefined();
    expect(builder.inbox.peek("reject")).toEqual([]);
    expect(await stillOpen(builder.closed)).toBe("open");
  });

  it("adopts the saved copy and broadcasts a snapshot when the database moved ahead, then keeps building", async () => {
    const { db, studentAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const first = await join(room, studentAccess(0, world.id));
    const second = await join(room, studentAccess(1, world.id));
    await first.inbox.next("players");
    await applied(first.edit("mine", 0), 2, first, second);

    // A solo save through the REST route landed first: the compare-and-set fails,
    // the room reloads the saved copy and every builder rebases on it. The room
    // revision jumps to the database's (5), never below what clients hold.
    world.revision = 5;
    world.document = worldDocument([brick("solo-save", 20, 20)]);
    await saveNow(first, db);
    for (const builder of [first, second]) {
      expect(await builder.inbox.next("error")).toMatchObject({ code: "save_conflict" });
      const snapshot = await builder.inbox.next("snapshot");
      expect(snapshot).toMatchObject({ revision: 5 });
      expect(bricksOf(snapshot.document)).toEqual(["solo-save"]);
    }
    expect(db.commitAttempts).toBe(1);
    expect(db.commits).toHaveLength(0);
    const stored = await room.stored();
    expect(stored).toMatchObject({ dbRevision: 5, revision: 5 });
    expect(stored.dirtySince).toBeUndefined();

    await applied(second.edit("after", 8), 6, first, second);
    await saveNow(second, db);
    expect(db.commits).toEqual([expect.objectContaining({ expectedRevision: 5, actorId: second.access.userId })]);
    expect(bricksOf(world.document)).toEqual(["solo-save", "after"]);
    expect(await stillOpen(first.closed)).toBe("open");
    expect(await stillOpen(second.closed)).toBe("open");
  });

  it("commits the room's own edits before a metadata refresh adopts anything", async () => {
    const { db, studentAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const builder = await join(room, studentAccess(0, world.id));
    await applied(builder.edit("mine", 0), 2, builder);

    // A late live event arrives while the edit is still within its debounce.
    expect((await room.invalidate({ reason: "world_saved", change: "metadata" })).status).toBe(200);
    expect(db.commits).toEqual([expect.objectContaining({ expectedRevision: 1 })]);
    expect(bricksOf(world.document)).toEqual(["mine"]);
    await snapshotted(2, builder);
    expect(builder.inbox.peek("error")).toEqual([]);
    expect((await room.stored()).dirtySince).toBeUndefined();
  });

  it("commits as another valid session when the last editor's access was revoked, and holds the document when nobody can", async () => {
    const { db, studentAccess, teacherAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const first = await join(room, studentAccess(0, world.id));
    const second = await join(room, studentAccess(1, world.id));
    await first.inbox.next("players");
    await applied(first.edit("by-first", 0), 2, first, second);
    await applied(second.edit("by-second", 4), 3, first, second);

    // The last editor's session is revoked in the database before the commit runs:
    // that socket is closed, and the commit lands as the other connected builder.
    db.students[1].auth_version = 2;
    send(first.socket, { v: LIVE_PROTOCOL_VERSION, type: "resync" });
    await first.inbox.next("snapshot");
    await vi.waitFor(() => expect(db.commits).toHaveLength(1));
    expect(await second.closed).toBe(4003);
    expect(db.commitAttempts).toBe(2);
    expect(db.commits[0]).toMatchObject({ expectedRevision: 1, actorId: first.access.userId, sessionId: first.access.sessionId });
    expect(bricksOf(world.document)).toEqual(["by-first", "by-second"]);

    // The remaining builder edits, then loses access with nobody else connected.
    // The debounce alarm finds no usable identity: the room stays dirty, keeps
    // the document, closes the refused session and sets no pointless retry alarm.
    await applied(first.edit("stranded", 8), 4, first);
    db.students[0].auth_version = 2;
    expect((await alarmAfter(room, COMMIT_DEBOUNCE_MS + 50)).ran).toBe(true);
    expect(db.commitAttempts).toBe(3);
    expect(await first.closed).toBe(4003);
    const stored = await room.stored();
    expect(stored.commitBlocked).toMatchObject({ code: "access_revoked" });
    expect(bricksOf(stored.document)).toEqual(["by-first", "by-second", "stranded"]);
    expect(stored.dirtySince).toBeDefined();
    expect(stored.commitDueAt).toBeUndefined();
    expect(stored).toMatchObject({ dbRevision: 2, revision: 4 });
    expect(bricksOf(world.document)).toEqual(["by-first", "by-second"]);
    expect(await room.alarmAt()).toBeNull();

    // The teacher opens the world: their freshly validated session carries the
    // stranded edit to the database before their welcome is served.
    const settled = db.nextCommit();
    const supervising = await join(room, teacherAccess(world.id));
    await settled;
    expect(supervising.welcome).toMatchObject({ revision: 4 });
    expect(bricksOf(supervising.welcome.document)).toEqual(["by-first", "by-second", "stranded"]);
    expect(db.commits.at(-1)).toMatchObject({ expectedRevision: 2, actorId: teacher.id });
    expect(bricksOf(world.document)).toEqual(["by-first", "by-second", "stranded"]);
    await vi.waitFor(async () => expect((await room.stored()).dirtySince).toBeUndefined());
  });

  it("commits a dirty record before serving the first request after a cold start, and init never clobbers it", async () => {
    const { db, studentAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const builder = await join(room, studentAccess(0, world.id));
    await applied(builder.edit("unsaved-at-eviction", 0), 2, builder);

    // The database is down when the builder leaves: the last-disconnect commit
    // fails and the room is evicted with the edit only in durable storage.
    db.commitFailure = new Error("database unavailable");
    const attempted = db.nextCommit();
    builder.socket.close(1000, "leaving");
    await attempted;
    await vi.waitFor(async () => expect((await room.stored()).commitFailures).toBe(1));
    await evictDurableObject(room.stub);
    db.commitFailure = null;
    await room.patchEnv();

    // ensureRoom re-sends the stale database copy on the next open. The woken
    // room commits first, so the copy (revision 1) is behind and changes nothing.
    const settled = db.nextCommit();
    expect((await room.reinit()).status).toBe(409);
    await settled;
    expect(db.commits).toEqual([expect.objectContaining({ expectedRevision: 1, actorId: builder.access.userId })]);
    expect(bricksOf(world.document)).toEqual(["unsaved-at-eviction"]);
    const stored = await room.stored();
    expect(stored).toMatchObject({ dbRevision: 2, revision: 2 });
    expect(stored.dirtySince).toBeUndefined();
    expect(bricksOf(stored.document)).toEqual(["unsaved-at-eviction"]);

    const rejoined = await join(room, studentAccess(0, world.id));
    expect(rejoined.welcome).toMatchObject({ revision: 2 });
    expect(bricksOf(rejoined.welcome.document)).toEqual(["unsaved-at-eviction"]);
    expect(db.commitAttempts).toBe(2);
  });

  it("refreshes a clean room from a newer database copy on re-init and leaves a dirty one alone", async () => {
    const { db, studentAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const builder = await join(room, studentAccess(0, world.id));

    // A solo save while the room idled: ensureRoom re-sends the newer copy.
    world.revision = 4;
    world.document = worldDocument([brick("solo", 20, 20)]);
    world.title = "Saved solo";
    expect((await room.reinit()).status).toBe(409);
    await snapshotted(4, builder);
    expect(await room.state(builder.access)).toMatchObject({ title: "Saved solo", revision: 4 });
    expect(bricksOf((await room.state(builder.access)).document)).toEqual(["solo"]);
    expect(builder.inbox.peek("error")).toEqual([]);

    // A dirty room: the edit is acknowledged, and a re-init with the same
    // confirmed revision changes nothing.
    await applied(builder.edit("mine", 0), 5, builder);
    expect((await room.reinit()).status).toBe(409);
    const stored = await room.stored();
    expect(bricksOf(stored.document)).toEqual(["solo", "mine"]);
    expect(stored.dirtySince).toBeDefined();
    expect(builder.inbox.peek("snapshot")).toEqual([]);
    await saveNow(builder, db);
    expect(bricksOf(world.document)).toEqual(["solo", "mine"]);
  });

  it("arms the permission sweep for the first socket and does not sweep on every commit alarm", async () => {
    const { db, batchChecks, studentAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    expect(await room.alarmAt()).toBeNull();
    const builder = await join(room, studentAccess(0, world.id));
    const sweepAt = await room.alarmAt();
    expect(sweepAt).toBeGreaterThan(Date.now() + 50_000);

    await applied(builder.edit("a", 0), 2, builder);
    expect(await room.alarmAt()).toBeLessThan(sweepAt!);
    await alarmAfter(room, COMMIT_DEBOUNCE_MS + 50);
    expect(db.commits).toHaveLength(1);
    expect(batchChecks()).toBe(0);
    expect(await room.alarmAt()).toBe(sweepAt);

    const clock = await alarmAfter(room, 61_000);
    expect(batchChecks()).toBe(1);
    expect(await stillOpen(builder.closed)).toBe("open");
    expect(await room.alarmAt()).toBe(clock.now + 60_000);
  });
});

describe("classroom permission cache", () => {
  it("checks a builder's access once per window, not once per brick", async () => {
    const { db, authorizeChecks, studentAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const builder = await join(room, studentAccess(0, world.id));
    const user = builder.access.userId;
    expect(authorizeChecks(user)).toBe(1); // the connect

    const opIds = Array.from({ length: 20 }, (_, index) => builder.edit(`burst-${index}`, index));
    for (const [index, opId] of opIds.entries()) await applied(opId, 2 + index, builder);
    send(builder.socket, { v: LIVE_PROTOCOL_VERSION, type: "setProfile", profile: { displayName: "Ignored", characterId: "toy-figure" } });
    await builder.inbox.next("players");
    send(builder.socket, { v: LIVE_PROTOCOL_VERSION, type: "resync" });
    expect(await builder.inbox.next("snapshot")).toMatchObject({ revision: 21 });
    expect(authorizeChecks(user)).toBe(1);

    // The first frame after the window re-checks once, and the window restarts from that check.
    await withClockAhead(ACCESS_CACHE_TTL_MS + 100, () => applied(builder.edit("after-window", 30), 22, builder));
    expect(authorizeChecks(user)).toBe(2);
    await withClockAhead(ACCESS_CACHE_TTL_MS + 200, () => applied(builder.edit("fresh-again", 31), 23, builder));
    expect(authorizeChecks(user)).toBe(2);
    await saveNow(builder, db);
    expect(bricksOf(world.document)).toHaveLength(22);
  });

  it("re-checks at once on an invalidation push, and catches a silent revocation when the window ends", async () => {
    const { db, authorizeChecks, batchChecks, studentAccess, teacherAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const builder = await join(room, studentAccess(0, world.id));
    const user = builder.access.userId;
    await applied(builder.edit("first", 0), 2, builder);
    expect(authorizeChecks(user)).toBe(1);
    expect(batchChecks()).toBe(0);

    // A membership push bypasses the window: the room asks the database now and, with
    // access still granted, the builder keeps building on the refreshed check.
    expect((await room.invalidate({ reason: "members_updated", change: "membership", userId: user })).status).toBe(200);
    expect(batchChecks()).toBe(1);
    expect(await stillOpen(builder.closed)).toBe("open");
    await applied(builder.edit("still-cached", 4), 3, builder);
    expect(authorizeChecks(user)).toBe(1);

    // A revocation nothing announced (the database changed without a push) is
    // trusted for the rest of the window, then the next frame re-checks and closes the socket.
    db.students[0].auth_version = 2;
    await applied(builder.edit("inside-window", 8), 4, builder);
    expect(authorizeChecks(user)).toBe(1);
    await withClockAhead(ACCESS_CACHE_TTL_MS + 100, async () => {
      builder.edit("after-window", 12);
      expect(await builder.closed).toBe(4003);
    });
    expect(authorizeChecks(user)).toBe(2);
    expect(builder.inbox.peek("apply")).toEqual([]);
    expect(bricksOf((await room.stored()).document)).toEqual(["first", "still-cached", "inside-window"]);

    // A push that finds access denied closes the socket immediately, whatever the window says.
    const second = await join(room, studentAccess(1, world.id));
    await applied(second.edit("second", 16), 5, second);
    db.students[1].auth_version = 2;
    expect((await room.invalidate({ reason: "password_reset", change: "membership", userId: second.access.userId })).status).toBe(200);
    expect(await second.closed).toBe(4003);
    expect(batchChecks()).toBe(2);

    // Leave the room clean: the teacher's session carries the stranded edits (both
    // students are refused), either on connect (if the alarm already found the room
    // blocked) or on the resync.
    const supervising = await join(room, teacherAccess(world.id));
    send(supervising.socket, { v: LIVE_PROTOCOL_VERSION, type: "resync" });
    await supervising.inbox.next("snapshot");
    await vi.waitFor(async () => expect((await room.stored()).dirtySince).toBeUndefined());
    expect(db.commits.at(-1)).toMatchObject({ actorId: teacher.id });
    expect(bricksOf(world.document)).toEqual(["first", "still-cached", "inside-window", "second"]);
  });

  it("owner controls re-check every time", async () => {
    const { db, authorizeChecks, teacherAccess } = fixture([randomWorldUuid()]);
    const world = db.worlds[0];
    const room = await openRoom(world);
    const supervising = await join(room, teacherAccess(world.id));
    expect(authorizeChecks(teacher.id)).toBe(1);
    send(supervising.socket, { v: LIVE_PROTOCOL_VERSION, type: "setMode", mode: "explore" });
    expect(await supervising.inbox.next("modeChanged")).toMatchObject({ mode: "explore" });
    send(supervising.socket, { v: LIVE_PROTOCOL_VERSION, type: "setMode", mode: "build" });
    expect(await supervising.inbox.next("modeChanged")).toMatchObject({ mode: "build" });
    send(supervising.socket, { v: LIVE_PROTOCOL_VERSION, type: "setLocked", locked: true });
    expect(await supervising.inbox.next("locked")).toMatchObject({ locked: true });
    expect(authorizeChecks(teacher.id)).toBe(4);
    // A lock change does not bump the revision; the brick is the fourth revision step.
    await applied(supervising.edit("teacher-brick", 0), 4, supervising);
    expect(authorizeChecks(teacher.id)).toBe(4);
    // Leave the room clean (a resync is cached, so this adds no check).
    send(supervising.socket, { v: LIVE_PROTOCOL_VERSION, type: "resync" });
    await supervising.inbox.next("snapshot");
    await vi.waitFor(async () => expect((await room.stored()).dirtySince).toBeUndefined());
    expect(authorizeChecks(teacher.id)).toBe(4);
  });
});
