<#--
  Die Einladung in den Hauskreis.

  Keycloak wählt diese Vorlage nach dem **Endpunkt**
  (`PUT /users/{id}/execute-actions-email`), nicht nach der Liste der Aktionen —
  siehe `keycloak-admin.service.ts`. Für diese App heißt das: Was hier steht,
  ist die Einladung, und nichts sonst.

  Die drei Schritte (Nutzername, Passwort, Adresse) stehen als Satz im Text und
  nicht als aufgezählte `requiredActions`. Eine Liste technischer Namen ist
  keine Einladung.
-->
<#import "template.ftl" as layout>
<@layout.emailLayout headline=msg("executeActionsHeadline")>
  <@layout.paragraph>${kcSanitize(msg("executeActionsIntro"))?no_esc}</@layout.paragraph>
  <@layout.button href=link label=msg("executeActionsButton") />
  <@layout.paragraph>${kcSanitize(msg("executeActionsAfter"))?no_esc}</@layout.paragraph>
  <@layout.paragraph muted=true>${kcSanitize(msg("executeActionsFootnote", linkExpirationFormatter(linkExpiration)))?no_esc}</@layout.paragraph>
</@layout.emailLayout>
