import { spawn } from "node:child_process";

export function runProcess(command, args, { cwd, timeoutMs, allowedExitCodes = [0] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, MULTI_AGENT_ACTIVE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; process.stderr.write(chunk); });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Could not start ${command}: ${error.message}`));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const result = { command, args, code, signal, stdout, stderr };
      if (allowedExitCodes.includes(code)) resolve(result);
      else reject(Object.assign(new Error(`${command} exited with ${code ?? signal}`), { result }));
    });
  });
}
