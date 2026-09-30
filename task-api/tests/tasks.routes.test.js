const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

// Integration tests drive the app through HTTP. The store is module-level state,
// so it is reset between tests. As in the unit tests, `BUG-n` cases assert the
// current behavior and document the expected behavior in a comment.

const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();

const seed = (overrides = {}) => taskService.create({ title: 'seed task', ...overrides });

beforeEach(() => {
  taskService._reset();
});

describe('GET /tasks', () => {
  it('returns an empty array when there are no tasks', async () => {
    const res = await request(app).get('/tasks');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns all tasks', async () => {
    seed({ title: 'first' });
    seed({ title: 'second' });

    const res = await request(app).get('/tasks');

    expect(res.status).toBe(200);
    expect(res.body.map((t) => t.title)).toEqual(['first', 'second']);
  });

  it('responds with JSON', async () => {
    const res = await request(app).get('/tasks');

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('GET /tasks?status=', () => {
  beforeEach(() => {
    seed({ title: 'a', status: 'todo' });
    seed({ title: 'b', status: 'in_progress' });
    seed({ title: 'c', status: 'done' });
  });

  it('filters by status', async () => {
    const res = await request(app).get('/tasks?status=todo');

    expect(res.status).toBe(200);
    expect(res.body.map((t) => t.title)).toEqual(['a']);
  });

  it('returns an empty array when nothing matches', async () => {
    taskService._reset();
    seed({ status: 'todo' });

    const res = await request(app).get('/tasks?status=done');

    expect(res.body).toEqual([]);
  });

  // Edge case: an unknown status is not rejected, it just matches nothing. A 400
  // would be friendlier than a silent empty list.
  it('returns 200 and an empty list for an unknown status rather than 400', async () => {
    const res = await request(app).get('/tasks?status=archived');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // BUG-1: substring matching in taskService.getByStatus leaks through the API.
  // Expected: ?status=do is not a valid status and should match nothing.
  it('BUG-1: ?status=do returns both todo and done tasks', async () => {
    const res = await request(app).get('/tasks?status=do');

    expect(res.body.map((t) => t.title)).toEqual(['a', 'c']);
  });

  // BUG-7: the status branch returns early, so pagination params are silently
  // ignored when combined with a filter. Expected: filter *and* paginate.
  it('BUG-7: ignores pagination when combined with a status filter', async () => {
    taskService._reset();
    ['x', 'y', 'z'].forEach((title) => seed({ title, status: 'todo' }));

    const res = await request(app).get('/tasks?status=todo&page=1&limit=1');

    expect(res.body).toHaveLength(3); // should be 1
  });
});

describe('GET /tasks?page=&limit=', () => {
  beforeEach(() => {
    ['t1', 't2', 't3', 't4', 't5'].forEach((title) => seed({ title }));
  });

  it('limits the number of tasks returned', async () => {
    const res = await request(app).get('/tasks?page=1&limit=2');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('returns an empty array past the last page', async () => {
    const res = await request(app).get('/tasks?page=99&limit=10');

    expect(res.body).toEqual([]);
  });

  // The default limit is only observable with more than 10 tasks. Note the window
  // starts at t11 rather than t1 because of the BUG-2 offset shift below.
  const seedTwelve = () => {
    taskService._reset();
    Array.from({ length: 12 }, (_, i) => seed({ title: `t${i + 1}` }));
  };

  it('defaults limit to 10 when only page is given', async () => {
    seedTwelve();

    const res = await request(app).get('/tasks?page=1');

    expect(res.body.map((t) => t.title)).toEqual([
      't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10',
    ]);
  });

  it('defaults limit to 10 when limit is not a number', async () => {
    seedTwelve();

    const res = await request(app).get('/tasks?limit=abc');

    expect(res.body.map((t) => t.title)).toEqual([
      't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10',
    ]);
  });

  // BUG-2: the off-by-one surfaces here — page 1 is the documented first page but
  // returns the second. t1 and t2 cannot be reached through the API at all.
  it('BUG-2: page=1 returns the first two tasks', async () => {
    const res = await request(app).get('/tasks?page=1&limit=2');

    expect(res.body.map((t) => t.title)).toEqual(['t1', 't2']);
  });

  it('BUG-7: page=0 falls back to page 1 instead of being rejected', async () => {
    const res = await request(app).get('/tasks?page=0&limit=2');

    expect(res.body.map((t) => t.title)).toEqual(['t1', 't2']);
  });

  // BUG-7: negative pages are accepted and produce a negative slice offset.
  it('BUG-7: a negative page returns an empty list instead of 400', async () => {
    const res = await request(app).get('/tasks?page=-1&limit=2');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // Edge case: the response is a bare array — no total, page or pageCount — so a
  // client cannot tell how many pages exist or when it has reached the end.
  it('returns a bare array with no pagination metadata', async () => {
    const res = await request(app).get('/tasks?page=1&limit=2');

    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /tasks', () => {
  it('creates a task and returns 201 with the created task', async () => {
    const res = await request(app).post('/tasks').send({ title: 'write tests' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'write tests',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
    });
    expect(res.body.id).toEqual(expect.any(String));
  });

  it('persists the created task', async () => {
    const created = await request(app).post('/tasks').send({ title: 'persisted' });

    const list = await request(app).get('/tasks');

    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
  });

  it('accepts all optional fields', async () => {
    const dueDate = daysFromNow(3);

    const res = await request(app).post('/tasks').send({
      title: 'full',
      description: 'everything',
      status: 'in_progress',
      priority: 'high',
      dueDate,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ description: 'everything', priority: 'high', dueDate });
  });

  it('returns 400 when the title is missing', async () => {
    const res = await request(app).post('/tasks').send({ description: 'no title' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'title is required and must be a non-empty string' });
  });

  it('returns 400 for a whitespace-only title', async () => {
    const res = await request(app).post('/tasks').send({ title: '   ' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid status', async () => {
    const res = await request(app).post('/tasks').send({ title: 'x', status: 'archived' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/status must be one of/);
  });

  it('returns 400 for an invalid priority', async () => {
    const res = await request(app).post('/tasks').send({ title: 'x', priority: 'urgent' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid dueDate', async () => {
    const res = await request(app).post('/tasks').send({ title: 'x', dueDate: 'next tuesday' });

    expect(res.status).toBe(400);
  });

  it('does not create a task when validation fails', async () => {
    await request(app).post('/tasks').send({ title: '' });

    expect(taskService.getAll()).toEqual([]);
  });

  it('returns 400 for an empty body', async () => {
    const res = await request(app).post('/tasks').send({});

    expect(res.status).toBe(400);
  });

  // BUG-5: an empty-string status passes validation and is stored verbatim, so
  // the API happily creates a task whose status is not one of the three valid
  // statuses — and which then disappears from /tasks/stats.
  it('BUG-5: creates a task with an empty-string status', async () => {
    const res = await request(app).post('/tasks').send({ title: 'x', status: '' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('');
  });

  // BUG-4: unknown fields are not stripped on create either — but note create()
  // destructures, so they are dropped here. This documents the *correct* behavior
  // on create, which makes the update-path leak (BUG-4) the clear outlier.
  it('ignores unknown fields on create', async () => {
    const res = await request(app).post('/tasks').send({ title: 'x', isAdmin: true });

    expect(res.body).not.toHaveProperty('isAdmin');
  });
});

describe('PUT /tasks/:id', () => {
  it('updates a task and returns it', async () => {
    const task = seed({ title: 'before' });

    const res = await request(app).put(`/tasks/${task.id}`).send({ title: 'after' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: task.id, title: 'after' });
  });

  it('persists the update', async () => {
    const task = seed({ title: 'before' });

    await request(app).put(`/tasks/${task.id}`).send({ title: 'after' });

    expect(taskService.findById(task.id).title).toBe('after');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).put('/tasks/no-such-id').send({ title: 'ghost' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Task not found' });
  });

  it('returns 400 for an invalid status', async () => {
    const task = seed();

    const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'archived' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for an empty title', async () => {
    const task = seed();

    const res = await request(app).put(`/tasks/${task.id}`).send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('title must be a non-empty string');
  });

  // Edge case: validation runs before the existence check, so a bad body against
  // a non-existent task reports 400, not 404.
  it('prefers 400 over 404 when the body is invalid and the task is missing', async () => {
    const res = await request(app).put('/tasks/no-such-id').send({ title: '' });

    expect(res.status).toBe(400);
  });

  // Edge case: PUT is documented as an update but behaves as a partial merge
  // (PATCH semantics) — omitted fields are preserved rather than cleared.
  it('merges rather than replacing: omitted fields are preserved', async () => {
    const task = seed({ description: 'keep me', priority: 'high' });

    const res = await request(app).put(`/tasks/${task.id}`).send({ title: 'new title' });

    expect(res.body).toMatchObject({ description: 'keep me', priority: 'high' });
  });

  // BUG-4: server-owned fields are writable through the public API.
  it('BUG-4: lets a client overwrite the task id via the request body', async () => {
    const task = seed();

    const res = await request(app).put(`/tasks/${task.id}`).send({ id: 'hijacked' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('hijacked');
    expect(taskService.findById(task.id)).toBeUndefined();
  });

  it('BUG-4: stores arbitrary unknown fields sent in the body', async () => {
    const task = seed();

    const res = await request(app).put(`/tasks/${task.id}`).send({ isAdmin: true });

    expect(res.body).toHaveProperty('isAdmin', true);
  });

  // BUG-4: two ways to mark a task done, two different results.
  it('BUG-4: setting status to done does not set completedAt', async () => {
    const task = seed();

    const res = await request(app).put(`/tasks/${task.id}`).send({ status: 'done' });

    expect(res.body.status).toBe('done');
    expect(res.body.completedAt).toBeNull(); // PATCH /complete would have stamped it
  });
});

describe('DELETE /tasks/:id', () => {
  it('deletes the task and returns 204 with no body', async () => {
    const task = seed();

    const res = await request(app).delete(`/tasks/${task.id}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(taskService.getAll()).toEqual([]);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).delete('/tasks/no-such-id');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Task not found' });
  });

  it('returns 404 on a repeated delete', async () => {
    const task = seed();
    await request(app).delete(`/tasks/${task.id}`);

    const res = await request(app).delete(`/tasks/${task.id}`);

    expect(res.status).toBe(404);
  });

  it('deletes only the targeted task', async () => {
    const keep = seed({ title: 'keep' });
    const drop = seed({ title: 'drop' });

    await request(app).delete(`/tasks/${drop.id}`);

    expect(taskService.getAll().map((t) => t.id)).toEqual([keep.id]);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  it('marks the task done and stamps completedAt', async () => {
    const task = seed({ status: 'todo' });

    const res = await request(app).patch(`/tasks/${task.id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(Date.parse(res.body.completedAt)).not.toBeNaN();
  });

  it('persists the completion', async () => {
    const task = seed();

    await request(app).patch(`/tasks/${task.id}/complete`);

    expect(taskService.findById(task.id).status).toBe('done');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).patch('/tasks/no-such-id/complete');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Task not found' });
  });

  it('ignores any request body', async () => {
    const task = seed({ title: 'keep' });

    const res = await request(app).patch(`/tasks/${task.id}/complete`).send({ title: 'ignored' });

    expect(res.body.title).toBe('keep');
  });

  // BUG-3: completing silently downgrades priority to medium.
  it('BUG-3: preserves high-priority on task completion', async () => {
    const task = seed({ priority: 'high' });

    const res = await request(app).patch(`/tasks/${task.id}/complete`);

    expect(res.body.priority).toBe('high');
  });
  
  it('is idempotent in status when called twice', async () => {
    const task = seed();
    await request(app).patch(`/tasks/${task.id}/complete`);

    const res = await request(app).patch(`/tasks/${task.id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
  });
});

describe('GET /tasks/stats', () => {
  it('returns zeroed counts when there are no tasks', async () => {
    const res = await request(app).get('/tasks/stats');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  it('returns counts by status plus an overdue count', async () => {
    seed({ status: 'todo' });
    seed({ status: 'todo', dueDate: daysFromNow(-2) });
    seed({ status: 'in_progress' });
    seed({ status: 'done', dueDate: daysFromNow(-9) });

    const res = await request(app).get('/tasks/stats');

    expect(res.body).toEqual({ todo: 2, in_progress: 1, done: 1, overdue: 1 });
  });

  it('is routed before /:id so "stats" is not treated as a task id', async () => {
    seed();

    const res = await request(app).get('/tasks/stats');

    expect(res.body).toHaveProperty('overdue');
  });

  it('reflects a completion immediately', async () => {
    const task = seed({ status: 'todo' });

    await request(app).patch(`/tasks/${task.id}/complete`);
    const res = await request(app).get('/tasks/stats');

    expect(res.body).toMatchObject({ todo: 0, done: 1 });
  });

  // Edge case: a task with a status outside the three buckets vanishes from the
  // stats, so the counts silently under-report the real number of tasks.
  it('under-reports when a task has an unrecognised status', async () => {
    seed({ status: 'todo' });
    seed({ status: 'archived' });

    const res = await request(app).get('/tasks/stats');

    expect(res.body.todo + res.body.in_progress + res.body.done).toBe(1);
    expect(taskService.getAll()).toHaveLength(2);
  });
});

describe('error handling', () => {
  // BUG-6: express.json() rejects malformed JSON with a 400-flavoured SyntaxError,
  // but the catch-all error handler ignores err.status and always answers 500.
  // Expected: 400 Bad Request for a client-side syntax error.
  it('BUG-6: returns 500 instead of 400 for malformed JSON', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": ');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });

    spy.mockRestore();
  });

  it('returns 404 for an unknown route', async () => {
    const res = await request(app).get('/not-a-route');

    expect(res.status).toBe(404);
  });

  // Edge case: the fallback 404 comes from Express, not the app, so it is HTML —
  // a JSON client gets a content-type it cannot parse.
  it('serves the fallback 404 as HTML rather than JSON', async () => {
    const res = await request(app).get('/tasks/some-id/unknown-action');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('returns 404 for an unsupported method on a known path', async () => {
    const res = await request(app).patch('/tasks');

    expect(res.status).toBe(404);
  });
});
