<#--
  „Bestätige deine Adresse" — nach der Registrierung und nach einem
  Adresswechsel im Profil.

  Anders als bei Keycloak setzt nicht der Text die Struktur zusammen, sondern
  diese Vorlage: Überschrift, Absatz, Knopf, Fußnote. Die Texte in
  `messages_de.properties` sind dadurch wieder Sätze statt HTML-Klumpen.

  **Nebenbei verschwindet damit eine alte Falle.** Die Gültigkeit stand dort je
  nach Vorlage als `{3}` oder `{4}`, weil Keycloak die Argumente unterschiedlich
  zählt — und `MessageFormat` lässt einen Platzhalter, den es nicht füllen kann,
  einfach stehen ("Der Link gilt {4}."). Hier wird nur das eine Argument
  übergeben, das gebraucht wird, und es ist immer `{0}`.
-->
<#import "template.ftl" as layout>
<@layout.emailLayout headline=msg("emailVerificationHeadline")>
  <@layout.paragraph>${kcSanitize(msg("emailVerificationIntro"))?no_esc}</@layout.paragraph>
  <@layout.button href=link label=msg("emailVerificationButton") />
  <@layout.paragraph muted=true>${kcSanitize(msg("emailVerificationFootnote", linkExpirationFormatter(linkExpiration)))?no_esc}</@layout.paragraph>
</@layout.emailLayout>
