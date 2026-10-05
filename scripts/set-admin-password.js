const fs = require("node:fs/promises");
const path = require("node:path");
const { hashAdminPassword } = require("../server");

function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Voer dit commando uit in een interactieve terminal.");
  }
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = (chunk) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          process.stdin.off("data", onData);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write("\n");
          reject(new Error("Wachtwoordinstelling geannuleerd."));
          return;
        }
        if (character === "\r" || character === "\n") {
          process.stdin.off("data", onData);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= " ") value += character;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const password = await readHidden("Nieuw adminwachtwoord (minimaal 12 tekens): ");
  if (password.length < 12) {
    throw new Error("Kies een wachtwoord van minimaal 12 tekens.");
  }
  const confirmation = await readHidden("Herhaal het adminwachtwoord: ");
  if (password !== confirmation) {
    throw new Error("De wachtwoorden komen niet overeen.");
  }
  const envPath = path.join(__dirname, "..", ".env");
  let envContents = "";
  try {
    envContents = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const hashLine = `ADMIN_PASSWORD_HASH=${hashAdminPassword(password)}`;
  if (/^\s*(?:export\s+)?ADMIN_PASSWORD_HASH\s*=.*$/m.test(envContents)) {
    envContents = envContents.replace(/^\s*(?:export\s+)?ADMIN_PASSWORD_HASH\s*=.*$/m, hashLine);
  } else {
    envContents = `${envContents.trimEnd()}${envContents ? "\n" : ""}${hashLine}\n`;
  }
  await fs.writeFile(envPath, envContents, "utf8");
  console.log("Adminwachtwoordhash opgeslagen in .env. Herstart de server om het wachtwoord te activeren.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
