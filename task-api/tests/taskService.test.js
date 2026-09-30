const taskService = require('../src/services/taskService');

describe('taskService Unit Tests', () => {
    describe('getPaginated()', () => {
    it('should return the first page of tasks with page=1', () => {
      // Create 15 tasks (Task 1 to Task 15)
      for (let i = 1; i <= 15; i++) {
        taskService.create({ title: `Task ${i}` });
      }

      // Request page 1 with limit 10
      const page1 = taskService.getPaginated(1, 10);

      // It should return the first 10 tasks (Task 1 to Task 10)
      expect(page1).toHaveLength(10);
      expect(page1[0].title).toBe('Task 1');
      expect(page1[9].title).toBe('Task 10');
    });
  });
  beforeEach(() => {
    taskService._reset();
  });

  describe('create()', () => {
    it('should create a task with default values and generate a uuid', () => {
      const task = taskService.create({ title: 'Task with defaults' });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.title).toBe('Task with defaults');
      expect(task.description).toBe('');
      expect(task.status).toBe('todo');
      expect(task.priority).toBe('medium');
      expect(task.dueDate).toBeNull();
      expect(task.completedAt).toBeNull();
      expect(task.createdAt).toBeDefined();

      const all = taskService.getAll();
      expect(all).toHaveLength(1);
    });

    it('should create a task with custom fields if provided', () => {
      const custom = {
        title: 'Custom task',
        description: 'Detailed description',
        status: 'in_progress',
        priority: 'high',
        dueDate: '2026-12-31T23:59:59.000Z',
      };

      const task = taskService.create(custom);

      expect(task.title).toBe(custom.title);
      expect(task.description).toBe(custom.description);
      expect(task.status).toBe(custom.status);
      expect(task.priority).toBe(custom.priority);
      expect(task.dueDate).toBe(custom.dueDate);
    });
  });

  describe('getAll() and findById()', () => {
    it('getAll() should return an empty array when no tasks exist', () => {
      expect(taskService.getAll()).toEqual([]);
    });

    it('findById() should find task by id or return undefined if not found', () => {
      const created = taskService.create({ title: 'Find Me' });

      expect(taskService.findById(created.id)).toEqual(created);
      expect(taskService.findById('non-existent-id')).toBeUndefined();
    });
  });

  describe('update()', () => {
    it('should update fields of an existing task', () => {
      const task = taskService.create({ title: 'Before' });
      const updated = taskService.update(task.id, { title: 'After', priority: 'high' });

      expect(updated.title).toBe('After');
      expect(updated.priority).toBe('high');
      expect(taskService.findById(task.id).title).toBe('After');
    });

    it('should return null if trying to update a non-existent task', () => {
      expect(taskService.update('bad-id', { title: 'Test' })).toBeNull();
    });
  });

  describe('remove()', () => {
    it('should delete a task and return true', () => {
      const task = taskService.create({ title: 'Delete me' });

      expect(taskService.remove(task.id)).toBe(true);
      expect(taskService.getAll()).toHaveLength(0);
    });

    it('should return false if trying to delete a non-existent task', () => {
      expect(taskService.remove('bad-id')).toBe(false);
    });
  });

  describe('completeTask()', () => {
    it('should mark status as done and set completedAt', () => {
      const task = taskService.create({ title: 'Finish it' });
      const completed = taskService.completeTask(task.id);

      expect(completed.status).toBe('done');
      expect(completed.completedAt).toBeDefined();
    });

    it('should return null if task does not exist', () => {
      expect(taskService.completeTask('fake-id')).toBeNull();
    });
  });

  describe('getStats()', () => {
    it('should return counts by status and overdue count', () => {
      taskService.create({ title: 'T1', status: 'todo' });
      taskService.create({ title: 'T2', status: 'in_progress' });
      // Overdue task (past due date and not done)
      taskService.create({
        title: 'Overdue Task',
        status: 'todo',
        dueDate: '2020-01-01T00:00:00.000Z',
      });
      // Done task (past due date, but done tasks should not count as overdue)
      taskService.create({
        title: 'Completed Task',
        status: 'done',
        dueDate: '2020-01-01T00:00:00.000Z',
      });

      const stats = taskService.getStats();

      expect(stats.todo).toBe(2);
      expect(stats.in_progress).toBe(1);
      expect(stats.done).toBe(1);
      expect(stats.overdue).toBe(1);
    });
  });

  describe('getPaginated() and getByStatus()', () => {
    it('getByStatus() should filter tasks by exact status', () => {
      taskService.create({ title: 'T1', status: 'todo' });
      taskService.create({ title: 'T2', status: 'done' });

      const doneTasks = taskService.getByStatus('done');
      expect(doneTasks).toHaveLength(1);
      expect(doneTasks[0].status).toBe('done');
    });
  });
});