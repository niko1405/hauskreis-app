<#--
  Die Fußzeile unter der Anmeldekarte: Datenschutz und Impressum.

  **Keine kopierte Vorlage im eigentlichen Sinn.** `keycloak.v2/login/footer.ftl`
  ist ein leeres Makro und trägt in seinem eigenen Kommentar die Einladung, es
  zu überschreiben — es ist der vorgesehene Haken für genau das hier. Anders als
  bei `info.ftl` gibt es also nichts, was man „gegen die neue Fassung halten"
  müsste: Das Original ist drei Zeilen lang und leer.

  Warum nicht über `scripts=` in theme.properties: Ein Impressum, das erst der
  Browser zusammenbaut, ist ohne JavaScript nicht da. Für eine gesetzliche
  Pflicht ist das der falsche Ort zum Sparen.

  Die Adresse steht fest im Text. Ein Theme kennt keine Umgebungsvariablen, und
  `acts2.de` steht ohnehin schon in den nginx-Konfigurationen und im Compose.
-->
<#macro content>
<div class="hk-legal">
    <a href="https://acts2.de/datenschutz" target="_blank" rel="noreferrer">${msg("legalPrivacy")}</a>
    <span aria-hidden="true">·</span>
    <a href="https://acts2.de/impressum" target="_blank" rel="noreferrer">${msg("legalImprint")}</a>
</div>
</#macro>
