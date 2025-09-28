import { execSync } from "node:child_process";

function major(v) {
  return parseInt(String(v).split(".")[0], 10);
}

function getNpmVersion() {
  // try to get it from npm_config_user_agent if available
  const ua = process.env.npm_config_user_agent || "";
  const m = ua.match(/npm\/(\d+\.\d+\.\d+)/);
  if (m) {
    return m[1];
  }
  // Fallback: try to get it from npm_execpath if available
  const execpath = process.env.npm_execpath;
  if (execpath) {
    try {
      const out = execSync(`"${process.execPath}" "${execpath}" -v`, {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
      if (out) {
        return out;
      }
    } catch {}
  }

  // Fallback: try to get it from the PATH
  return execSync("npm -v", { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
}

const nodeVer = process.versions.node;
const nodeMajor = major(nodeVer);
const npmVer = getNpmVersion();
const npmMajor = major(npmVer);

if (nodeMajor < 24 || npmMajor < 11) {
  console.error(
    `[engines] Node >=24 and npm >=11 are required. Detected: node ${nodeVer}, npm ${npmVer}`,
  );
  console.error(`[debug] npm_execpath=${process.env.npm_execpath || ""}`);
  console.error(`[debug] npm_config_user_agent=${process.env.npm_config_user_agent || ""}`);
  process.exit(1);
}
