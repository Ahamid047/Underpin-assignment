const { validateCreateTask, validateUpdateTask } = require('../src/utils/validators');

// Both validators return an error *string* when invalid, or null when valid.

describe('validateCreateTask', () => {
  it('accepts a minimal valid body', () => {
    expect(validateCreateTask({ title: 'write tests' })).toBeNull();
  });

  it('accepts a fully populated valid body', () => {
    expect(
      validateCreateTask({
        title: 'write tests',
        description: 'all of them',
        status: 'in_progress',
        priority: 'high',
        dueDate: '2030-01-01T00:00:00.000Z',
      })
    ).toBeNull();
  });

  describe('title', () => {
    it.each([
      ['missing', {}],
      ['null', { title: null }],
      ['empty', { title: '' }],
      ['whitespace only', { title: '   ' }],
      ['not a string', { title: 42 }],
    ])('rejects a %s title', (_label, body) => {
      expect(validateCreateTask(body)).toBe('title is required and must be a non-empty string');
    });

    it('accepts a title with surrounding whitespace', () => {
      expect(validateCreateTask({ title: '  padded  ' })).toBeNull();
    });
  });

  describe('status', () => {
    it.each(['todo', 'in_progress', 'done'])('accepts %s', (status) => {
      expect(validateCreateTask({ title: 'x', status })).toBeNull();
    });

    it('rejects an unknown status', () => {
      expect(validateCreateTask({ title: 'x', status: 'archived' })).toBe(
        'status must be one of: todo, in_progress, done'
      );
    });

    it('rejects a status with the wrong casing', () => {
      expect(validateCreateTask({ title: 'x', status: 'TODO' })).toMatch(/status must be one of/);
    });

    // BUG-5: the guard is `if (body.status && ...)`, and '' is falsy, so an empty
    // string skips validation entirely. taskService.create then stores '' verbatim
    // (destructuring defaults only fire on `undefined`), producing a task whose
    // status is not a valid status. Expected: '' is rejected like any other
    // non-member of the enum.
    it('BUG-5: accepts an empty-string status', () => {
      expect(validateCreateTask({ title: 'x', status: '' })).toBeNull();
    });
  });

  describe('priority', () => {
    it.each(['low', 'medium', 'high'])('accepts %s', (priority) => {
      expect(validateCreateTask({ title: 'x', priority })).toBeNull();
    });

    it('rejects an unknown priority', () => {
      expect(validateCreateTask({ title: 'x', priority: 'urgent' })).toBe(
        'priority must be one of: low, medium, high'
      );
    });

    // BUG-5, same root cause as the status case above.
    it('BUG-5: accepts an empty-string priority', () => {
      expect(validateCreateTask({ title: 'x', priority: '' })).toBeNull();
    });
  });

  describe('dueDate', () => {
    it('accepts an ISO date string', () => {
      expect(validateCreateTask({ title: 'x', dueDate: '2030-06-15T12:00:00.000Z' })).toBeNull();
    });

    it('rejects an unparseable date', () => {
      expect(validateCreateTask({ title: 'x', dueDate: 'next tuesday' })).toBe(
        'dueDate must be a valid ISO date string'
      );
    });

    it('rejects an impossible calendar date', () => {
      expect(validateCreateTask({ title: 'x', dueDate: '2030-13-45' })).toMatch(/valid ISO date/);
    });

    it('accepts a null due date', () => {
      expect(validateCreateTask({ title: 'x', dueDate: null })).toBeNull();
    });

    // Edge case: the check is only "is this parseable", so any loosely-parseable
    // string gets through. This is accepted behavior, not a bug — just a narrower
    // guarantee than the error message ("must be a valid ISO date string") implies.
    it('accepts a non-ISO but parseable date string', () => {
      expect(validateCreateTask({ title: 'x', dueDate: 'Jan 5, 2030' })).toBeNull();
    });
  });

  it('reports the title error first when several fields are invalid', () => {
    expect(validateCreateTask({ title: '', status: 'nope', priority: 'nope' })).toMatch(/^title/);
  });
});

describe('validateUpdateTask', () => {
  it('accepts an empty body (a no-op update)', () => {
    expect(validateUpdateTask({})).toBeNull();
  });

  it('accepts a partial update', () => {
    expect(validateUpdateTask({ priority: 'low' })).toBeNull();
  });

  describe('title', () => {
    it('does not require a title, unlike create', () => {
      expect(validateUpdateTask({ status: 'done' })).toBeNull();
    });

    it.each([
      ['empty', { title: '' }],
      ['whitespace only', { title: '  ' }],
      ['not a string', { title: 42 }],
    ])('rejects a %s title when one is supplied', (_label, body) => {
      expect(validateUpdateTask(body)).toBe('title must be a non-empty string');
    });

    // Edge case: `undefined` is treated as "field absent" and skipped, while an
    // explicit null falls into the type check and is rejected.
    it('skips an explicitly undefined title', () => {
      expect(validateUpdateTask({ title: undefined })).toBeNull();
    });

    it('rejects a null title', () => {
      expect(validateUpdateTask({ title: null })).toBe('title must be a non-empty string');
    });
  });

  it('rejects an unknown status', () => {
    expect(validateUpdateTask({ status: 'archived' })).toBe(
      'status must be one of: todo, in_progress, done'
    );
  });

  it('rejects an unknown priority', () => {
    expect(validateUpdateTask({ priority: 'urgent' })).toBe(
      'priority must be one of: low, medium, high'
    );
  });

  it('rejects an unparseable dueDate', () => {
    expect(validateUpdateTask({ dueDate: 'soon' })).toBe('dueDate must be a valid ISO date string');
  });

  // BUG-5 again — empty strings bypass both enum checks on the update path too.
  it('BUG-5: accepts empty-string status and priority', () => {
    expect(validateUpdateTask({ status: '' })).toBeNull();
    expect(validateUpdateTask({ priority: '' })).toBeNull();
  });

  // BUG-4 (validator half): the validator has no allow-list, so server-owned and
  // unknown fields pass straight through to taskService.update, which spreads them
  // onto the stored task.
  it('BUG-4: does not reject server-owned or unknown fields', () => {
    expect(validateUpdateTask({ id: 'hijacked', createdAt: 'whenever', isAdmin: true })).toBeNull();
  });
});
