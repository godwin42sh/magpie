import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.object({
  name: z.string().min(1),
  count: z.number().int().default(1),
});

describe('ZodValidationPipe', () => {
  it('returns parsed data on valid input', () => {
    const pipe = new ZodValidationPipe(schema);
    const result = pipe.transform({ name: 'ok', count: 3 });
    expect(result).toEqual({ name: 'ok', count: 3 });
  });

  it('applies schema defaults', () => {
    const pipe = new ZodValidationPipe(schema);
    const result = pipe.transform({ name: 'ok' });
    expect(result).toEqual({ name: 'ok', count: 1 });
  });

  it('throws BadRequestException on invalid input', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(() => pipe.transform({ name: '' })).toThrow(BadRequestException);
  });

  it('attaches the flattened zod error to the exception response', () => {
    const pipe = new ZodValidationPipe(schema);
    try {
      pipe.transform({ count: 'nope' });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as {
        message: string;
        errors: { fieldErrors: Record<string, string[]> };
      };
      expect(response.message).toBe('Validation failed');
      expect(response.errors.fieldErrors).toHaveProperty('name');
      expect(response.errors.fieldErrors).toHaveProperty('count');
    }
  });
});
