// Backend API & Server Configuration
export const BASE_SERVER_URL = (import.meta.env.VITE_BACKEND_URL || 'https://medikiosk-6wg9.onrender.com').replace(/\/+$/, '')
export const API_URL = `${BASE_SERVER_URL}/api`
