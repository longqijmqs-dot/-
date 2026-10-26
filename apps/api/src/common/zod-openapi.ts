import type { ZodTypeAny } from 'zod';

/**
 * 把 zod schema 转成 OpenAPI 3 的 schema 片段，供 Swagger 文档使用。
 *
 * 为什么需要它？
 *   我们所有接口的入参校验都用 zod（契约包里的 schema），而 NestJS 的 Swagger
 *   只会自动识别 class-validator 的装饰器类。zod 是「值」，不是「类」，
 *   Swagger 无从得知，于是文档里就会出现 `No parameters` —— 用户点 Try it out
 *   也拿不到输入框，等于文档不可用。
 *
 * 为什么不装 zod-to-json-schema？
 *   我们只用到很少的几种类型（对象/字符串/数字/布尔/枚举/数组/可选）。手写一个小
 *   转换器 60 行，零依赖，行为完全可控；而且契约一改，文档自动跟着改，不会漂移。
 *
 * 支持的构造：object、string（min/max/email/uuid）、number（int/min/max）、
 * boolean、enum、literal、array、union、optional、nullable、default、effects(refine/transform)。
 * 未覆盖的类型会安全退化成 `{}`（Swagger 会显示为任意 object），不会让页面崩。
 */

type JsonSchema = Record<string, unknown>;

/** zod 内部结构没有稳定公开的类型，这里按需取用；升级 zod 大版本时需重新验证。 */
interface ZodInternalLike {
  _def?: {
    typeName?: string;
    shape?: () => Record<string, ZodTypeAny>;
    checks?: Array<{ kind: string; value?: number; regex?: RegExp }>;
    values?: string[];
    innerType?: ZodTypeAny;
    schema?: ZodTypeAny;
    type?: ZodTypeAny;
    options?: ZodTypeAny[];
    value?: unknown;
    defaultValue?: () => unknown;
    effect?: { type: string };
  };
}

function internals(schema: ZodTypeAny): ZodInternalLike['_def'] {
  return (schema as unknown as ZodInternalLike)._def;
}

/** 把字符串上的 checks（min/max/email/uuid）翻译成 OpenAPI 关键字。 */
function stringKeywords(checks: Array<{ kind: string; value?: number; regex?: RegExp }>): JsonSchema {
  const result: JsonSchema = { type: 'string' };
  for (const check of checks) {
    switch (check.kind) {
      case 'min':
        result.minLength = check.value;
        break;
      case 'max':
        result.maxLength = check.value;
        break;
      case 'email':
        result.format = 'email';
        break;
      case 'uuid':
        result.format = 'uuid';
        break;
      case 'url':
        result.format = 'uri';
        break;
      case 'regex':
        if (check.regex) {
          result.pattern = check.regex.source;
        }
        break;
      default:
        break;
    }
  }
  return result;
}

function numberKeywords(checks: Array<{ kind: string; value?: number }>): JsonSchema {
  const result: JsonSchema = { type: 'number' };
  for (const check of checks) {
    switch (check.kind) {
      case 'int':
        result.type = 'integer';
        break;
      case 'min':
        result.minimum = check.value;
        break;
      case 'max':
        result.maximum = check.value;
        break;
      default:
        break;
    }
  }
  return result;
}

export function zodToOpenApiSchema(schema: ZodTypeAny): JsonSchema {
  const def = internals(schema);
  if (!def?.typeName) {
    return {};
  }

  switch (def.typeName) {
    case 'ZodObject': {
      const shape = def.shape?.() ?? {};
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, child] of Object.entries(shape)) {
        const childDef = internals(child);
        properties[key] = zodToOpenApiSchema(child);

        // optional / default 的字段不是必填；其余都要列进 required
        const childType = childDef?.typeName;
        if (childType === 'ZodOptional' || childType === 'ZodDefault') {
          continue;
        }
        required.push(key);
      }
      return {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
      };
    }

    case 'ZodString':
      return stringKeywords(def.checks ?? []);

    case 'ZodNumber':
      return numberKeywords(def.checks ?? []);

    case 'ZodBoolean':
      return { type: 'boolean' };

    case 'ZodEnum':
      return { type: 'string', enum: def.values ?? [] };

    case 'ZodLiteral':
      return { const: def.value };

    case 'ZodArray':
      return {
        type: 'array',
        items: def.type ? zodToOpenApiSchema(def.type) : {},
      };

    case 'ZodUnion':
      return { anyOf: (def.options ?? []).map((option) => zodToOpenApiSchema(option)) };

    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
      return def.innerType ? zodToOpenApiSchema(def.innerType) : {};

    // refine / transform 之类包裹层：看内层真实类型
    case 'ZodEffects':
      return def.schema ? zodToOpenApiSchema(def.schema) : {};

    default:
      return {};
  }
}

/** 便捷方法：取出某个对象的属性，用于逐个声明 @ApiQuery 参数。 */
export function zodObjectProperties(
  schema: ZodTypeAny,
): Array<{ name: string; schema: JsonSchema; required: boolean; description?: string }> {
  const def = internals(schema);
  if (def?.typeName !== 'ZodObject' || !def.shape) {
    return [];
  }
  const shape = def.shape();
  return Object.entries(shape).map(([name, child]) => {
    const childDef = internals(child);
    const childType = childDef?.typeName;
    return {
      name,
      schema: zodToOpenApiSchema(child),
      required: childType !== 'ZodOptional' && childType !== 'ZodDefault',
      description: child.description,
    };
  });
}
