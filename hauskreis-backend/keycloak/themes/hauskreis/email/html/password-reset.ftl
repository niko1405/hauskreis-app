<#--
  „Passwort vergessen" von der Anmeldeseite. Die einzige der drei Mails, die
  das Backend nicht auslöst — Keycloak verschickt sie selbst.
-->
<#import "template.ftl" as layout>
<@layout.emailLayout headline=msg("passwordResetHeadline")>
  <@layout.paragraph>${kcSanitize(msg("passwordResetIntro"))?no_esc}</@layout.paragraph>
  <@layout.button href=link label=msg("passwordResetButton") />
  <@layout.paragraph muted=true>${kcSanitize(msg("passwordResetFootnote", linkExpirationFormatter(linkExpiration)))?no_esc}</@layout.paragraph>
</@layout.emailLayout>
