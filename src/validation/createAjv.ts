import { Ajv } from "ajv";
import addFormatsImport from "ajv-formats";

// ajv-formats publishes its plugin as a CommonJS default export. With NodeNext
// module resolution the synthesized interop sometimes surfaces the plugin under
// `.default`; fall back to that when present so both shapes work.
const addFormats: (ajv: Ajv) => Ajv =
    (addFormatsImport as unknown as { default?: (ajv: Ajv) => Ajv }).default ?? (addFormatsImport as unknown as (ajv: Ajv) => Ajv);

/**
 * Build the AJV instance used by ResponseValidator. Options match the bridge:
 *   - allErrors: we want full error lists, not just the first failure
 *   - strict: false so OpenAPI-specific keywords like `example` do not throw
 *   - coerceTypes / useDefaults / removeAdditional off — validate exactly what we get
 */
export function createAjv(): Ajv {
    const ajv = new Ajv({
        allErrors: true,
        verbose: true,
        strict: false,
        coerceTypes: false,
        useDefaults: false,
        removeAdditional: false,
    });
    addFormats(ajv);
    return ajv;
}
