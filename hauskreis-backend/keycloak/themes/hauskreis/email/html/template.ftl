<#--
  Der Rahmen um jede Mail, die Keycloak im Namen von Acts2 verschickt.

  **Warum diese Datei überhaupt existiert.** Das Theme erbt sonst nur Texte —
  eine kopierte Vorlage muss man bei jedem Keycloak-Update gegen die neue
  Fassung halten, und das war die Ausrede wert, solange es nur um zwei Sätze
  ging. Für ein Aussehen reicht sie nicht: Keycloak schickt den Nachrichtentext
  durch `kcSanitize()`, und das entfernt `style`-Attribute und `<style>`-Blöcke.
  Gestaltung, die in `messages_de.properties` steht, kommt nackt an. Sie muss
  hierher.

  Ersetzt wird Keycloaks eigene `base/email/html/template.ftl` — sechs Zeilen
  ohne `<head>`, ohne Stil, ohne alles. Sie ist der Grund, warum die Mails
  bisher wie Browser-Standard aussahen. Beim Keycloak-Update gegen die neue
  Fassung halten, wie bei `login/info.ftl`.

  **Warum Tabellen und Inline-Stile.** Nicht aus Nostalgie: Outlook rendert mit
  Word, Gmail entfernt `<style>`-Blöcke aus dem `<head>`. Was ankommen soll,
  steht am Element. Aus demselben Grund keine eigenen Schriften — Georgia für
  die Überschriften, die Systemschrift für den Fließtext.

  **Warum eine Wortmarke und kein Logo.** Keycloak liefert `resources/` für
  E-Mail-Themes nicht aus; ein Bild müsste von `acts2.de` nachgeladen werden.
  Viele Programme blockieren das standardmäßig, und die Domain stünde fest im
  Theme. Gesetzter Text kommt immer an.

  Die Farben stammen aus `login/resources/css/hauskreis.css`, wo sie schon
  einmal aus `globals.css` in Hex übersetzt wurden.
-->
<#macro emailLayout headline>
<!DOCTYPE html>
<html lang="${locale.language}" dir="${(ltr)?then('ltr','rtl')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<#-- Ohne diese beiden dreht Gmail die Farben im Dunkelmodus selbst um, und
     zwar schlechter, als wir es könnten: Ein heller Knopf auf hellem Grund. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${msg("emailBrand")}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5efe9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5efe9;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

        <#-- Briefkopf: Wortmarke über einem Terracotta-Strich. -->
        <tr>
          <td align="center" style="padding:0 0 24px;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1;color:#1c1917;letter-spacing:-0.5px;">${msg("emailBrand")}</div>
            <div style="width:36px;height:3px;margin:12px auto 0;background-color:#cc7a5e;border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>
          </td>
        </tr>

        <#-- Die Karte. 28px Radien wie in der App; Outlook rundet nicht mit,
             was dort einen sauberen Kasten ergibt statt eines kaputten. -->
        <tr>
          <td style="background-color:#fffdfb;border:1px solid #f0e5de;border-radius:28px;padding:36px 32px;">
            <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:normal;color:#1c1917;">${headline}</h1>
            <#nested>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:24px 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#a8a29e;">
            ${msg("emailFooter")}
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
</body>
</html>
</#macro>

<#--
  Ein Absatz Fließtext. Als Makro, damit die Schriftangaben nicht in jeder
  Vorlage noch einmal stehen — Mails erben nichts, jedes Element trägt sein
  Aussehen selbst.
-->
<#macro paragraph muted=false>
<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${muted?then('#78716c','#292524')};"><#nested></p>
</#macro>

<#--
  Der Knopf, und darunter dieselbe Adresse als Text.

  Beides gehört zusammen: Knöpfe werden von Programmen verstümmelt, von
  Sicherheitsfiltern umgeschrieben und von Textansichten verschluckt. Wenn er
  nicht funktioniert, muss die Adresse trotzdem dastehen — sonst endet die
  Einladung in einer Mail, aus der kein Weg herausführt.

  `word-break` ist kein Schmuck: Ein Keycloak-Link mit Token ist über 200
  Zeichen lang und sprengt sonst die Karte.
-->
<#macro button href label>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
  <tr>
    <td align="center" bgcolor="#cc7a5e" style="border-radius:999px;">
      <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;line-height:1;color:#ffffff;text-decoration:none;border-radius:999px;">${label}</a>
    </td>
  </tr>
</table>
<p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#a8a29e;">${msg("emailLinkFallback")}</p>
<p style="margin:0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${href}" style="color:#b16248;">${href}</a></p>
</#macro>
