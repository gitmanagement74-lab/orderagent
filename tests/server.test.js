const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const {
  assistantConfiguration,
  createBookingFromTool,
  createOrderFromTool,
  hashAdminPassword,
  handleRequest,
  summarizeCall,
} = require("../server");

test("assistant is configured for Dutch speech, interruption, booking and orders", () => {
  const assistant = assistantConfiguration();

  assert.equal(assistant.transcriber.language, "nl");
  assert.equal(assistant.voice.voiceId, "nl-NL-ColetteNeural");
  assert.ok(assistant.name.length <= 40);
  assert.equal(assistant.model.provider, "google");
  assert.equal(assistant.model.model, "gemini-2.5-flash");
  assert.equal(assistant.firstMessageInterruptionsEnabled, true);
  assert.ok(assistant.model.tools.some((tool) => tool.function.name === "create_order"));
  assert.ok(assistant.model.tools.some((tool) => tool.function.name === "create_booking"));
  assert.ok(assistant.model.messages[0].content.includes("Schakel NOOIT over naar Duits of Engels"));
});

test("order tool calculates total using server menu prices, not supplied prices", () => {
  const result = createOrderFromTool({
    customerName: "Sam",
    fulfillment: "Afhalen",
    items: [{ name: "Koffie", quantity: 2, price: 0 }],
  }, { customer: { number: "+31612345678" } });

  assert.equal(result.total, 6.5);
  assert.equal(result.items[0].unitPrice, 3.25);
  assert.equal(result.phone, "+31612345678");
  assert.equal(result.status, "Nieuw");
});

test("order tool rejects unavailable or invented menu items", () => {
  assert.throws(() => createOrderFromTool({
    customerName: "Sam",
    fulfillment: "Afhalen",
    items: [{ name: "Onbekend product", quantity: 1 }],
  }, {}), /staat niet als beschikbaar/);
});

test("booking tool records an unconfirmed request with caller details", () => {
  const result = createBookingFromTool({
    customerName: "Sam",
    service: "Bowlen",
    dateTime: "2026-10-06T18:00:00+02:00",
    partySize: 4,
  }, { customer: { number: "+31612345678" } });

  assert.equal(result.status, "Aanvraag");
  assert.equal(result.partySize, 4);
  assert.equal(result.phone, "+31612345678");
});

test("call summary uses Vapi call and analysis fields", () => {
  const result = summarizeCall({
    type: "end-of-call-report",
    call: {
      id: "call-123",
      endedAt: "2026-10-05T12:00:00.000Z",
      customer: { number: "+31612345678" },
    },
    analysis: { summary: "Klant bestelt twee koffies." },
    artifact: { transcript: "Beller: twee koffies." },
  });

  assert.equal(result.id, "call-123");
  assert.equal(result.callerNumber, "+31612345678");
  assert.equal(result.summary, "Klant bestelt twee koffies.");
  assert.equal(result.transcript, "Beller: twee koffies.");
});

test("dashboard APIs reject access without an authenticated admin session", async (context) => {
  process.env.SUPABASE_URL ||= "https://project.example.supabase.co";
  process.env.SUPABASE_SECRET_KEY ||= "sb_secret_test";
  process.env.ADMIN_EMAIL ||= "admin@example.com";
  process.env.ADMIN_PASSWORD_HASH ||= hashAdminPassword("correct horse battery staple");

  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      response.writeHead(error.statusCode || 500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const stateResponse = await fetch(`${baseUrl}/api/state`);
  assert.equal(stateResponse.status, 401);
  assert.match((await stateResponse.json()).error, /Log in/);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerName: "Unauthorized", description: "Must not be saved" }),
  });
  assert.equal(orderResponse.status, 401);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "not-the-admin@example.com", password: "correct horse battery staple" }),
  });
  assert.equal(loginResponse.status, 401);
  assert.match((await loginResponse.json()).error, /e-mailadres of wachtwoord is onjuist/i);

  const wrongPasswordResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: "incorrect password" }),
  });
  assert.equal(wrongPasswordResponse.status, 401);

  const successResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: "correct horse battery staple" }),
  });
  assert.equal(successResponse.status, 200);
  assert.equal((await successResponse.json()).authenticated, true);
  const sessionCookie = successResponse.headers.get("set-cookie").split(";")[0];
  const sessionResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(sessionResponse.status, 200);
  assert.equal((await sessionResponse.json()).authenticated, true);
});
