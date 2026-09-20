import { spawn, spawnSync } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:tls";

const smtpPort = 3465;
const mailboxPath = process.env.E2E_MAILBOX_PATH;
if (!mailboxPath) throw new Error("E2E_MAILBOX_PATH is required");

const certificatePath = "/tmp/sammlerraum-auth-e2e-cert.pem";
const privateKeyPath = "/tmp/sammlerraum-auth-e2e-key.pem";
const certificate = spawnSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-sha256",
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
    "-keyout",
    privateKeyPath,
    "-out",
    certificatePath,
  ],
  { stdio: "ignore" },
);
if (certificate.status !== 0) throw new Error("Could not create the test SMTP certificate");

const [key, cert] = await Promise.all([readFile(privateKeyPath), readFile(certificatePath)]);
await unlink(mailboxPath).catch(() => undefined);

function decodeQuotedPrintable(value) {
  return value
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

async function captureMessage(recipient, rawMessage) {
  const decoded = decodeQuotedPrintable(rawMessage);
  const subject = decoded.match(/^Subject:\s*(.+)$/im)?.[1]?.trim() ?? "";
  const url = decoded.match(/https?:\/\/[^\s<>]+/)?.[0];
  if (!recipient || !url) return;

  let mailbox = {};
  try {
    mailbox = JSON.parse(await readFile(mailboxPath, "utf8"));
  } catch {
    // The first captured message creates the mailbox.
  }
  mailbox[recipient] = { subject, url };
  await writeFile(mailboxPath, JSON.stringify(mailbox), { mode: 0o600 });
}

const smtpServer = createServer({ key, cert }, (socket) => {
  socket.setEncoding("utf8");
  socket.write("220 localhost ESMTP Sammlerraum test server\r\n");

  let buffer = "";
  let data = "";
  let recipient = "";
  let receivingData = false;
  let authStage = "";

  socket.on("data", (chunk) => {
    buffer += chunk;
    let end = buffer.indexOf("\r\n");
    while (end >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);

      if (receivingData) {
        if (line === ".") {
          receivingData = false;
          void captureMessage(recipient, data).then(() => socket.write("250 queued\r\n"));
          data = "";
        } else {
          data += `${line}\r\n`;
        }
      } else if (authStage === "username") {
        authStage = "password";
        socket.write("334 UGFzc3dvcmQ6\r\n");
      } else if (authStage === "password") {
        authStage = "";
        socket.write("235 authenticated\r\n");
      } else if (/^EHLO\b/i.test(line)) {
        socket.write("250-localhost\r\n250 AUTH PLAIN LOGIN\r\n");
      } else if (/^HELO\b/i.test(line)) {
        socket.write("250 localhost\r\n");
      } else if (/^AUTH PLAIN\b/i.test(line)) {
        socket.write("235 authenticated\r\n");
      } else if (/^AUTH LOGIN\b/i.test(line)) {
        authStage = "username";
        socket.write("334 VXNlcm5hbWU6\r\n");
      } else if (/^MAIL FROM:/i.test(line)) {
        socket.write("250 sender accepted\r\n");
      } else if (/^RCPT TO:/i.test(line)) {
        recipient = line.match(/<([^>]+)>/)?.[1] ?? "";
        socket.write("250 recipient accepted\r\n");
      } else if (/^DATA$/i.test(line)) {
        receivingData = true;
        socket.write("354 end with <CRLF>.<CRLF>\r\n");
      } else if (/^RSET$/i.test(line)) {
        data = "";
        recipient = "";
        socket.write("250 reset\r\n");
      } else if (/^QUIT$/i.test(line)) {
        socket.end("221 bye\r\n");
      } else {
        socket.write("250 ok\r\n");
      }

      end = buffer.indexOf("\r\n");
    }
  });
});

await new Promise((resolve, reject) => {
  smtpServer.once("error", reject);
  smtpServer.listen(smtpPort, resolve);
});

const next = spawn(
  "corepack",
  ["pnpm@10.17.1", "--filter", "@sammlerraum/web", "dev", "--hostname", "localhost"],
  {
    env: {
      ...process.env,
      APP_ORIGIN: "http://localhost:3000",
      SMTP_HOST: "localhost",
      SMTP_PORT: String(smtpPort),
      SMTP_SECURE: "true",
      SMTP_USER: "e2e-user",
      SMTP_PASSWORD: "e2e-password",
      SMTP_FROM: "noreply@example.test",
    },
    stdio: "inherit",
  },
);

function shutdown(signal) {
  next.kill(signal);
  smtpServer.close();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
next.on("exit", (code) => {
  smtpServer.close(() => process.exit(code ?? 1));
});
