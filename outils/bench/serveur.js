/* Serveur statique local (types MIME corrects) : node serveur.js <racine> [port] */
const http = require("http"), fs = require("fs"), path = require("path");
const racine = path.resolve(process.argv[2] || "../.."), port = +(process.argv[3] || 8123);
const T = { ".json": "application/json", ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".svg": "image/svg+xml" };
http.createServer((q, r) => { const f = path.join(racine, decodeURIComponent(q.url.split("?")[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": T[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(port, () => console.log("http://localhost:" + port));
