import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5179,
    strictPort: true,
    // Escuta em todas as interfaces (0.0.0.0) pra permitir acesso da
    // rede local — abre ``http://<ip-da-maquina>:5179`` no celular.
    host: true,
  },
})
