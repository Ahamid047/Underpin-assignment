const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

describe('Tasks API Integration Tests', () => {
  beforeEach(() => {
    taskService._reset();
  });

  // 1. POST /tasks
  describe('POST /tasks', () => {
    it('Happy path: creates a task and returns 201', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 'API Integration Test', description: 'Testing POST endpoint' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('API Integration Test');
      expect(res.body.status).toBe('todo');
    });

    it('Edge case 1: returns 400 when title is missing or empty', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: '   ' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('Edge case 2: returns 400 when status is invalid', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 'Bad status task', status: 'archived' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/status must be one of/i);
    });

    it('Edge case 3: returns 400 when priority is invalid', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 'Bad priority task', priority: 'extreme' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/priority must be one of/i);
    });

    it('Edge case 4: returns 400 when dueDate is an invalid date string', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 'Bad date task', dueDate: 'invalid-date' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dueDate must be a valid ISO date string/i);
    });
  });

  // 2. GET /tasks
  describe('GET /tasks', () => {
    it('Happy path: returns all tasks with 200', async () => {
      taskService.create({ title: 'Task 1' });
      taskService.create({ title: 'Task 2' });

      const res = await request(app).get('/tasks');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('Filters tasks by status query (?status=done)', async () => {
      taskService.create({ title: 'Task 1', status: 'todo' });
      taskService.create({ title: 'Task 2', status: 'done' });

      const res = await request(app).get('/tasks?status=done');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Task 2');
    });
  });

  // 3. PUT /tasks/:id
  describe('PUT /tasks/:id', () => {
    it('Happy path: updates task and returns 200', async () => {
      const task = taskService.create({ title: 'Original Title' });

      const res = await request(app)
        .put(`/tasks/${task.id}`)
        .send({ title: 'Updated Title', priority: 'high' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Title');
      expect(res.body.priority).toBe('high');
    });

    it('Edge case 1: returns 404 if task ID does not exist', async () => {
      const res = await request(app)
        .put('/tasks/non-existent-id')
        .send({ title: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });

    it('Edge case 2: returns 400 if update payload fails validation', async () => {
      const task = taskService.create({ title: 'Original' });

      const res = await request(app)
        .put(`/tasks/${task.id}`)
        .send({ title: '' }); // Empty title

      expect(res.status).toBe(400);
    });
  });

  // 4. DELETE /tasks/:id
  describe('DELETE /tasks/:id', () => {
    it('Happy path: deletes task and returns 204 No Content', async () => {
      const task = taskService.create({ title: 'To Delete' });

      const res = await request(app).delete(`/tasks/${task.id}`);

      expect(res.status).toBe(204);
      expect(taskService.getAll()).toHaveLength(0);
    });

    it('Edge case: returns 404 if deleting non-existent task', async () => {
      const res = await request(app).delete('/tasks/non-existent-id');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });
  });

  // 5. PATCH /tasks/:id/complete
  describe('PATCH /tasks/:id/complete', () => {
    it('Happy path: marks task as complete and returns 200', async () => {
      const task = taskService.create({ title: 'Finish assignment' });

      const res = await request(app).patch(`/tasks/${task.id}/complete`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('done');
      expect(res.body.completedAt).toBeDefined();
    });

    it('Edge case: returns 404 for non-existent task', async () => {
      const res = await request(app).patch('/tasks/fake-id/complete');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });
  });

  // 6. GET /tasks/stats
  describe('GET /tasks/stats', () => {
    it('Happy path: returns task statistics with 200', async () => {
      taskService.create({ title: 'Task 1', status: 'todo' });

      const res = await request(app).get('/tasks/stats');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('todo', 1);
      expect(res.body).toHaveProperty('overdue', 0);
    });

  // ==========================================
  // PATCH /tasks/:id/assign (New Feature)
  // ==========================================
  describe('PATCH /tasks/:id/assign', () => {
    it('Happy path: assigns a task to a user and returns 200', async () => {
      const task = taskService.create({ title: 'Build new feature' });

      const res = await request(app)
        .patch(`/tasks/${task.id}/assign`)
        .send({ assignee: 'Alex Developer' });

      expect(res.status).toBe(200);
      expect(res.body.assignee).toBe('Alex Developer');
      expect(taskService.findById(task.id).assignee).toBe('Alex Developer');
    });

    it('Happy path: allows reassigning an already assigned task', async () => {
      const task = taskService.create({ title: 'Task to reassign' });
      taskService.assignTask(task.id, 'Alice');

      const res = await request(app)
        .patch(`/tasks/${task.id}/assign`)
        .send({ assignee: 'Bob' });

      expect(res.status).toBe(200);
      expect(res.body.assignee).toBe('Bob');
    });

    it('Edge case 1: returns 404 if task does not exist', async () => {
      const res = await request(app)
        .patch('/tasks/non-existent-id/assign')
        .send({ assignee: 'Alex' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Task not found');
    });

    it('Edge case 2: returns 400 if assignee is missing or empty string', async () => {
      const task = taskService.create({ title: 'Task' });

      const res = await request(app)
        .patch(`/tasks/${task.id}/assign`)
        .send({ assignee: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/assignee is required/i);
    });

    it('Edge case 3: returns 400 if assignee is not a string (e.g. number)', async () => {
      const task = taskService.create({ title: 'Task' });

      const res = await request(app)
        .patch(`/tasks/${task.id}/assign`)
        .send({ assignee: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/assignee is required/i);
    });
  });

  });
});