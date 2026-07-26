import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { createZodValidationPipe } from 'nestjs-zod';

const StrictZodValidationPipe = createZodValidationPipe({
  strictSchemaDeclaration: true,
});

/**
 * Global validation pipe.
 *
 * `strictSchemaDeclaration` makes nestjs-zod throw whenever a handler argument
 * is not typed with a Zod DTO, which is exactly the safety net we want for
 * request payloads — it catches endpoints that silently skip validation.
 *
 * It applies that rule to *every* argument though, including values produced by
 * custom param decorators such as `@CurrentUser()`, which have no schema by
 * design. Those carry `type: 'custom'`, so we let them through untouched and
 * keep the strict behaviour for body, query and path parameters.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  private readonly strictPipe = new StrictZodValidationPipe();

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type === 'custom') {
      return value;
    }

    return this.strictPipe.transform(value, metadata);
  }
}
