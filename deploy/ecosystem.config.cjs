/**
 * PM2 Ecosystem Config — CosplayVault
 * =====================================
 * Usage:
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup
 */
module.exports = {
  apps: [
    {
      name: "cosplayvault",
      script: "./dist/index.js",
      cwd: "/var/www/cosplayvault",

      // Environment
      node_args: "--experimental-vm-modules",
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },

      // Process management
      instances: 1,          // Single instance (app uses in-memory state; scale with Redis if needed)
      exec_mode: "fork",     // Use "cluster" only after adding Redis session store
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",

      // Logging
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      out_file: "/var/log/cosplayvault/out.log",
      error_file: "/var/log/cosplayvault/error.log",
      merge_logs: true,

      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
