# Submission Notes

## Feature Implementation: `PATCH /tasks/:id/assign`

### Design Decisions:
1. **Validation**:
   - `assignee` must be present, a string, and non-empty (`assignee.trim() === ''`). Any violation returns `400 Bad Request` with `{ error: 'assignee is required and must be a non-empty string' }`.
   - String values are trimmed before saving to prevent trailing/leading whitespace.
2. **Reassignment**:
   - Tasks can be reassigned multiple times; the new assignee overwrites the previous one without restriction.
3. **Not Found Handling**:
   - If the `id` does not match an existing task, returns `404 Not Found` with `{ error: 'Task not found' }`.

---

## Evaluation Questions

### 1. What would you test next if you had more time?
- **Concurrency & Race Conditions**: Because tasks are stored in memory, concurrent asynchronous requests updating the same task simultaneously could cause state overwrites.
- **Security & Input Sanitization**: Adding payload size limits (e.g. DoS prevention), sanitizing text against script/HTML injection, and verifying security HTTP headers with `helmet`.
- **Query Parameter Boundary Testing**: Testing negative page numbers, non-numeric limit inputs, and edge cases when the dataset is empty.
- **Authentication & Authorization**: Testing that only authorized users or owners can modify, delete, or assign tasks.

### 2. Anything that surprised you in the codebase?
- `completeTask` hardcoded `priority: 'medium'`, causing high-priority tasks to silently lose their priority level upon completion.
- `getByStatus` used `.includes(status)` rather than strict equality `===`, meaning querying for `status=do` would match both `todo` and `done`.
- The pagination calculation `offset = page * limit` skipped the entire first page of results.

### 3. Any questions you'd ask before shipping this to production?
- **Database Persistence**: What database (e.g. PostgreSQL or MongoDB) should we migrate this in-memory store to before deploying?
- **Multi-Tenancy**: Should tasks be scoped to an authenticated user, project, or organization ID?
- **Soft Deletes**: Should `DELETE /tasks/:id` permanently delete the record or set `isDeleted: true` for audit trails and recovery?
- **Rate Limiting & Logging**: What rate-limiting and structured logging solutions (e.g. Pino, Winston, Datadog) should we configure?