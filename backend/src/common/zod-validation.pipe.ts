import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { type ZodType, type z } from 'zod';

/**
 * A pipe that validates and parses an incoming value against a Zod schema.
 *
 * On success the parsed (and, where the schema applies defaults/transforms,
 * normalized) value is returned. On failure a 400 BadRequestException is
 * thrown carrying the flattened Zod error so the client gets field-level
 * messages.
 *
 * Usage (per-route, via the {@link ZodBody} helper):
 *
 *   @Post()
 *   create(@ZodBody(createSiteRequestSchema) dto: CreateSiteRequest) { ... }
 *
 * No class-validator / class-transformer is involved anywhere.
 */
@Injectable()
export class ZodValidationPipe<TSchema extends ZodType> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.infer<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.flatten(),
      });
    }
    return result.data;
  }
}
