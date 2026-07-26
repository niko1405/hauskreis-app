import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { KeycloakAdminService } from './keycloak-admin.service';

@Global()
@Module({
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    KeycloakAdminService,
  ],
  exports: [KeycloakAdminService],
})
export class AuthModule {}
