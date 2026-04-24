# OpenAPI-based response filtering — research

## Problem

We call a backend API described by an OpenAPI spec and want to guarantee the
response we hand to downstream code contains **only** fields declared in the
spec's `200` response schema. Everything else must be stripped.

The current implementation (`src/filter/buildSchemaFilter.ts` +
`src/filter/extractAllowedFields.ts`) walks the response schema manually,
collecting every property name it encounters into a flat `Set<string>`, and
then presumably filters responses against that set.

The question: is there a simpler, off-the-shelf way — ideally a
serialization/deserialization library that works directly with OpenAPI?

## Recommendation

Use the libraries already in `dependencies`: **AJV + `@apidevtools/swagger-parser`**.
Point AJV at the dereferenced response schema with `removeAdditional: "all"` and
it strips any property not declared in `properties` / `additionalProperties`,
recursively. No custom walker needed.

Rough shape:

```ts
import Ajv from "ajv";
import addFormats from "ajv-formats";
import SwaggerParser from "@apidevtools/swagger-parser";

const spec = await SwaggerParser.dereference("openapi.yaml"); // resolves $refs
const schema = spec.paths["/x"].get.responses["200"].content["application/json"].schema;

const ajv = new Ajv({ removeAdditional: "all", strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

validate(response); // mutates response, stripping undeclared fields
```

## Why this beats the current approach

- **Correctness**: `extractAllowedFields` returns a *flat* `Set<string>` of names
  seen anywhere in the tree. A field `id` allowed on the inner object leaks
  permission to `id` at every other level. AJV walks structurally, so a field is
  only kept where the schema actually allows it.
- **Maintenance**: drops the custom `allOf` / `anyOf` / `oneOf` / `items` /
  `additionalProperties` recursion entirely.
- **Free extras**: real type validation, format checks, and errors we can log
  when the API returns something unexpected.

## Caveats

Two things worth knowing before ripping out the existing code:

1. **Polymorphism**. `removeAdditional: "all"` does not descend into
   `oneOf` / `anyOf` / `allOf` branches the way you'd want — AJV documents this
   explicitly. If real response schemas use polymorphism heavily, we need
   either schema rewriting (lift shared props to the parent) or `"failing"`
   mode with branches that set `additionalProperties: false`. Worth checking a
   few of the actual `200` schemas before committing.
2. **`nullable` vs union types**. OpenAPI 3.0 uses `nullable: true` instead of
   JSON Schema's `type: ["string", "null"]`. AJV 8 is JSON-Schema-draft-07/2020;
   we'd want AJV's OpenAPI-flavored build or a small preprocessing step.
   OpenAPI 3.1 is fully JSON-Schema-compatible so no issue there.

## Next step

Prototype the replacement against one of the existing test fixtures so we can
compare behaviour of the flat-set walker against AJV on the same input.
