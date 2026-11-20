import { defineConfig } from 'vitest/config';

// Config dedicado aos testes AO VIVO (rede pública Chipnet, somente leitura).
// Nunca fazem parte da suíte padrão `pnpm test`. Executar manualmente com:
//   npx vitest run --config scripts/vitest.live.config.ts
export default defineConfig({
  test: {
    include: ['scripts/*.live.ts'],
    testTimeout: 30000,
  },
});
