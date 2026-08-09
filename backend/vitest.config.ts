import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      IS_LOCAL: 'true',
      LOCALSTACK_HOSTNAME: 'localhost',
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'test',
      AWS_SECRET_ACCESS_KEY: 'test',
      PET_IMAGES_BUCKET: 'paw-print-profile-images-test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'scripts/',
        '**/*.test.ts',
        '**/*.config.ts',
        'src/infrastructure/seed-data.ts',
        'src/infrastructure/seed-images.ts',
        'src/infrastructure/index.ts',
        'src/services/local-auth-service.ts',
        'src/services/auth-service.ts',
        'src/services/token-utils.ts',
        'src/handlers/auth-handler.ts',
        'src/index.ts',
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 70,
        statements: 75
      }
    },
    testTimeout: 30000,
    hookTimeout: 30000
  }
})
