require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const http = require("http");
const { WebSocketServer } = require("ws");
const { verifyAccessToken } = require("./utils/jwt");
const orderCtrl = require("./controllers/order.controller");
const path = require("path");

const app = express();
const server = http.createServer(app);

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// ── Middleware ───────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // ← fixes WebSocket blocking
  }),
);
app.use(morgan(process.env.NODE_ENV === "development" ? "dev" : "combined"));
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/uploads", express.static(path.join(__dirname, "../uploads")));

// ── REST Routes ──────────────────────────
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/products", require("./routes/product.routes"));
app.use("/api/beans", require("./routes/beans.routes"));
app.use("/api/categories", require("./routes/category.routes"));
app.use("/api/banners", require("./routes/banner.routes"));
app.use("/api/cart", require("./routes/cart.routes"));
app.use("/api/orders", require("./routes/order.routes"));
app.use("/api/user/wishlist", require("./routes/wishlist.routes"));
app.use("/api/user/addresses", require("./routes/address.routes"));
app.use("/api/loyalty", require("./routes/loyalty.routes"));
app.use("/api/subscriptions", require("./routes/subscription.routes"));
app.use("/api/contact", require("./routes/contact.routes"));
app.use("/api/reports", require("./routes/reports.routes"));
app.use("/api/admin/staff", require("./routes/staff.routes"));
app.use("/api/admin/permissions", require("./routes/permission.routes"));
app.use("/api/notifications", require("./routes/notification.routes"));

app.use("/api/test", require("./routes/test.routes"));

// ── Health check ─────────────────────────
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", message: "Truenote API is running" }),
);

// ── 404 ──────────────────────────────────
app.use((req, res) =>
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found`,
    },
  }),
);

// ── Global error handler ─────────────────
app.use(require("./middleware/errorHandler"));

// ── WebSocket ─────────────────────────────
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  console.log("[WS] Upgrade request:", req.url);

  const match = req.url.match(/^\/api\/orders\/([^/?]+)\/track\/ws/);
  if (!match) {
    console.log("[WS] URL did not match — destroying socket");
    socket.destroy();
    return;
  }

  const params = new URLSearchParams(req.url.split("?")[1] || "");
  const token = params.get("token");
  console.log("[WS] Token present:", !!token);

  if (!token) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    req.params = { id: match[1] };
    console.log("[WS] Token valid — user:", req.user.id, "— order:", match[1]);
  } catch (err) {
    console.log("[WS] Token invalid:", err.message);
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    console.log("[WS] Connection established");
    orderCtrl.trackOrderWs(ws, req);
  });
});

// ── Start server ─────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log("─────────────────────────────────────");
  console.log(`  Truenote API  → http://localhost:${PORT}`);
  console.log(
    `  WebSocket     → ws://localhost:${PORT}/api/orders/:id/track/ws`,
  );
  console.log(`  ENV: ${process.env.NODE_ENV || "development"}`);
  console.log("─────────────────────────────────────");
});

module.exports = { app, server };
