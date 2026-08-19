<#--
  Die Einwilligung, und zwar die nach Art. 9 DSGVO.

  **Die zweite kopierte Vorlage in diesem Theme, und der Grund steht hier.**
  Keycloaks eigene Fassung zeigt den Text und darunter „Akzeptieren" und
  „Ablehnen" — kein Kontrollkästchen. Für eine ausdrückliche Einwilligung soll
  aber genau das dastehen: ein Haken, den ein Mensch selbst setzt, und darüber
  der Satz, dem er zustimmt.

  Kopiert aus Keycloak 26.4 (keycloak.v2/login/terms.ftl). Abweichungen, alle
  markiert: die Nutzungsbedingungen als eigener Absatz, das Kästchen, und der
  „Akzeptieren"-Knopf, der gesperrt bleibt, solange es leer ist. Beim nächsten
  Keycloak-Update gegen die neue Fassung halten.

  Das Sperren macht ein Skript — ohne JavaScript bleibt der Knopf offen. Das ist
  hier vertretbar und in der Fußzeile nicht: Der Haken ist eine Bequemlichkeit
  vor dem Absenden, die **Aussage** steht im Text darüber und im Knopf, der
  „Akzeptieren" heißt. Ein Impressum dagegen wäre ohne JavaScript schlicht
  nicht vorhanden.
-->
<#import "template.ftl" as layout>
<#import "buttons.ftl" as buttons>

<@layout.registrationLayout displayMessage=false; section>
<!-- template: terms.ftl (Acts2) -->

    <#if section = "header">
        ${msg("termsTitle")}
    <#elseif section = "form">
    <div class="${properties.kcContentWrapperClass}">
        <#-- Abweichung 1: die Nutzungsbedingungen, auf die der Satz unten sich
             beruft. Sie stehen hier und nicht auf einer eigenen Seite — was man
             akzeptiert, gehört dorthin, wo man akzeptiert. -->
        <p class="hk-terms-intro">${msg("termsIntro")}</p>

        <#-- Abweichung 2: das Kästchen. Der Link auf die Datenschutzerklärung
             wird hier gebaut und nicht im Textbaustein: `kcSanitize` würde
             `target` aus einem Anker im Properties-Text entfernen, und ohne das
             führte der Link mitten aus der Anmeldung heraus. -->
        <label class="hk-terms-check" for="hk-terms-accepted">
            <input type="checkbox" id="hk-terms-accepted" />
            <span>
                ${msg("termsConsentBefore")}
                <a href="https://acts2.de/datenschutz" target="_blank" rel="noreferrer">${msg("legalPrivacy")}</a>
                ${msg("termsConsentAfter")}
            </span>
        </label>
    </div>
    <form class="${properties.kcFormClass!}" action="${url.loginAction}" method="POST">
        <@buttons.actionGroup horizontal=true>
            <@buttons.button name="accept" id="kc-accept" label="doAccept" class=["kcButtonPrimaryClass"]/>
            <@buttons.button name="cancel" id="kc-decline" label="doDecline" class=["kcButtonSecondaryClass"]/>
        </@buttons.actionGroup>
    </form>
    <div class="clearfix"></div>

    <#-- Abweichung 3: „Akzeptieren" bleibt gesperrt, bis der Haken sitzt. -->
    <script type="text/javascript">
        (function () {
            var box = document.getElementById('hk-terms-accepted');
            var accept = document.getElementById('kc-accept');
            if (!box || !accept) return;

            function sync() {
                accept.disabled = !box.checked;
            }

            box.addEventListener('change', sync);
            sync();
        })();
    </script>
    </#if>
</@layout.registrationLayout>
