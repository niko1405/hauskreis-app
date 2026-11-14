<#--
  Die Anmeldeseite — mit „Weiter mit Google" oben statt unten.

  Kopiert aus Keycloak 26.4 (keycloak.v2/login/login.ftl, Stand 26.4.7). Die
  einzige Abweichung ist markiert: Die Anbieter stehen über dem Formular
  (`hk-social.ftl`), und der Abschnitt `socialProviders`, in dem keycloak.v2 sie
  unter das Formular setzt, bleibt leer. Eine Reihenfolge lässt sich mit dem
  Stylesheet allein nicht sauber drehen. Beim nächsten Keycloak-Update gegen die
  neue Fassung halten — `keycloak-theme-templates.spec.ts` erinnert daran.
-->
<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#import "buttons.ftl" as buttons>
<#import "hk-social.ftl" as hk>
<#import "passkeys.ftl" as passkeys>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
<!-- template: login.ftl (Acts2) -->

    <#if section = "header">
        ${msg("loginAccountTitle")}
    <#elseif section = "form">
        <#-- Acts2: die Anbieter zuerst. -->
        <#if realm.password>
            <@hk.socialButtons social=social/>
        </#if>
        <div id="kc-form">
          <div id="kc-form-wrapper">
            <#if realm.password>
                <form id="kc-form-login" class="${properties.kcFormClass!}" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post" novalidate="novalidate">
                    <#if !usernameHidden??>
                        <#assign label>
                            <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>
                        </#assign>
                        <@field.input name="username" label=label error=kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc
                            autofocus=true autocomplete="${(enableWebAuthnConditionalUI?has_content)?then('username webauthn', 'username')}" value=login.username!'' />
                        <@field.password name="password" label=msg("password") error="" forgotPassword=realm.resetPasswordAllowed autofocus=usernameHidden?? autocomplete="current-password">
                            <#if realm.rememberMe && !usernameHidden??>
                                <@field.checkbox name="rememberMe" label=msg("rememberMe") value=login.rememberMe?? />
                            </#if>
                        </@field.password>
                    <#else>
                        <@field.password name="password" label=msg("password") forgotPassword=realm.resetPasswordAllowed autofocus=usernameHidden?? autocomplete="current-password">
                            <#if realm.rememberMe && !usernameHidden??>
                                <@field.checkbox name="rememberMe" label=msg("rememberMe") value=login.rememberMe?? />
                            </#if>
                        </@field.password>
                    </#if>

                    <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>
                    <@buttons.loginButton />
                </form>
            </#if>
            </div>
        </div>
        <@passkeys.conditionalUIData />
    <#elseif section = "info" >
        <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <div id="kc-registration-container">
                <div id="kc-registration">
                    <span>${msg("noAccount")} <a href="${url.registrationUrl}">${msg("doRegister")}</a></span>
                </div>
            </div>
        </#if>
    </#if>

</@layout.registrationLayout>
