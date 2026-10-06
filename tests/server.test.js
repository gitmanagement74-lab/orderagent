const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const {
  assistantConfiguration,
  createBookingFromTool,
  createOrderFromTool,
  hashAdminPassword,
  normalizeToolCall,
  readJson,
  serverlessHandler,
  summarizeCall,
} = require("../server");

test("JSON reader accepts Vercel's pre-parsed request body", async () => {
  const body = { status: "Afgerond" };
  const request = {
    body,
    async *[Symbol.asyncIterator]() {
      throw new Error("The request stream should not be consumed when body is pre-parsed.");
    },
  };

  assert.equal(await readJson(request), body);
});

test("JSON reader parses a Vercel request body string", async () => {
  assert.deepEqual(await readJson({ body: "{\"status\":\"In behandeling\"}" }), { status: "In behandeling" });
});

test("assistant is configured for Dutch speech, interruption, booking and orders", () => {
  const assistant = assistantConfiguration();

  assert.equal(assistant.transcriber.language, "nl");
  assert.equal(assistant.voice.provider, "vapi");
  assert.equal(assistant.voice.voiceId, "Emma");
  assert.equal(assistant.voice.version, 2);
  assert.equal(assistant.voice.language, "nl");
  assert.ok(assistant.name.length <= 40);
  assert.equal(assistant.model.provider, "google");
  assert.equal(assistant.model.model, "gemini-2.5-flash");
  assert.equal(assistant.model.temperature, 0.6);
  assert.equal(assistant.responseDelaySeconds, 0.55);
  assert.equal(assistant.startSpeakingPlan.waitSeconds, 0.65);
  assert.equal(assistant.firstMessageInterruptionsEnabled, true);
  assert.ok(assistant.model.tools.some((tool) => tool.function.name === "create_order"));
  assert.ok(assistant.model.tools.some((tool) => tool.function.name === "create_booking"));
  assert.ok(assistant.model.messages[0].content.includes("Schakel NOOIT over naar Duits of Engels"));
  assert.ok(assistant.model.messages[0].content.includes("Spreek rustig en in een natuurlijk tempo"));
});

test("Vapi nested function calls are normalized for order processing", () => {
  const normalized = normalizeToolCall({
    id: "tool-call-123",
    type: "function",
    function: {
      name: "create_order",
      arguments: "{\"customerName\":\"Richard\",\"items\":[{\"name\":\"Koffie\",\"quantity\":2}]}",
    },
  });
  assert.deepEqual(normalized, {
    id: "tool-call-123",
    name: "create_order",
    parameters: "{\"customerName\":\"Richard\",\"items\":[{\"name\":\"Koffie\",\"quantity\":2}]}",
  });
});

test("assistant webhook can use an explicit stable URL instead of a local tunnel", () => {
  const originalWebhookUrl = process.env.VAPI_WEBHOOK_URL;
  const originalPublicBaseUrl = process.env.PUBLIC_BASE_URL;
  try {
    process.env.VAPI_WEBHOOK_URL = "https://orderagent-chi.vercel.app/api/webhooks/vapi";
    process.env.PUBLIC_BASE_URL = "https://temporary.trycloudflare.com";
    assert.equal(assistantConfiguration().server.url, "https://orderagent-chi.vercel.app/api/webhooks/vapi");
  } finally {
    if (originalWebhookUrl === undefined) delete process.env.VAPI_WEBHOOK_URL;
    else process.env.VAPI_WEBHOOK_URL = originalWebhookUrl;
    if (originalPublicBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = originalPublicBaseUrl;
  }
});

test("assistant webhook uses Render's public URL when PUBLIC_BASE_URL is not set", () => {
  const originalWebhookUrl = process.env.VAPI_WEBHOOK_URL;
  const originalPublicBaseUrl = process.env.PUBLIC_BASE_URL;
  const originalRenderExternalUrl = process.env.RENDER_EXTERNAL_URL;
  const originalVercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  try {
    delete process.env.VAPI_WEBHOOK_URL;
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    process.env.RENDER_EXTERNAL_URL = "https://stem-voice-agent.onrender.com";
    const assistant = assistantConfiguration();
    assert.equal(assistant.server.url, "https://stem-voice-agent.onrender.com/api/webhooks/vapi");
  } finally {
    if (originalWebhookUrl === undefined) delete process.env.VAPI_WEBHOOK_URL;
    else process.env.VAPI_WEBHOOK_URL = originalWebhookUrl;
    if (originalPublicBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = originalPublicBaseUrl;
    if (originalRenderExternalUrl === undefined) delete process.env.RENDER_EXTERNAL_URL;
    else process.env.RENDER_EXTERNAL_URL = originalRenderExternalUrl;
    if (originalVercelProductionUrl === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = originalVercelProductionUrl;
    if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = originalVercelUrl;
  }
});

test("Vercel production URL is used for webhooks and API entrypoints export handlers", () => {
  const originalWebhookUrl = process.env.VAPI_WEBHOOK_URL;
  const originalPublicBaseUrl = process.env.PUBLIC_BASE_URL;
  const originalRenderExternalUrl = process.env.RENDER_EXTERNAL_URL;
  const originalVercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  try {
    delete process.env.VAPI_WEBHOOK_URL;
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "orderagent-chi.vercel.app";
    process.env.VERCEL_URL = "orderagent-preview.vercel.app";
    const assistant = assistantConfiguration();
    assert.equal(assistant.server.url, "https://orderagent-chi.vercel.app/api/webhooks/vapi");
    assert.equal(typeof require("../server").listen, "function");
    assert.equal(typeof serverlessHandler, "function");
    assert.equal(typeof require("../api/health"), "function");
    assert.equal(typeof require("../api/auth/me"), "function");
    assert.equal(typeof require("../api/integrations/vapi/deploy"), "function");
  } finally {
    if (originalWebhookUrl === undefined) delete process.env.VAPI_WEBHOOK_URL;
    else process.env.VAPI_WEBHOOK_URL = originalWebhookUrl;
    if (originalPublicBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = originalPublicBaseUrl;
    if (originalRenderExternalUrl === undefined) delete process.env.RENDER_EXTERNAL_URL;
    else process.env.RENDER_EXTERNAL_URL = originalRenderExternalUrl;
    if (originalVercelProductionUrl === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = originalVercelProductionUrl;
    if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = originalVercelUrl;
  }
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

test("dashboard APIs authenticate using signed sessions in Vercel serverless instances", async (context) => {
  const originalVercel = process.env.VERCEL;
  process.env.SUPABASE_URL ||= "https://project.example.supabase.co";
  process.env.SUPABASE_SECRET_KEY ||= "sb_secret_test";
  process.env.ADMIN_EMAIL ||= "admin@example.com";
  process.env.ADMIN_PASSWORD_HASH ||= hashAdminPassword("correct horse battery staple");
  process.env.VERCEL = "1";
  context.after(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  });

  const server = http.createServer(serverlessHandler);
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
