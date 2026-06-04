const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const port = Number(process.env.PORT || 4174);
const isVercel = Boolean(process.env.VERCEL);
const dataDir = path.join(root, "data");
const uploadDir = path.join(root, "uploads");
const supabaseBucket = "media";
const cmsStoragePath = "cms/site.json";
const maxPayloadBytes = Number(process.env.MAX_UPLOAD_BYTES || 220_000_000);
let runtimeSite = null;

const fetchWithTimeout = async (url, options = {}, timeoutMs = 25_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Supabase request timed out. Check Vercel environment variables, bucket policies, and network access.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

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
const adminPassword = process.env.ADMIN_PASSWORD || localEnv.ADMIN_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET || localEnv.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const supabaseUrl = (process.env.SUPABASE_URL || localEnv.SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || localEnv.SUPABASE_ANON_KEY;
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const sitePath = () => path.join(dataDir, "site.json");
const defaultSitePath = () => path.join(dataDir, "site.default.json");

const send = (response, status, body, headers = {}) => {
  response.writeHead(status, headers);
  response.end(body);
};

const sendJson = (response, status, payload, headers = {}) => {
  send(response, status, JSON.stringify(payload), { "Content-Type": types[".json"], ...headers });
};

const getRawBody = (request) =>
  new Promise((resolve, reject) => {
    if (Buffer.isBuffer(request.body)) return resolve(request.body);
    if (typeof request.body === "string") return resolve(Buffer.from(request.body));
    if (request.body && typeof request.body === "object" && !request.on) return resolve(Buffer.from(JSON.stringify(request.body)));
    if (typeof request.on !== "function") return resolve(Buffer.alloc(0));
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxPayloadBytes) {
        reject(new Error("Payload too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });

const getBody = async (request) => (await getRawBody(request)).toString("utf8");

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

const readLocalSite = () => {
  if (runtimeSite) return runtimeSite;
  const source = fs.existsSync(sitePath()) ? sitePath() : defaultSitePath();
  runtimeSite = JSON.parse(fs.readFileSync(source, "utf8"));
  return runtimeSite;
};

const readSite = async () => {
  if (runtimeSite) return runtimeSite;
  if (supabaseUrl && supabaseAnonKey) {
    try {
      const response = await fetchWithTimeout(`${supabaseUrl}/storage/v1/object/public/${supabaseBucket}/${cmsStoragePath}`, {}, 12_000);
      if (response.ok) {
        runtimeSite = await response.json();
        return runtimeSite;
      }
    } catch (error) {
      console.warn(error.message);
    }
  }
  return readLocalSite();
};

const writeSite = async (site) => {
  runtimeSite = site;
  if (supabaseUrl && supabaseAnonKey) {
    const response = await fetchWithTimeout(`${supabaseUrl}/storage/v1/object/${supabaseBucket}/${cmsStoragePath}`, {
      method: "POST",
      headers: supabaseHeaders({
        "Content-Type": "application/json; charset=utf-8",
        "x-upsert": "true",
      }),
      body: JSON.stringify(site, null, 2),
    }, 18_000);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "Supabase CMS save failed");
    }
  }
  if (!isVercel) {
    fs.writeFileSync(sitePath(), JSON.stringify(site, null, 2));
  }
};

const hashPassword = (value) => crypto.createHash("sha256").update(value).digest("hex");
const configuredPasswordHash = adminPasswordHash || (adminPassword ? hashPassword(adminPassword) : "");

const requireSupabase = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase upload environment variables are not available to this server.");
  }
};

const supabaseHeaders = (extra = {}) => ({
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
  ...extra,
});

const safeStorageName = (name, type) => {
  const extension = path.extname(name || "") || `.${(type || "application/octet-stream").split("/").pop() || "bin"}`;
  const base = path.basename(name || "media", extension).replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "media";
  const cleanExtension = extension.toLowerCase().replace(/[^.\w]/g, "") || ".bin";
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${base}${cleanExtension}`;
};

const publicStorageUrl = (storagePath) =>
  `${supabaseUrl}/storage/v1/object/public/${supabaseBucket}/${storagePath.split("/").map(encodeURIComponent).join("/")}`;

const safeStorageFolder = (value, type) => {
  const requested = String(value || "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/^media\//, "");
  const allowed = new Set(["hero", "founder", "founder-videos", "library"]);
  if (allowed.has(requested)) return requested;
  if (String(type || "").startsWith("video/")) return "library";
  return "library";
};

const uploadToSupabase = async ({ name, type, buffer, folder }) => {
  requireSupabase();
  console.log("SUPABASE CONNECTED");
  
  const storagePath = `${safeStorageFolder(folder, type)}/${safeStorageName(name, type)}`;
  console.log(`UPLOAD PATH: ${storagePath}`);
  
  const endpoint = `${supabaseUrl}/storage/v1/object/${supabaseBucket}/${storagePath}`;
  const uploadResponse = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: supabaseHeaders({
      "Content-Type": type || "application/octet-stream",
      "x-upsert": "false",
    }),
    body: buffer,
  }, 45_000);

  console.log(`SUPABASE RESPONSE Status: ${uploadResponse.status}`);
  if (!uploadResponse.ok) {
    const payload = await uploadResponse.json().catch(async () => ({ message: await uploadResponse.text().catch(() => "") }));
    console.error("SUPABASE RESPONSE Error payload:", payload);
    throw new Error(payload.message || `Supabase upload failed with status ${uploadResponse.status}`);
  }

  const publicUrl = publicStorageUrl(storagePath);
  console.log(`PUBLIC URL GENERATED: ${publicUrl}`);

  return {
    ok: true,
    name: path.basename(storagePath),
    path: storagePath,
    bucket: supabaseBucket,
    type,
    url: publicUrl,
  };
};

const listSupabaseMedia = async () => {
  if (!supabaseUrl || !supabaseAnonKey) return [];
  const response = await fetchWithTimeout(`${supabaseUrl}/storage/v1/object/list/${supabaseBucket}`, {
    method: "POST",
    headers: supabaseHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prefix: "", limit: 100, sortBy: { column: "created_at", order: "desc" } }),
  }, 12_000);
  if (!response.ok) return [];
  const files = await response.json();
  return files
    .filter((file) => file.name && !file.name.endsWith("/"))
    .map((file) => ({
      name: file.name,
      path: file.name,
      url: publicStorageUrl(file.name),
      size: file.metadata?.size || 0,
      type: file.metadata?.mimetype || "",
    }));
};

const deleteSupabaseMedia = async (storagePath) => {
  requireSupabase();
  const response = await fetchWithTimeout(`${supabaseUrl}/storage/v1/object/${supabaseBucket}`, {
    method: "DELETE",
    headers: supabaseHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: [storagePath] }),
  }, 18_000);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "Supabase media delete failed");
  }
};

const verifySupabaseObject = async (storagePath) => {
  requireSupabase();
  const publicUrl = publicStorageUrl(storagePath);
  const headResponse = await fetchWithTimeout(publicUrl, { method: "HEAD" }, 12_000);
  return {
    bucket: supabaseBucket,
    uploadPath: storagePath,
    objectExists: headResponse.ok,
    publicUrl,
    headStatus: headResponse.status,
  };
};

// Generate a Supabase signed upload URL so the browser can upload
// directly to Supabase — bypassing Vercel's 4.5MB request body limit.
const createSignedUploadToken = async ({ name, type, folder }) => {
  requireSupabase();
  const storagePath = `${safeStorageFolder(folder, type)}/${safeStorageName(name, type)}`;
  console.log(`SIGNED UPLOAD TOKEN - bucket: ${supabaseBucket}, storagePath: ${storagePath}`);

  // Supabase REST: POST /storage/v1/object/upload/sign/{bucket}/{path_within_bucket}
  const endpoint = `${supabaseUrl}/storage/v1/object/upload/sign/${supabaseBucket}/${storagePath}`;
  console.log(`SIGNED UPLOAD TOKEN - calling endpoint: ${endpoint}`);

  const tokenResponse = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: supabaseHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn: 7200 }),
  }, 12_000);

  const responseText = await tokenResponse.text();
  console.log(`SIGNED UPLOAD TOKEN - status: ${tokenResponse.status}, body: ${responseText}`);

  if (!tokenResponse.ok) {
    let payload;
    try { payload = JSON.parse(responseText); } catch { payload = { message: responseText }; }
    const error = new Error(payload.message || `Supabase signed URL failed with status ${tokenResponse.status}`);
    error.diagnostics = {
      bucket: supabaseBucket,
      uploadPath: storagePath,
      fileName: path.basename(storagePath),
      fileType: type || "application/octet-stream",
      signedUploadEndpoint: endpoint,
      signedUploadUrlStatus: tokenResponse.status,
      signedUploadUrlResponse: payload,
      publicUrl: publicStorageUrl(storagePath),
    };
    throw error;
  }

  let responseData;
  try { responseData = JSON.parse(responseText); } catch {
    throw new Error(`Supabase returned non-JSON response: ${responseText}`);
  }

  // Supabase returns { url: "/storage/v1/object/upload/sign/...", token: "..." }
  // The url field may be relative — prepend supabaseUrl if so.
  const { url: supabaseUrl_field, token } = responseData;
  console.log(`SIGNED UPLOAD TOKEN - supabase returned url: ${supabaseUrl_field}, token prefix: ${String(token || "").slice(0, 20)}...`);

  let uploadUrl;
  if (supabaseUrl_field) {
    uploadUrl = supabaseUrl_field.startsWith("http")
      ? supabaseUrl_field
      : `${supabaseUrl}/storage/v1${supabaseUrl_field}`;
  } else {
    // Fallback: construct upload URL manually using token as query param
    uploadUrl = `${supabaseUrl}/storage/v1/object/upload/sign/${supabaseBucket}/${storagePath}?token=${encodeURIComponent(token)}`;
  }

  const publicUrl = publicStorageUrl(storagePath);
  console.log(`SIGNED UPLOAD TOKEN - uploadUrl: ${uploadUrl}`);
  console.log(`SIGNED UPLOAD TOKEN - publicUrl: ${publicUrl}`);

  return {
    token,
    uploadUrl,      // complete PUT-ready URL (token already embedded)
    fileName: path.basename(storagePath),
    fileType: type || "application/octet-stream",
    storagePath,
    uploadPath: storagePath,
    publicUrl,
    bucket: supabaseBucket,
    signedUploadUrlResponse: responseData,
    debug: { bucket: supabaseBucket, endpoint, storagePath, uploadPath: storagePath, supabaseReturnedUrl: supabaseUrl_field },
  };
};

const testSupabase = async () => {
  console.log("SUPABASE TEST - Initiating test upload...");
  const testBuffer = Buffer.from("Supabase connection verification test");
  const testName = "test-connection.txt";
  const testType = "text/plain";
  const folder = "media/library";

  // 1. Upload Test File
  const uploadResult = await uploadToSupabase({
    name: testName,
    type: testType,
    buffer: testBuffer,
    folder,
  });
  console.log("SUPABASE TEST - Test upload response:", JSON.stringify(uploadResult));

  // 2. Verify existence by listing
  console.log("SUPABASE TEST - Listing media to verify...");
  const files = await listSupabaseMedia();
  const fileExists = files.some((f) => f.name.endsWith(uploadResult.name));
  console.log(`SUPABASE TEST - Listing search result: ${fileExists ? "FOUND" : "NOT FOUND"}`);

  // 3. Delete Test File
  console.log("SUPABASE TEST - Deleting test file...");
  await deleteSupabaseMedia(uploadResult.path);
  console.log("SUPABASE TEST - Test file deleted successfully.");

  return {
    success: true,
    stage: "test_complete",
    uploadResult,
    fileExists,
    deleted: true,
  };
};

const login = async (request, response) => {
  if (!adminEmail || !configuredPasswordHash) {
    return sendJson(response, 500, { ok: false, message: "Admin auth environment variables are not configured." });
  }
  const rawBody = await getBody(request);
  let credentials = {};
  try {
    credentials = JSON.parse(rawBody || "{}");
  } catch {
    credentials = Object.fromEntries(new URLSearchParams(rawBody || ""));
  }
  const { email, password } = credentials;
  const isValid = normalizeEmail(email) === normalizeEmail(adminEmail) && hashPassword(password || "") === configuredPasswordHash;
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
  console.log("UPLOAD STARTED");

  const rawName = request.headers["x-file-name"] ? decodeURIComponent(request.headers["x-file-name"]) : "";
  const rawType = request.headers["x-file-type"] || request.headers["content-type"] || "application/octet-stream";
  const folder = request.headers["x-upload-folder"] || "";
  let name = rawName;
  let type = rawType;
  let buffer = null;

  try {
    if (rawName) {
      buffer = await getRawBody(request);
    } else {
      const payload = JSON.parse(await getBody(request));
      name = payload.name;
      type = payload.type;
      if (!payload.data || !payload.data.startsWith("data:")) {
        console.error("UPLOAD FAILED - Invalid media data format");
        return sendJson(response, 400, {
          success: false,
          stage: "file_read",
          error: "Invalid media data format (must be data URI)",
        });
      }
      buffer = Buffer.from(payload.data.split(",")[1], "base64");
    }
  } catch (error) {
    console.error("UPLOAD FAILED - Reading file failed:", error);
    return sendJson(response, 400, {
      success: false,
      stage: "file_read",
      error: error.message,
    });
  }

  if (!buffer?.length) {
    console.error("UPLOAD FAILED - Empty media file");
    return sendJson(response, 400, {
      success: false,
      stage: "file_read",
      error: "Empty media file",
    });
  }

  console.log(`FILE NAME: ${name}`);
  console.log(`FILE SIZE: ${buffer.length} bytes`);
  console.log(`FILE TYPE: ${type}`);

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("UPLOAD FAILED - Supabase credentials not found");
    return sendJson(response, 500, {
      success: false,
      stage: "env_check",
      error: "SUPABASE_URL or SUPABASE_ANON_KEY is undefined",
      supabaseUrlLoaded: Boolean(supabaseUrl),
      supabaseKeyLoaded: Boolean(supabaseAnonKey),
    });
  }

  try {
    const uploaded = await uploadToSupabase({ name, type, buffer, folder });
    console.log("UPLOAD COMPLETE");
    sendJson(response, 200, uploaded);
  } catch (error) {
    console.error("UPLOAD FAILED - Supabase storage error:", error);
    return sendJson(response, 500, {
      success: false,
      stage: "supabase_upload",
      error: error.message,
      bucket: supabaseBucket,
    });
  }
};

const serveFile = (request, response, pathname) => {
  const routeMap = {
    "/": "index.html",
    "/admin/login": "admin-login.html",
    "/admin/dashboard": getSession(request) ? "admin-dashboard.html" : "admin-login.html",
  };
  const fileName = routeMap[pathname] || pathname.slice(1);
  const filePath = pathname.startsWith("/uploads/")
    ? safeJoin(uploadDir, pathname.replace("/uploads/", ""))
    : safeJoin(root, fileName);
  fs.readFile(filePath, (error, content) => {
    if (error) return send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
    send(response, 200, content, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
  });
};

const handler = async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(url.pathname);

    if (request.method === "GET" && pathname === "/admin/login" && url.search) {
      response.writeHead(302, { Location: "/admin/login", "Cache-Control": "no-store" });
      response.end();
      return;
    }

    if (request.method === "GET" && pathname === "/api/site") return sendJson(response, 200, await readSite());
    if (request.method === "GET" && pathname === "/api/health") {
      const status = {
        supabaseUrlLoaded: Boolean(supabaseUrl),
        supabaseKeyLoaded: Boolean(supabaseAnonKey)
      };
      console.log("HEALTH CHECK - Env variables validation:", JSON.stringify(status));

      if (url.searchParams.get("test") === "true") {
        try {
          const testResults = await testSupabase();
          return sendJson(response, 200, {
            ok: true,
            vercel: isVercel,
            bucket: supabaseBucket,
            cmsStoragePath,
            ...status,
            testResults
          });
        } catch (error) {
          console.error("SUPABASE CONNECTION TEST FAILED:", error);
          return sendJson(response, 500, {
            success: false,
            stage: "supabase_test",
            error: error.message,
            bucket: supabaseBucket,
            ...status
          });
        }
      }

      return sendJson(response, 200, {
        ok: true,
        vercel: isVercel,
        bucket: supabaseBucket,
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasSupabaseAnonKey: Boolean(supabaseAnonKey),
        hasAdminEmail: Boolean(adminEmail),
        hasAdminPasswordHash: Boolean(adminPasswordHash),
        hasAdminPassword: Boolean(adminPassword),
        cmsStoragePath,
        ...status
      });
    }
    if (request.method === "GET" && pathname === "/api/me") return sendJson(response, 200, { ok: Boolean(getSession(request)) });
    if (request.method === "POST" && pathname === "/api/login") return await login(request, response);
    if (request.method === "POST" && pathname === "/api/logout") {
      return sendJson(response, 200, { ok: true }, { "Content-Type": types[".json"], "Set-Cookie": "rexora_session=; Path=/; Max-Age=0" });
    }
    if (request.method === "PUT" && pathname === "/api/site") {
      if (!requireAdmin(request, response)) return;
      try {
        await writeSite(JSON.parse(await getBody(request)));
        console.log("CMS SAVE SUCCESS");
        return sendJson(response, 200, { ok: true });
      } catch (error) {
        console.error("CMS SAVE FAILED:", error);
        return sendJson(response, 500, {
          success: false,
          stage: "cms_save",
          error: error.message,
        });
      }
    }
    if (request.method === "POST" && pathname === "/api/upload") return await saveUpload(request, response);
    if (request.method === "GET" && pathname === "/api/media") {
      if (!requireAdmin(request, response)) return;
      const files = await listSupabaseMedia();
      return sendJson(response, 200, { files });
    }
    if (request.method === "DELETE" && pathname === "/api/media") {
      if (!requireAdmin(request, response)) return;
      const storagePath = url.searchParams.get("path") || (url.searchParams.get("name") ? `library/${path.basename(url.searchParams.get("name"))}` : "");
      if (storagePath) await deleteSupabaseMedia(storagePath);
      return sendJson(response, 200, { ok: true });
    }

    if (request.method === "GET" && pathname === "/api/verify-object") {
      if (!requireAdmin(request, response)) return;
      const storagePath = url.searchParams.get("path") || "";
      if (!storagePath) return sendJson(response, 400, { ok: false, message: "Missing path" });
      const result = await verifySupabaseObject(storagePath);
      return sendJson(response, result.objectExists ? 200 : 404, result);
    }

    // GET /api/upload-token — generate a Supabase signed upload URL
    // so the browser can PUT the file directly to Supabase storage,
    // completely bypassing Vercel's 4.5MB serverless request body limit.
    if (request.method === "GET" && pathname === "/api/upload-token") {
      if (!requireAdmin(request, response)) return;
      const name = url.searchParams.get("name") || "file";
      const type = url.searchParams.get("type") || "application/octet-stream";
      const folder = url.searchParams.get("folder") || "";
      try {
        const tokenData = await createSignedUploadToken({ name, type, folder });
        return sendJson(response, 200, tokenData);
      } catch (error) {
        console.error("UPLOAD TOKEN FAILED:", error);
        return sendJson(response, 500, {
          success: false,
          stage: "token_generation",
          error: error.message,
          diagnostics: error.diagnostics || null,
          supabaseUrlLoaded: Boolean(supabaseUrl),
          supabaseKeyLoaded: Boolean(supabaseAnonKey),
        });
      }
    }

    serveFile(request, response, pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { ok: false, message: error.message });
  }
};

if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(port, "127.0.0.1", () => {
    console.log(`Rexora running at http://127.0.0.1:${port}`);
  });
}

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
