import { test, expect } from '@playwright/test';

test.describe('Todo App E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#status.status-connected', { timeout: 5000 });
  });

  test('should connect to WebSocket server successfully', async ({ page }) => {
    const status = page.locator('#status');
    await expect(status).toHaveClass(/status-connected/);
    await expect(status).toContainText('Connected to server');

    const input = page.locator('#newTodoInput');
    const addButton = page.locator('#addTodoBtn');
    await expect(input).toBeEnabled();
    await expect(addButton).toBeEnabled();
  });

  test('should display empty state when no todos exist', async ({ page }) => {
    const emptyState = page.locator('.empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('No todos yet!');
  });

  test('should add a new todo', async ({ page }) => {
    const input = page.locator('#newTodoInput');
    const addButton = page.locator('#addTodoBtn');

    await input.fill('Buy groceries');
    await addButton.click();

    await expect(page.locator('.todo-item')).toHaveCount(1);

    const todoText = page.locator('.todo-text').first();
    await expect(todoText).toContainText('Buy groceries');
    await expect(todoText).not.toHaveClass(/completed/);

    await expect(input).toHaveValue('');
  });

  test('should add a todo using Enter key', async ({ page }) => {
    const input = page.locator('#newTodoInput');

    await input.fill('Write tests');
    await input.press('Enter');

    await expect(page.locator('.todo-item')).toHaveCount(1);
    await expect(page.locator('.todo-text').first()).toContainText('Write tests');
  });

  test('should not add empty todo', async ({ page }) => {
    const input = page.locator('#newTodoInput');
    const addButton = page.locator('#addTodoBtn');

    await input.fill('   ');
    await addButton.click();

    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.todo-item')).toHaveCount(0);
  });

  test('should complete a todo', async ({ page }) => {
    const input = page.locator('#newTodoInput');
    await input.fill('Task to complete');
    await input.press('Enter');

    const checkbox = page.locator('.todo-checkbox').first();
    await checkbox.click();

    await page.waitForTimeout(100);

    const todoText = page.locator('.todo-text').first();
    await expect(todoText).toHaveClass(/completed/);
    await expect(checkbox).toBeChecked();
  });

  test('should uncomplete a completed todo', async ({ page }) => {
    const input = page.locator('#newTodoInput');
    await input.fill('Task to toggle');
    await input.press('Enter');

    const checkbox = page.locator('.todo-checkbox').first();

    await checkbox.click();
    await page.waitForTimeout(100);
    await expect(checkbox).toBeChecked();

    await checkbox.click();
    await page.waitForTimeout(100);
    await expect(checkbox).not.toBeChecked();

    const todoText = page.locator('.todo-text').first();
    await expect(todoText).not.toHaveClass(/completed/);
  });

  test('should delete a todo', async ({ page }) => {
    const input = page.locator('#newTodoInput');
    await input.fill('Task to delete');
    await input.press('Enter');

    await expect(page.locator('.todo-item')).toHaveCount(1);

    const deleteButton = page.locator('.todo-delete').first();
    await deleteButton.click();

    await page.waitForTimeout(200);

    await expect(page.locator('.empty-state')).toBeVisible();
  });

  test('should add multiple todos', async ({ page }) => {
    const input = page.locator('#newTodoInput');

    await input.fill('First todo');
    await input.press('Enter');

    await input.fill('Second todo');
    await input.press('Enter');

    await input.fill('Third todo');
    await input.press('Enter');

    await expect(page.locator('.todo-item')).toHaveCount(3);

    const todoTexts = page.locator('.todo-text');
    await expect(todoTexts.nth(0)).toContainText('First todo');
    await expect(todoTexts.nth(1)).toContainText('Second todo');
    await expect(todoTexts.nth(2)).toContainText('Third todo');
  });

  test('should handle multiple todos with different states', async ({ page }) => {
    const input = page.locator('#newTodoInput');

    await input.fill('Todo 1 - Active');
    await input.press('Enter');

    await input.fill('Todo 2 - Will complete');
    await input.press('Enter');

    await input.fill('Todo 3 - Will delete');
    await input.press('Enter');

    await expect(page.locator('.todo-item')).toHaveCount(3);

    await page.locator('.todo-checkbox').nth(1).click();
    await page.waitForTimeout(100);

    await expect(page.locator('.todo-text').nth(1)).toHaveClass(/completed/);

    await page.locator('.todo-delete').nth(2).click();
    await page.waitForTimeout(200);

    const remainingTodos = page.locator('.todo-item');
    await expect(remainingTodos).toHaveCount(2);
  });

  test('should persist todo ID in the UI', async ({ page }) => {
    const input = page.locator('#newTodoInput');
    await input.fill('Todo with ID');
    await input.press('Enter');

    const todoId = page.locator('.todo-id').first();
    await expect(todoId).toBeVisible();
    await expect(todoId).toContainText(/todo-/);
  });

  test('should handle rapid todo additions', async ({ page }) => {
    const input = page.locator('#newTodoInput');
    const addButton = page.locator('#addTodoBtn');

    for (let i = 1; i <= 5; i++) {
      await input.fill(`Rapid todo ${i}`);
      await addButton.click();
      await page.waitForTimeout(50);
    }

    await expect(page.locator('.todo-item')).toHaveCount(5);
  });

  test('should maintain state after completing and uncompleting', async ({ page }) => {
    const input = page.locator('#newTodoInput');
    await input.fill('Toggle test');
    await input.press('Enter');

    const checkbox = page.locator('.todo-checkbox').first();
    const todoText = page.locator('.todo-text').first();

    for (let i = 0; i < 3; i++) {
      await checkbox.click();
      await page.waitForTimeout(100);
      await expect(checkbox).toBeChecked();
      await expect(todoText).toHaveClass(/completed/);

      await checkbox.click();
      await page.waitForTimeout(100);
      await expect(checkbox).not.toBeChecked();
      await expect(todoText).not.toHaveClass(/completed/);
    }
  });
});

test.describe('WebSocket Connection Resilience', () => {
  test('should show connecting state initially', async ({ page }) => {
    const navigationPromise = page.goto('/');

    const status = page.locator('#status');
    await expect(status).toHaveClass(/status-connecting/);

    await navigationPromise;
    await page.waitForSelector('#status.status-connected', { timeout: 5000 });
  });

  test('should enable inputs only after connection', async ({ page }) => {
    await page.goto('/');

    const input = page.locator('#newTodoInput');
    const addButton = page.locator('#addTodoBtn');

    const initialInputState = await input.isDisabled();
    const initialButtonState = await addButton.isDisabled();

    expect(initialInputState || initialButtonState).toBeTruthy();

    await page.waitForSelector('#status.status-connected', { timeout: 5000 });

    await expect(input).toBeEnabled();
    await expect(addButton).toBeEnabled();
  });
});
