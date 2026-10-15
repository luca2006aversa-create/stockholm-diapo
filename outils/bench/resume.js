/* node resume.js avant p3 … : tableau comparatif des résultats-*.json */
const fs = require("fs"), n = process.argv.slice(2), R = n.map((e) => JSON.parse(fs.readFileSync(`resultats-${e}-dpr1.json`)));
const ligne = (t, f) => console.log(t.padEnd(34), R.map((r) => String(f(r) ?? "—").padStart(12)).join(""));
console.log("".padEnd(34), n.map((e) => e.padStart(12)).join(""));
ligne("démarrage (ms)", (r) => r.demarrageMs);
ligne("mémoire canvas (Mo)", (r) => r.memoire.totalMo);
ligne("requêtes / octets au démarrage", (r) => `${r.reseau.requetes}/${(r.reseau.octets / 1048576).toFixed(1)}Mo`);
for (const v of Object.keys(R[0].etapes)) ligne(`rendre() ${v} (ms)`, (r) => r.etapes[v]?.rendreMs);
for (const z of Object.keys(R[0].defilement)) { ligne(`${z} : images >50 ms`, (r) => r.defilement[z].sup50); ligne(`${z} : max (ms)`, (r) => r.defilement[z].max); ligne(`${z} : rendus WebGL`, (r) => r.defilement[z].rendusWebGL); }
