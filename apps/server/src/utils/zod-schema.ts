// zod-to-json-schema expects Zod v3 schemas.
import { zodToJsonSchema, type Targets } from "zod-to-json-schema";
import { z } from "zod/v3";

type SchemaMap = Record<string, z.ZodTypeAny>;
type SchemaRef = string | { key: string; description?: string };

type BuildJsonSchemasOptions = {
    $id?: string;
    target?: Targets;
    errorMessages?: boolean;
};

export const buildJsonSchemas = (models: SchemaMap, opts: BuildJsonSchemasOptions = {}) => {
    const zodSchema = z.object(models);
    const $id = opts.$id ?? "Schema";
    const zodJsonSchema = zodToJsonSchema(zodSchema, {
        basePath: [`${$id}#`],
        ...(opts.target ? { target: opts.target } : {}),
        ...(typeof opts.errorMessages === "boolean" ? { errorMessages: opts.errorMessages } : {}),
    });

    const jsonSchema = {
        $id,
        ...zodJsonSchema,
    };

    const $ref = (key: SchemaRef) => {
        const schemaKey = typeof key === "string" ? key : key.key;
        const ref = `${$id}#/properties/${schemaKey}`;

        if (typeof key === "string") {
            return { $ref: ref };
        }

        return {
            $ref: ref,
            description: key.description,
        };
    };

    return {
        schemas: [jsonSchema],
        $ref,
    };
};
