import { Controller, Get } from '@nestjs/common';
import { PersonService } from './person.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiZodResponse } from '../common/http/api-response.decorator';
import { MeResponseDto } from './dto/person-response.dto';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('me')
export class MeController {
  constructor(private readonly personService: PersonService) {}

  /**
   * Wer bin ich — die eigene Person plus die Rollen aus dem Token.
   *
   * `resolveForUser` gibt die vollständige Zeile zurück, also auch die
   * `keycloakUserId`. Das Antwort-Schema schneidet sie weg; ohne es stand sie
   * bis hierher in der Antwort, obwohl `…/people` sie längst zurückhielt.
   */
  @Get()
  @ApiZodResponse(MeResponseDto, {
    description: 'Die eigene Person samt Realm-Rollen',
  })
  async me(@CurrentUser() user: AuthenticatedUser) {
    const person = await this.personService.resolveForUser(user);
    return { ...person, roles: user.roles };
  }
}
