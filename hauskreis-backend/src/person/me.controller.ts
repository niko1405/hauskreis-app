import { Controller, Get } from '@nestjs/common';
import { PersonService } from './person.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('me')
export class MeController {
  constructor(private readonly personService: PersonService) {}

  @Get()
  async me(@CurrentUser() user: AuthenticatedUser) {
    const person = await this.personService.resolveForUser(user);
    return { ...person, roles: user.roles };
  }
}
