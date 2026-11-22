import { app } from './app.js';
import { getDbClient } from './db/client.js';

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    // Initialize database connection
    await getDbClient();

    app.listen(PORT, () => {
      console.log(`🚀 Split Mess API Server running on http://localhost:${PORT}`);
      console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
    });
  } catch (err: any) {
    console.error('Fatal: Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
