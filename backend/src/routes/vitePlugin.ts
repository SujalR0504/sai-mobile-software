import type { Plugin } from "vite";
import { handleApiRequest } from "./router";

export function erpApiPlugin(): Plugin {
  return {
    name: "erp-api-middleware",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api")) {
          return next();
        }

        try {
          const protocol = req.headers["x-forwarded-proto"] || "http";
          const host = req.headers.host || "localhost:5173";
          const fullUrl = `${protocol}://${host}${req.url}`;

          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
          }

          const method = req.method?.toUpperCase() || "GET";
          const body = ["GET", "HEAD"].includes(method) ? undefined : Buffer.concat(chunks);

          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (v) {
              if (Array.isArray(v)) {
                v.forEach((val) => headers.append(k, val));
              } else {
                headers.set(k, v);
              }
            }
          }

          const webReq = new Request(fullUrl, {
            method,
            headers,
            body,
          });

          const webRes = await handleApiRequest(webReq);

          res.statusCode = webRes.status;
          webRes.headers.forEach((v, k) => {
            res.setHeader(k, v);
          });

          const resBuffer = await webRes.arrayBuffer();
          res.end(Buffer.from(resBuffer));
        } catch (error) {
          console.error("API middleware error:", error);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      });
    },
  };
}
