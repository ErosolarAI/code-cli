import { vi } from 'vitest';

// Global test setup
vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
  },
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  exec: vi.fn(),
}));

// Reset all mocks between tests
afterEach(() => {
  vi.clearAllMocks();
});