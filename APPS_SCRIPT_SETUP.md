# Koppla Boule-appen till Google Sheets via Apps Script

En rad per avslutad match i ett Google Sheet. Tar ~5 minuter att sätta upp.

---

## Steg 1 — Skapa Google Sheet

1. Gå till [sheets.new](https://sheets.new) (öppnar ett nytt, tomt ark)
2. Döp det till **Boule matcher** (eller valfritt)
3. Lämna det tomt — skriptet skapar rubrikraden automatiskt

---

## Steg 2 — Öppna Apps Script

1. I ditt Sheet: menyn **Tillägg → Apps Script** (`Extensions → Apps Script`)
2. Ett nytt Apps Script-projekt öppnas med en fil `Code.gs`
3. Radera allt innehåll i `Code.gs`
4. Klistra in hela koden nedan

---

## Steg 3 — Klistra in denna kod

```javascript
/**
 * Boule Score Tracker — Google Sheets webhook
 * Tar emot POST-JSON från Boule-appen och sparar en rad per match.
 */

const SHEET_NAME = 'Matcher';

const HEADERS = [
  'Sparad',
  'Startade',
  'Slutade',
  'Tidszon',
  'Plats',
  'Latitud',
  'Longitud',
  'GPS-noggrannhet (m)',
  'Mål',
  'Lag 1',
  'Poäng 1',
  'Lag 2',
  'Poäng 2',
  'Vinnare',
  'Antal omgångar',
  'Omgångar (JSON)',
];

function doPost(e) {
  try {
    // Appen skickar antingen application/json eller text/plain (no-cors fallback).
    // Båda innehåller JSON-body i e.postData.contents.
    const raw = e && e.postData && e.postData.contents;
    if (!raw) throw new Error('Tom request body');

    const data = JSON.parse(raw);
    const sheet = getOrCreateSheet_();

    const row = [
      data.savedAt || new Date().toISOString(),
      data.startedAt || '',
      data.endedAt || '',
      data.timezone || '',
      data.place || '',
      data.location ? data.location.lat : '',
      data.location ? data.location.lng : '',
      data.location ? data.location.accuracy : '',
      data.target || '',
      (data.teams && data.teams[0] && data.teams[0].name) || '',
      (data.teams && data.teams[0] && data.teams[0].score) || 0,
      (data.teams && data.teams[1] && data.teams[1].name) || '',
      (data.teams && data.teams[1] && data.teams[1].score) || 0,
      data.winner || '',
      (data.rounds && data.rounds.length) || 0,
      JSON.stringify(data.rounds || []),
    ];

    sheet.appendRow(row);

    return json_({ ok: true, row: sheet.getLastRow() });
  } catch (err) {
    return json_({ ok: false, error: String(err) }, 400);
  }
}

function doGet() {
  // Enkel hälsokontroll — öppna URL:en i webbläsaren för att verifiera deploy
  return json_({
    ok: true,
    service: 'Boule webhook',
    usage: 'POST JSON från Boule-appen till denna URL',
  });
}

function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
```

---

## Steg 4 — Spara och deploya som Web App

1. Klicka **spara-ikonen** (eller `Ctrl/Cmd+S`), döp projektet till **Boule webhook**
2. Klicka **Deploy → New deployment** (uppe till höger)
3. Klicka kugghjulet bredvid "Select type" → välj **Web app**
4. Fyll i:
   - **Description:** Boule webhook v1
   - **Execute as:** Me (din Google-adress)
   - **Who has access:** **Anyone** _(viktigt — annars kan appen inte posta)_
5. Klicka **Deploy**
6. Första gången måste du **godkänna behörigheter**:
   - Klicka "Authorize access"
   - Välj ditt Google-konto
   - "Advanced" → "Go to Boule webhook (unsafe)" → "Allow"
     _(det är ditt eget skript, "unsafe" betyder bara att Google inte har granskat det)_
7. Kopiera **Web app URL** — den ser ut som:
   ```
   https://script.google.com/macros/s/AKfyc.../exec
   ```

---

## Steg 5 — Koppla Boule-appen

1. Öppna Boule-appen, klicka **kugghjulet** (inställningar)
2. **Metod:** Egen webhook-URL
3. **Webhook-URL:** klistra in URL:en från steg 4
4. Sätt gärna en **Standardplats** som fallback om GPS inte går
5. Bocka i **Använd telefonens plats** om du vill ha GPS-koordinater
6. **Spara**

---

## Testa

1. Spela en snabb match i appen → mål 11 för att gå snabbt
2. När match är slut: klicka **Spara match**
3. Öppna Google Sheet — en ny rad ska dyka upp med all data
4. Toast i appen: _"Sparad till webhook: skickat (opaque)"_ är normalt — det betyder att CORS-fallback användes. Datan kommer fram ändå.

---

## Om du uppdaterar skriptet senare

Apps Script har en gotcha: varje `New deployment` ger en **ny URL**. För att behålla samma URL när du ändrar koden:

1. **Deploy → Manage deployments**
2. Klicka pennan på den befintliga deployen
3. **Version:** New version
4. **Deploy**

---

## Felsök

| Symptom                                      | Lösning                                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| "Fjärrsparning misslyckades: HTTP 401"       | Webhooken är inte satt till "Anyone" access. Gör om steg 4 punkt 4.                                                               |
| Raden dyker inte upp trots "OK"              | Kolla att du är i rätt Sheet. Skriptet skriver till det ark det skapades i. Titta också efter ett ark som heter **Matcher**.      |
| CORS-fel i browserkonsolen                   | Normalt — appen faller tillbaka till `no-cors` automatiskt. Raden skrivs ändå. Om du vill slippa varningen, hör av dig.           |
| Ingen GPS                                    | Kräver HTTPS + att du godkänt platstillstånd. Fungerar på live-URLen men inte alltid i förhandsgranskningsrutan.                  |
| Matchen sparades men `location` är tom       | GPS-timeout (6 s) eller tillstånd nekades. Standardplats-fältet används som backup textetikett.                                    |

---

## Bonus: pivot-analys i samma Sheet

När du har några matcher kan du snabbt bygga en översikt:

1. Skapa ett nytt ark **Sammanfattning**
2. I A1, klistra in:
   ```
   =QUERY(Matcher!A:P, "SELECT N, COUNT(A) WHERE N IS NOT NULL GROUP BY N LABEL COUNT(A) 'Vinster'", 1)
   ```
   (kolumn N = "Vinnare")

Det ger en tabell över hur många matcher varje lag har vunnit.
