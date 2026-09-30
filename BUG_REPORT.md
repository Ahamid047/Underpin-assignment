# Bug Report: The Untested API

During test writing and exploration of the codebase, three primary bugs were identified and analyzed:

---

### Bug 1: 1-Indexed Pagination Math Error
* **File & Line**: `src/services/taskService.js` (Line 12)
* **Expected Behavior**: When a client requests `/tasks?page=1&limit=10`, the API should return items 0 through 9 (the first 10 items).
* **Actual Behavior**: The code used `const offset = page * limit;`. For `page=1` and `limit=10`, `offset` evaluated to `10`, causing the API to slice `10..20` and skip the first page entirely.
* **How Discovered**: Caught by the route test `GET /tasks?page=1&limit=2` returning tasks `t3, t4` instead of `t1, t2`.
* **Fix Applied**: Updated formula to `const offset = (page - 1) * limit;` and guarded with `if (page < 1) return [];` to safely handle invalid/negative page queries.

---

### Bug 2: Status Filter Partial / Substring Matching
* **File & Line**: `src/services/taskService.js` (Line 9)
* **Expected Behavior**: Querying `/tasks?status=done` should only match tasks with status strictly equal to `'done'`.
* **Actual Behavior**: The code uses:
  ```javascript
  const getByStatus = (status) => tasks.filter((t) => t.status.includes(status));