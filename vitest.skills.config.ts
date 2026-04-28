import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'container/skills/**/tests/*.test.ts',
      '.claude/skills/**/tests/*.test.ts',
    ],
  },
});
