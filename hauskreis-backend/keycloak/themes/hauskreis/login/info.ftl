<#--
  Die Hinweis-Seite: Einladungslink geöffnet, Adresse bestätigt, Passwort
  gesetzt, Seite abgelaufen. Keycloak nimmt für all das dieselbe Vorlage.

  **Die einzige kopierte Vorlage in diesem Theme, und das ist eine bewusste
  Ausnahme.** Sonst gilt hier: nur Farbe und Text, keine .ftl-Dateien, damit
  ein Keycloak-Update nichts umwirft (siehe theme.properties). Für die
  Einladungsseite ging es nicht: Wer über den Link aus der Mail kommt, hat von
  Acts2 noch nie etwas gesehen, und dort sollte kurz stehen, worum es geht.
  Über die Textdatei allein ist das nicht möglich — `message.summary` setzt
  Keycloak **zweimal** ein, als Überschrift über der Karte und als ersten Satz
  darin. Ein Absatz Vorstellung wäre damit auch die Überschrift geworden.

  Kopiert aus Keycloak 26.4 (base/login/info.ftl), unverändert bis auf die eine
  markierte Zeile. Beim nächsten Keycloak-Update gegen die neue Fassung halten;
  wenn die Datei dort gleich geblieben ist, ist hier nichts zu tun.
-->
<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        <#if messageHeader??>
            ${kcSanitize(msg("${messageHeader}"))?no_esc}
        <#else>
            ${message.summary}
        </#if>
    <#elseif section = "form">
    <div id="kc-info-message">
        <#--
          Einzige Abweichung vom Original: Steht eine Liste von Schritten an,
          sind wir auf der Einladungsseite — dann kommt statt der Wiederholung
          der Überschrift die Vorstellung der App. Der Doppelpunkt mit der
          Schritt-Liste dahinter ist unverändert von Keycloak und schließt an
          den letzten Satz von `invitationIntro` an.
        -->
        <p class="instruction"><#if requiredActions??>${kcSanitize(msg("invitationIntro"))?no_esc}<#list requiredActions>: <b><#items as reqActionItem>${kcSanitize(msg("requiredAction.${reqActionItem}"))?no_esc}<#sep>, </#items></b></#list><#else>${message.summary}</#if></p>

        <#if skipLink??>
        <#else>
            <#if pageRedirectUri?has_content>
                <p><a href="${pageRedirectUri}">${kcSanitize(msg("backToApplication"))?no_esc}</a></p>
            <#elseif actionUri?has_content>
                <p><a href="${actionUri}">${kcSanitize(msg("proceedWithAction"))?no_esc}</a></p>
            <#elseif (client.baseUrl)?has_content>
                <p><a href="${client.baseUrl}">${kcSanitize(msg("backToApplication"))?no_esc}</a></p>
            </#if>
        </#if>
    </div>
    </#if>
</@layout.registrationLayout>
