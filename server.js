const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const port = Number(process.env.PORT || 4174);
const dataDir = path.join(root, "data");
const uploadDir = path.join(root, "uploads");

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const readEnv = () => {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return {};
  return fs.readFileSync(envPath, "utf8").split(/\r?\n/).reduce((env, line) => {
    const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (match) env[match[1]] = match[2].replace(/^"|"$/g, "");
    return env;
  }, {});
};

const localEnv = readEnv();
const adminEmail = process.env.ADMIN_EMAIL || localEnv.ADMIN_EMAIL;
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || localEnv.ADMIN_PASSWORD_HASH;
const sessionSecret = process.env.SESSION_SECRET || localEnv.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

const ensureDirs = () => {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
};

const sitePath = () => path.join(dataDir, "site.json");

const send = (response, status, body, headers = {}) => {
  response.writeHead(status, headers);
  response.end(body);
};

const sendJson = (response, status, payload, headers = {}) => {
  send(response, status, JSON.stringify(payload), { "Content-Type": types[".json"], ...headers });
};

const getBody = (request) =>
  new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 18_000_000) {
        reject(new Error("Payload too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });

const parseCookies = (request) => {
  const header = request.headers.cookie || "";
  return Object.fromEntries(
    header.split(";").map((part) => part.trim().split("=")).filter(([key]) => key).map(([key, value]) => [key, decodeURIComponent(value || "")])
  );
};

const base64url = (value) => Buffer.from(value).toString("base64url");
const sign = (value) => crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");

const makeToken = () => {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ sub: adminEmail, iat: Date.now(), exp: Date.now() + 1000 * 60 * 60 * 24 }));
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
};

const getSession = (request) => {
  const token = parseCookies(request).rexora_session;
  if (!token) return null;
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature || signature !== sign(`${header}.${payload}`)) return null;
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (claims.exp < Date.now() || claims.sub !== adminEmail) return null;
  return claims;
};

const requireAdmin = (request, response) => {
  if (getSession(request)) return true;
  sendJson(response, 401, { ok: false, message: "Unauthorized" });
  return false;
};

const safeJoin = (base, target) => {
  const targetPath = path.normalize(target).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(base, targetPath);
  return fullPath.startsWith(base) ? fullPath : base;
};

const readSite = () => JSON.parse(fs.readFileSync(sitePath(), "utf8"));

const writeSite = (site) => {
  fs.writeFileSync(sitePath(), JSON.stringify(site, null, 2));
};

const hashPassword = (value) => crypto.createHash("sha256").update(value).digest("hex");

const login = async (request, response) => {
  const { email, password } = JSON.parse(await getBody(request));
  const isValid = email === adminEmail && hashPassword(password || "") === adminPasswordHash;
  if (!isValid) return sendJson(response, 403, { ok: false, message: "Invalid login" });
  const token = makeToken();
  sendJson(response, 200, { ok: true }, {
    "Content-Type": types[".json"],
    "Set-Cookie": `rexora_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
    "Cache-Control": "no-store",
  });
};

const saveUpload = async (request, response) => {
  if (!requireAdmin(request, response)) return;
  const { name, type, data } = JSON.parse(await getBody(request));
  if (!data || !data.startsWith("data:")) return sendJson(response, 400, { ok: false, message: "Invalid media" });
  const extension = path.extname(name || "") || `.${(type || "png").split("/").pop()}`;
  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${extension.replace(/[^.\w]/g, "")}`;
  const base64 = data.split(",")[1];
  fs.writeFileSync(path.join(uploadDir, fileName), Buffer.from(base64, "base64"));
  sendJson(response, 200, { ok: true, url: `/uploads/${fileName}`, name: fileName, type });
};

const serveFile = (request, response, pathname) => {
  const routeMap = {
    "/": "index.html",
    "/admin/login": "admin-login.html",
    "/admin/dashboard": getSession(request) ? "admin-dashboard.html" : "admin-login.html",
  };
  const fileName = routeMap[pathname] || pathname.slice(1);
  const filePath = safeJoin(root, fileName);
  fs.readFile(filePath, (error, content) => {
    if (error) return send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
    send(response, 200, content, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
  });
};

ensureDirs();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(url.pathname);

    if (request.method === "GET" && pathname === "/admin/login" && url.search) {
      response.writeHead(302, { Location: "/admin/login", "Cache-Control": "no-store" });
      response.end();
      return;
    }

    if (request.method === "GET" && pathname === "/api/site") return sendJson(response, 200, readSite());
    if (request.method === "GET" && pathname === "/api/me") return sendJson(response, 200, { ok: Boolean(getSession(request)) });
    if (request.method === "POST" && pathname === "/api/login") return login(request, response);
    if (request.method === "POST" && pathname === "/api/logout") {
      return sendJson(response, 200, { ok: true }, { "Content-Type": types[".json"], "Set-Cookie": "rexora_session=; Path=/; Max-Age=0" });
    }
    if (request.method === "PUT" && pathname === "/api/site") {
      if (!requireAdmin(request, response)) return;
      writeSite(JSON.parse(await getBody(request)));
      return sendJson(response, 200, { ok: true });
    }
    if (request.method === "POST" && pathname === "/api/upload") return saveUpload(request, response);
    if (request.method === "GET" && pathname === "/api/media") {
      if (!requireAdmin(request, response)) return;
      const files = fs.readdirSync(uploadDir).map((name) => ({ name, url: `/uploads/${name}` }));
      return sendJson(response, 200, { files });
    }
    if (request.method === "DELETE" && pathname === "/api/media") {
      if (!requireAdmin(request, response)) return;
      const name = path.basename(url.searchParams.get("name") || "");
      const filePath = path.join(uploadDir, name);
      if (name && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return sendJson(response, 200, { ok: true });
    }

    serveFile(request, response, pathname);
  } catch (error) {
    sendJson(response, 500, { ok: false, message: error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Rexora running at http://127.0.0.1:${port}`);
});
