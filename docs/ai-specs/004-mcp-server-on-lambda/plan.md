# 004 — Running the MCP sample on AWS Lambda (private API Gateway, CDK)

Plan for hosting the `examples/mcp-sample` MCP server inside an AWS Lambda
function fronted by a **private REST API Gateway**, deployed via AWS CDK.

## TL;DR — recommendation

The current `examples/mcp-sample/src/server.ts` is already a near-perfect
fit for Lambda: it's stateless (`sessionIdGenerator: undefined`),
single-shot JSON responses (`enableJsonResponse: true`, no SSE), and
rebuilds the `Server`+transport per request. The only mismatch is that
`StreamableHTTPServerTransport.handleRequest(req, res)` wants a Node
`IncomingMessage`/`ServerResponse`, and Lambda hands you an
`APIGatewayProxyEvent` instead. So the whole job reduces to **bridging the
event ↔ Node-stream pair**, plus standard CDK plumbing for a private REST
API.

## Architecture

```
MCP client (in your VPC)
        │  HTTPS POST /mcp
        ▼
VPC Interface Endpoint  (com.amazonaws.<region>.execute-api)
        │
        ▼
API Gateway REST API   (endpointType = PRIVATE, resource policy: aws:SourceVpce = <vpce-id>)
        │  Lambda proxy integration ({proxy+})
        ▼
Lambda function          (Node 20 runtime, ESM)
   │
   ├─ cold-start (once per container)
   │     parseOpenApiSpec()  →  Endpoint[]
   │     buildToolDefinition / buildAjvFilter / buildSchemaFilter (per endpoint)
   │     new ResponseValidator({ logger })
   │
   └─ per invocation
         translate event → fake (req, res)
         new Server + new StreamableHTTPServerTransport (stateless)
         await transport.handleRequest(req, res)
         translate fake-res → APIGatewayProxyResult
```

Why **REST API** and not HTTP API: only REST APIs support
`endpointType: PRIVATE` with VPC endpoints. HTTP API can talk to private
targets (VPC link), but the API itself can't be VPC-private. "Private API
Gateway" → REST.

## The one piece that actually needs new code

`transport.handleRequest(req, res)` needs:

- `req`: a readable stream + `headers`, `method`, `url`.
- `res`: an object that supports `setHeader`, `writeHead`, `write`, `end`,
  and emits `'close'` / `'finish'`.

Two viable strategies, in order of preference:

### Option A — hand-rolled adapter (~40 LOC, no new deps) **← recommended**

Build a `PassThrough` for the request body and a tiny `ServerResponse`-shaped
capture object. Resolve a Promise on `res.end()`, then convert the captured
`{ statusCode, headers, body }` to `APIGatewayProxyResult`. This works
because `enableJsonResponse: true` guarantees a single, complete response
(no streaming), so you only ever need to capture one final body.

Sketch:

```ts
function eventToReq(event: APIGatewayProxyEvent): IncomingMessage { /* PassThrough + headers + url + method */ }
function captureRes(): { res: ServerResponse; done: Promise<APIGatewayProxyResult> } { /* … */ }
```

The Lambda `handler` then becomes:

```ts
const { req }      = eventToReq(event);
const { res, done } = captureRes();
const server       = createMcpServer();      // exact same factory as today
const transport    = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
await server.connect(transport);
transport.handleRequest(req, res);            // do not await — the Promise resolves via res.end()
return await done;
```

Pros: no new dependency, easy to reason about, Lambda payload size (6 MB
sync) is well within reach for typical MCP responses.
Cons: you own the adapter — but it's tiny and easy to test in isolation.

### Option B — `@codegenie/serverless-express` (or `@vendia/serverless-express`)

Wrap an Express app whose only route is `POST /mcp` and inside the handler
call `transport.handleRequest(req, res)`. The library does the
event ↔ req/res translation for you.

Pros: zero adapter code; well-trodden.
Cons: drags in Express, a layer of routing you don't need, and a slightly
bigger deployment artifact.

### Option C — AWS Lambda Web Adapter

Runs your existing `createHttpServer(...)` *unchanged* inside Lambda by
intercepting the runtime via a layer or extension. Best when you want
literal zero diff between local and Lambda.

Pros: zero MCP-side code changes — `server.ts` runs as-is.
Cons: extra layer/extension, a bit more operational surface; overkill for
this small adapter.

## Option A — full implementation

Three files. None of them import from this library directly — they only
talk to the MCP SDK and the `initialise()` factory you'd extract from
`server.ts` (see step 1 in [Suggested implementation order](#suggested-implementation-order)).

### `adapter.ts` — `eventToReq` + `captureRes`

```ts
import { Readable, Writable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

/**
 * Build a Node `IncomingMessage`-shaped object from an API Gateway proxy event.
 *
 * The MCP SDK's `StreamableHTTPServerTransport.handleRequest` reads the body
 * by treating `req` as a Readable stream and inspects `headers`, `method`,
 * `url`. That is the entire surface we need to satisfy.
 */
export function eventToReq(event: APIGatewayProxyEvent): IncomingMessage {
    const bodyBuf = event.body
        ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8")
        : Buffer.alloc(0);

    // A Readable that yields the body once and ends. If the body is empty we
    // still need a stream that emits 'end' — Readable.from([]) does that.
    const stream = Readable.from(bodyBuf.length > 0 ? [bodyBuf] : []);

    // Node IncomingMessage uses lowercase header keys and joins multi-value
    // headers with ", " (per RFC 7230 §3.2.2). Mirror that.
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(event.headers ?? {})) {
        if (v !== undefined) headers[k.toLowerCase()] = v;
    }
    if (event.multiValueHeaders) {
        for (const [k, vs] of Object.entries(event.multiValueHeaders)) {
            if (vs && vs.length > 1) headers[k.toLowerCase()] = vs.join(", ");
        }
    }

    const url = buildUrl(event);

    return Object.assign(stream, {
        headers,
        method: event.httpMethod,
        url,
        httpVersion: "1.1",
        httpVersionMajor: 1,
        httpVersionMinor: 1,
        complete: false,
        aborted: false,
    }) as unknown as IncomingMessage;
}

function buildUrl(event: APIGatewayProxyEvent): string {
    const params = new URLSearchParams();
    if (event.multiValueQueryStringParameters) {
        for (const [k, vs] of Object.entries(event.multiValueQueryStringParameters)) {
            if (vs) for (const v of vs) params.append(k, v);
        }
    } else if (event.queryStringParameters) {
        for (const [k, v] of Object.entries(event.queryStringParameters)) {
            if (v !== undefined) params.append(k, v);
        }
    }
    const qs = params.toString();
    return qs ? `${event.path}?${qs}` : event.path;
}

/**
 * Build a Node `ServerResponse`-shaped capture object plus a Promise that
 * resolves to an `APIGatewayProxyResult` once the SDK calls `res.end()`.
 *
 * The SDK transport (in `enableJsonResponse: true` mode) only ever calls:
 *   setHeader / writeHead / write / end
 * so we don't need to emulate the full ServerResponse surface — just the
 * methods the transport touches.
 */
export function captureRes(): { res: ServerResponse; done: Promise<APIGatewayProxyResult> } {
    const chunks: Buffer[] = [];
    const headers: Record<string, string | string[]> = {};
    let statusCode = 200;

    let resolveDone!: (r: APIGatewayProxyResult) => void;
    let rejectDone!: (err: unknown) => void;
    const done = new Promise<APIGatewayProxyResult>((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
    });

    const writable = new Writable({
        write(chunk, _enc, cb) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            cb();
        },
    });

    const stub = Object.assign(writable, {
        statusCode,
        statusMessage: "",
        headersSent: false,

        setHeader(name: string, value: string | string[]) {
            headers[name.toLowerCase()] = value;
            return stub;
        },
        getHeader(name: string) {
            return headers[name.toLowerCase()];
        },
        getHeaderNames() {
            return Object.keys(headers);
        },
        getHeaders() {
            return { ...headers };
        },
        hasHeader(name: string) {
            return name.toLowerCase() in headers;
        },
        removeHeader(name: string) {
            delete headers[name.toLowerCase()];
        },

        writeHead(code: number, hdrs?: Record<string, string | string[]>) {
            stub.statusCode = code;
            if (hdrs) {
                for (const [k, v] of Object.entries(hdrs)) {
                    headers[k.toLowerCase()] = v;
                }
            }
            stub.headersSent = true;
            return stub;
        },

        flushHeaders() {
            stub.headersSent = true;
        },
    });

    writable.on("finish", () => {
        const body = Buffer.concat(chunks).toString("utf8");

        // Lambda response shape splits single-value vs multi-value headers.
        const singleHeaders: Record<string, string> = {};
        const multiHeaders: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(headers)) {
            if (Array.isArray(v)) multiHeaders[k] = v;
            else singleHeaders[k] = v;
        }

        resolveDone({
            statusCode: stub.statusCode,
            headers: singleHeaders,
            ...(Object.keys(multiHeaders).length ? { multiValueHeaders: multiHeaders } : {}),
            body,
            isBase64Encoded: false,
        });
    });

    writable.on("error", rejectDone);

    return { res: stub as unknown as ServerResponse, done };
}
```

Notes:

- The cast to `IncomingMessage` / `ServerResponse` via `as unknown as` is
  intentional. We're satisfying the *behavioural* contract the SDK uses,
  not the full type. The MCP SDK transport only touches the methods
  enumerated above; if a future version uses more, extend the stub.
- `headers` are kept lowercased throughout to match Node's
  `IncomingMessage.headers` convention. If the SDK casing-sensitively
  reads e.g. `req.headers["accept"]`, this is what it expects.
- The `done` promise resolves on the writable's `'finish'` event. The SDK
  calls `res.end(body)`, which emits `'finish'` after the final chunk is
  flushed.

### `lambda.ts` — handler with `APIGatewayProxyEvent` signature

```ts
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { executeToolCall } from "rbcz-digi-openapi-to-mcp-lib";

import { eventToReq, captureRes } from "./adapter.js";
import { initialise } from "./initialise.js";   // extracted from server.ts main()

const MCP_PATH = "/mcp";

// Module scope — runs once per container (cold start). Do all heavy work
// here so warm invocations only do per-request work.
const ctx = await initialise();

function createMcpServer(): Server {
    const server = new Server(
        { name: "rbcz-digi-mcp-sample", version: "0.1.0" },
        { capabilities: { tools: { listChanged: false } } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ctx.tools }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args = {} } = request.params;

        const endpoint = ctx.toolRegistry.get(name);
        if (!endpoint) {
            return {
                content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
                isError: true,
            };
        }

        const filter =
            ctx.FILTER_KIND === "ajv"
                ? (ctx.ajvFilterRegistry.get(ctx.BACKEND, ctx.PROTOCOL, name) ?? null)
                : ctx.FILTER_KIND === "legacy"
                  ? (ctx.legacyFilterRegistry.get(ctx.BACKEND, ctx.PROTOCOL, name) ?? null)
                  : null;

        const result = await executeToolCall({
            endpoint,
            args: args as Record<string, unknown>,
            httpClient: ctx.httpClient,
            filter,
            validator: ctx.validator,
            outputSchema: ctx.outputSchemas.get(name),
            logger: ctx.logger,
        });
        return result as unknown as Record<string, unknown>;
    });

    return server;
}

export const handler = async (
    event: APIGatewayProxyEvent,
    _context: Context,
): Promise<APIGatewayProxyResult> => {
    if (event.path !== MCP_PATH || event.httpMethod !== "POST") {
        return {
            statusCode: 404,
            headers: { "content-type": "text/plain" },
            body: `Not found. MCP endpoint is POST ${MCP_PATH}`,
        };
    }

    const req = eventToReq(event);
    const { res, done } = captureRes();

    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    });

    try {
        await server.connect(transport);
        // handleRequest writes to `res`; `done` resolves on res.end().
        // Awaiting both is fine — handleRequest resolves after end() too,
        // so by the time it returns, `done` is already settled.
        await transport.handleRequest(req, res);
        return await done;
    } catch (err) {
        ctx.logger.error("[lambda] request failed", err);
        return {
            statusCode: 500,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Internal error" },
                id: null,
            }),
        };
    } finally {
        // Match the cleanup the local sample does in `res.on("close", …)`.
        await transport.close().catch(() => {});
        await server.close().catch(() => {});
    }
};
```

### `initialise.ts` (referenced above) — what to extract from `server.ts`

A pure factory that returns the long-lived state. Pseudocode:

```ts
export async function initialise() {
    const specText = await readFile(SPEC_PATH, "utf8");
    const spec = await parseOpenApiSpec(specText);

    const tools: Tool[] = [];
    const toolRegistry = new ToolRegistry();
    const ajvFilterRegistry = new AjvFilterRegistry();
    const legacyFilterRegistry = new SchemaFilterRegistry();
    const outputSchemas = new Map<string, unknown>();
    const validator = new ResponseValidator({ logger });

    for (const endpoint of spec.endpoints) { /* …same loop as server.ts… */ }

    return {
        tools, toolRegistry, ajvFilterRegistry, legacyFilterRegistry,
        outputSchemas, validator, logger,
        httpClient: buildAxiosHttpClient(BASE_URL),
        FILTER_KIND, BACKEND, PROTOCOL,
    };
}
```

Both `server.ts` (local HTTP) and `lambda.ts` consume the same factory —
no duplication of the spec-parse / registry-build pipeline.

### Quick local sanity test (no AWS needed)

```ts
import { handler } from "./lambda.js";

const event = {
    httpMethod: "POST",
    path: "/mcp",
    headers: { "content-type": "application/json", "accept": "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    isBase64Encoded: false,
    queryStringParameters: null,
    multiValueHeaders: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: "/{proxy+}",
} as unknown as APIGatewayProxyEvent;

console.log(await handler(event, {} as Context));
```

This runs the whole pipeline in-process with a synthetic event — useful
for adapter regression tests. Add it to `examples/mcp-sample/test/` once
implemented.

## CDK stack outline

A single `Stack` with:

- **`Function`**: bundle `lambda.ts` + the OpenAPI spec via `NodejsFunction`
  (esbuild). Bundle the spec into the artifact (e.g.
  `commandHooks.beforeBundling` to copy `mch-all.yml` into the output, or
  `import specText from "./mch-all.yml"` with an esbuild text loader). Set
  `MCH_BASE_URL`, `MCP_FILTER` etc. as `environment`.
- **`RestApi`** with `endpointConfiguration: { types: [PRIVATE], vpcEndpoints: [<vpce>] }`
  and a resource policy restricting `aws:SourceVpce`. Add a single
  `{proxy+}` resource with `ANY` method → Lambda proxy integration. Or a
  fixed `/mcp` resource with `POST` only — your call; the proxy form is
  simpler.
- **`InterfaceVpcEndpoint`** for `execute-api` if one doesn't already
  exist (often shared).
- **IAM**: Lambda's role needs `logs:*` (default) plus whatever the
  upstream backend requires (VPC access, secrets, etc.). If the backend
  lives in a VPC, the Lambda goes in that VPC too — note the cold-start
  cost.

## Cold-start vs per-invocation split

Today `main()` runs the spec parse and registry building once at startup.
Mirror that in Lambda by running it in **module scope** (top-level `await`
is fine in Node 20 ESM), not inside the handler:

```ts
// module scope — runs once per container
const { tools, toolRegistry, ajvFilterRegistry, legacyFilterRegistry, outputSchemas, validator, httpClient } = await initialise();

export const handler = async (event: APIGatewayProxyEvent) => { /* per-request work only */ };
```

The MCP `Server` + transport stay per-request because of the
request-id-collision rationale already documented in
`examples/mcp-sample/README.md` — that's correct on Lambda too. Concurrent
invocations get separate containers, but request lifecycle still benefits
from a fresh transport.

## Things to watch / decide upfront

- **Payload limits**: API Gateway sync invocation caps at 10 MB request,
  Lambda response at 6 MB. MCP `tools/list` for big specs can grow —
  measure once with the real spec.
- **Timeout**: Lambda default 3 s, API Gateway max 30 s (sync). Set Lambda
  timeout to ≤ 29 s and make sure your `httpClient` upstream timeout is
  shorter.
- **`MCP_FILTER` and `MCH_BASE_URL`**: pass via Lambda env vars (no `.env`
  files in Lambda). The validation-failure logger already wired into
  `executeToolCall` will surface in CloudWatch Logs as-is — no work
  needed.
- **Auth**: private API Gateway gives you network-level auth (VPC endpoint
  + resource policy). If you also want IAM auth, set
  `authorizationType: AWS_IAM` and have callers SigV4-sign — fine
  alongside the private endpoint.
- **Concurrency / cold starts**: the spec parse + AJV compile is the
  heaviest cold-start cost. If it bites, turn on Provisioned Concurrency
  for that function. Don't lazy-init inside the handler.
- **Bundling the spec**: simplest is
  `import specText from "./mch-all.yml" with { type: "string" }` plus an
  esbuild text loader; alternative is reading from `/var/task` via
  `readFile`. Avoid S3-on-cold-start unless you have a reason.
- **Logging**: keep the existing `Logger` shape — just point its sinks at
  `console.*` (which CloudWatch picks up). No change needed from the
  current sample.

## Suggested implementation order

1. Extract `initialise()` from `main()` in `examples/mcp-sample/src/server.ts`
   (the spec parse + registries + validator + httpClient construction)
   into a separate module so both the local HTTP entry point and a Lambda
   entry point can reuse it.
2. Write the **request/response adapter** (Option A above) in its own
   file — easy to unit-test with synthetic events.
3. Write `lambda.ts` that does module-scope `await initialise()` and
   exports `handler`.
4. CDK stack: `NodejsFunction` (bundle `lambda.ts`), `RestApi` with
   PRIVATE endpoint + VPC endpoint + resource policy,
   `LambdaIntegration` proxy.
5. Smoke test with the same Bruno collection from
   `examples/bruno-collection/` — point the URL at the API Gateway invoke
   URL (from inside the VPC) and run
   `mcp-initialize` → `tools/list` → `tools/call`.

## Out of scope for this plan

- Persisting MCP sessions across invocations (would need DynamoDB/Redis
  and a non-stateless transport — not required because the sample is
  stateless by design).
- SSE / streaming responses (incompatible with sync API Gateway; would
  require Lambda Function URLs with response streaming and
  `enableJsonResponse: false`).
- Auth beyond network-level + optional IAM (e.g. Cognito, custom
  authorizers, MTLS) — slot in when the deployment context is decided.
