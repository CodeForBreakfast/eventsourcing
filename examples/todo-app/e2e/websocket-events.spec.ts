import { test, expect } from '@playwright/test';

test.describe('WebSocket Event Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#status.status-connected', { timeout: 5000 });
  });

  test('should reflect events in real-time through WebSocket', async ({ page }) => {
    const input = page.locator('#newTodoInput');

    await input.fill('Event-driven todo');
    await input.press('Enter');

    await page.waitForTimeout(100);

    const todoItem = page.locator('.todo-item').first();
    await expect(todoItem).toBeVisible();

    const checkbox = page.locator('.todo-checkbox').first();
    await checkbox.click();

    await page.waitForTimeout(100);
    await expect(checkbox).toBeChecked();
  });

  test('should handle command execution and response cycle', async ({ page }) => {
    const input = page.locator('#newTodoInput');

    await input.fill('Command test');
    await input.press('Enter');

    await expect(page.locator('.todo-item')).toHaveCount(1);

    const deleteButton = page.locator('.todo-delete').first();
    await deleteButton.click();

    await page.waitForTimeout(200);

    await expect(page.locator('.empty-state')).toBeVisible();
  });

  test('should maintain data consistency across multiple operations', async ({ page }) => {
    const input = page.locator('#newTodoInput');

    const operations = [
      { action: 'add', value: 'Task A' },
      { action: 'add', value: 'Task B' },
      { action: 'add', value: 'Task C' },
    ];

    for (const op of operations) {
      await input.fill(op.value);
      await input.press('Enter');
      await page.waitForTimeout(50);
    }

    await expect(page.locator('.todo-item')).toHaveCount(3);

    await page.locator('.todo-checkbox').nth(0).click();
    await page.waitForTimeout(100);
    await page.locator('.todo-checkbox').nth(2).click();
    await page.waitForTimeout(100);

    await expect(page.locator('.todo-text').nth(0)).toHaveClass(/completed/);
    await expect(page.locator('.todo-text').nth(1)).not.toHaveClass(/completed/);
    await expect(page.locator('.todo-text').nth(2)).toHaveClass(/completed/);

    await page.locator('.todo-delete').nth(1).click();
    await page.waitForTimeout(200);

    await expect(page.locator('.todo-item')).toHaveCount(2);
  });

  test('should display todo IDs received from server events', async ({ page }) => {
    const input = page.locator('#newTodoInput');
    await input.fill('ID verification test');
    await input.press('Enter');

    const todoId = await page.locator('.todo-id').first().textContent();

    expect(todoId).toBeTruthy();
    expect(todoId).toMatch(/^todo-\d+-/);
  });

  test('should handle events for completing and uncompleting', async ({ page }) => {
    const input = page.locator('#newTodoInput');
    await input.fill('Toggle event test');
    await input.press('Enter');

    const checkbox = page.locator('.todo-checkbox').first();
    const todoText = page.locator('.todo-text').first();

    await expect(checkbox).not.toBeChecked();
    await expect(todoText).not.toHaveClass(/completed/);

    await checkbox.click();
    await page.waitForTimeout(100);

    await expect(checkbox).toBeChecked();
    await expect(todoText).toHaveClass(/completed/);

    await checkbox.click();
    await page.waitForTimeout(100);

    await expect(checkbox).not.toBeChecked();
    await expect(todoText).not.toHaveClass(/completed/);
  });
});

test.describe('Edge Cases and Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#status.status-connected', { timeout: 5000 });
  });

  test('should handle special characters in todo titles', async ({ page }) => {
    const input = page.locator('#newTodoInput');
    const specialTitles = [
      'Todo with "quotes"',
      "Todo with 'apostrophes'",
      'Todo with <html> tags',
      'Todo with & ampersand',
      'Todo with émojis 🎉',
    ];

    for (const title of specialTitles) {
      await input.fill(title);
      await input.press('Enter');
      await page.waitForTimeout(50);
    }

    await expect(page.locator('.todo-item')).toHaveCount(specialTitles.length);

    for (let i = 0; i < specialTitles.length; i++) {
      await expect(page.locator('.todo-text').nth(i)).toContainText(specialTitles[i]);
    }
  });

  test('should handle very long todo titles', async ({ page }) => {
    const input = page.locator('#newTodoInput');
    const longTitle = 'A'.repeat(200);

    await input.fill(longTitle);
    await input.press('Enter');

    const todoText = page.locator('.todo-text').first();
    await expect(todoText).toBeVisible();
    await expect(todoText).toContainText(longTitle);
  });

  test('should trim whitespace from todo titles', async ({ page }) => {
    const input = page.locator('#newTodoInput');

    await input.fill('  Spaced title  ');
    await input.press('Enter');

    await expect(page.locator('.todo-item')).toHaveCount(1);
    await expect(input).toHaveValue('');
  });

  test('should not allow adding todo with only whitespace', async ({ page }) => {
    const input = page.locator('#newTodoInput');

    await input.fill('     ');
    await input.press('Enter');

    await expect(page.locator('.empty-state')).toBeVisible();
  });

  test('should clear input field after successful addition', async ({ page }) => {
    const input = page.locator('#newTodoInput');

    await input.fill('Test todo');
    await input.press('Enter');

    await expect(input).toHaveValue('');
  });
});
