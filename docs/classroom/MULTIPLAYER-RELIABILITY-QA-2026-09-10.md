# Multiplayer reliability and local diagnostics verification

Candidate: `codex/classroom-polish-today`, compiled staging frontend at
`http://127.0.0.1:5186`, using the existing staging Cloudflare Worker. These
checks do not certify the production alias or student devices.

## Diagnostics implementation

- Per-controller, memory-only connection timeline. No automatic network upload,
  persistent storage, room/player identifiers, names, arbitrary messages,
  credentials, URLs, or world contents.
- Default history: 48 events; hard maximum: 128. Adjacent ordinary sync events
  coalesce to the latest counters so busy-room edits do not immediately erase a
  previous connection failure.
- Runtime allowlists cover event names, connection states and known error codes;
  unknown codes become `other`. Only bounded integer counts, valid WebSocket
  close codes and a boolean sync flag can enter a copied event.
- Eight focused tests pass, covering malicious extra fields and strings, numeric
  validation, history bounds, session isolation, immutable snapshots, monotonic
  elapsed time, and preserving failure history through 1,000 sync updates.
- The final Room → Copy diagnostics flow produced a six-event JSON report
  containing close code `4001` and `session_replaced`. The copied content had no
  QA names, room identifier, URL, token fields or document contents.

## Browser evidence

- Two independently stored guest sessions joined the staging room through the
  actual create/invite/name-entry UI, without accounts.
- Concurrent UI placements converged to identical complete JSON documents
  obtained through the actual Export menu.
- A regression initially showed that any peer edit disabled the local Undo
  button. The final client preserves history for disjoint brick IDs. Repeating
  the browser case with the compiled fix kept Undo enabled; undoing the owner's
  placement retained the guest's brick, with exact exported-document equality.
- In the final compiled candidate, a second tab in the guest's same browser
  context displaced the original tab. The original showed Rejoin here and
  opened zero replacement sockets during a 10.5-second observation. Explicit
  rejoin transferred control back and paused the second tab.

### Sustained session

The final compiled candidate ran for **306,595 ms (5 minutes 6.6 seconds)** in
an independently owned Chrome process with separate owner, guest and third
guest browser contexts. The third context joined through its own name-entry
form, appeared in the three-person roster, then departed cleanly.

- Six periodic full exported-document comparisons and the final comparison
  were identical across owner and guest.
- Repeated Build/Explore transitions and held movement keys delivered 461
  received pose frames across the monitored clients.
- Browser network access was disabled for the guest while editing. The guest
  showed building paused/reconnecting, with two socket-close events observed.
  Restoring network access returned the guest to Live and complete exported
  documents converged again. The unconfirmed-edit recovery notice was surfaced.
- No browser page exceptions or server `error` messages were observed.
- Repetitive test placements eventually stacked beyond valid geometry: 17
  placement rejection messages were observed, with the expected visible layout
  warning. These rejected edits did not prevent subsequent convergence. The
  final shared document contained 33 bricks.
- Both final QA rooms were closed to new arrivals. A fresh staging API read
  confirmed `locked: true` after the UI action and all QA clients disconnected.

Local evidence: `/tmp/brick-diagnostics-soak-report.json`,
`/tmp/brick-diagnostics-final-duplicate-report.json`, exported documents under
`/tmp/diag-soak-*`, and `/tmp/brick-diagnostics-final.png`. The fingerprints in
`/tmp/brick-diagnostics-tested-source.json` identify the compiled artifact and
the reliability source snapshot. A subsequent diagnostic-only allowlist update
preserves existing brick-core validation reasons such as `invalid-layout`; all
eight diagnostics tests passed after that change.

This is bounded multi-client correctness evidence, not a frame-rate benchmark,
a school-Chromebook test, or a full-class-period endurance guarantee.

## Test harness boundaries

Initial attempts were interrupted by development-server hot reloads, an
agent-browser binary/daemon version mismatch, and browser-process cleanup
shared with another QA session. A fixed compiled frontend and a separately
owned Chrome process remove those sources of interference. These harness
interruptions are retained as incomplete attempts, not application failures.

The controlled test rooms contain only QA-generated worlds. No production
rooms, student accounts, provider settings or production deployments were
changed by this verification lane. Temporary owner links and raw test exports
remain in local `/tmp` files and are not committed.
