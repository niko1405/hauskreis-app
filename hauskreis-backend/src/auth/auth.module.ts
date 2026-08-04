import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { HauskreisMemberGuard } from './hauskreis-member.guard';
import { KeycloakAdminService } from './keycloak-admin.service';

@Global()
@Module({
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    // Nach dem AuthGuard: erst steht fest, wer da ist, dann ob er zu diesem
    // Hauskreis gehört. Eine realmweite Rollenprüfung gibt es nicht mehr —
    // „Admin" gilt pro Hauskreis und steht an der Mitgliedschaft.
    { provide: APP_GUARD, useClass: HauskreisMemberGuard },
    KeycloakAdminService,
  ],
  exports: [KeycloakAdminService],
})
export class AuthModule {}
