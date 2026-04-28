# MCP tool call functionality

* There is a tool-calls handler in `rbcz-digi-mcp-bridge` application, see function `handleToolsCall`. 
* This functionality parse incoming MCP request and uses axios to call target backend, then translates the reponse into MCP response.
* I would like to incorporate MCP tool exection/call into `rbcz-digi-openapi-to-mcp-lib` library.
* Again the goal is to split it into smaller pieces of code and make it testable, i.e. low cyclomatic complexity, high code coverage.
* Analyze the existing plan and prepare implementation plan for it. Put the plan into `rbcz-digi-openapi-to-mcp-lib/docs/ai-specs/002-mcp-tool-call/plan.md` file.

