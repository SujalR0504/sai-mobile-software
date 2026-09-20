import { handleApiRequest } from "./routes/router";
import { config } from "./config";

console.log(`Starting standalone Mobile Shop ERP REST API server on port ${config.port}...`);

const server = Bun.serve({
  port: config.port,
  async fetch(req) {
    return await handleApiRequest(req);
  },
});

console.log(`REST API running at http://${server.hostname}:${server.port}/api/`);
