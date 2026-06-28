import { Body } from '@nestjs/common';
import { type ZodType } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe.js';

/**
 * Parameter decorator that binds a request body to a Zod schema.
 *
 * It is sugar over `@Body(new ZodValidationPipe(schema))`, keeping controllers
 * declarative and the schema (the single source of truth in @magpie/shared)
 * attached right at the route.
 *
 *   @Post()
 *   create(@ZodBody(createSiteRequestSchema) dto: CreateSiteRequest) { ... }
 */
export function ZodBody<TSchema extends ZodType>(schema: TSchema): ParameterDecorator {
  return Body(new ZodValidationPipe(schema));
}
