# Boule Score Tracker

En enkel poängräknare för pétanque/boule mellan två lag. PWA — installerbar på telefonen.

## Funktioner

- Två lag med redigerbara namn (default: **Tjejerna** ♀ vs **Killarna** ♂)
- Snabb poängsättning (±1 till +5 per omgång)
- Målpoäng: 11 / 13 / 15 / 21 (13 enligt officiell pétanque)
- Ångra senaste omgång
- Serie över flera matcher med total ställning
- Ljudeffekter (togglebara)
- Ljust och mörkt tema
- Tangentbord: 1–5 = Tjejerna, 6–0 = Killarna, U = ångra

## Permanent lagring

I inställningarna kan du välja att skicka avslutade matcher till:

- **JSONBin.io** — enklast, kräver gratis konto och API-nyckel
- **Google Apps Script webhook** — rad per match i ett Google Sheet, se [`APPS_SCRIPT_SETUP.md`](APPS_SCRIPT_SETUP.md)

### Färdig Google Sheets-mall

Ladda ner [**Boule-matcher-mall.xlsx**](https://github.com/GitGeniusX/boule-scores/raw/main/Boule-matcher-mall.xlsx) — innehåller instruktioner, Apps Script-kod att klistra in, målbladet med rätt kolumner och en sammanfattningsflik med färdiga KPI-formler.

1. Ladda ner filen och lägg den i din Google Drive
2. Högerklicka → **Öppna med › Google Kalkylark** → **Arkiv › Spara som Google Kalkylark**
3. Följ fliken **Instruktioner** i arket

Varje sparad match innehåller tid, tidszon, platsetikett, GPS-koordinater (om tillåtet), lagnamn, slutresultat, vinnare och fullständig omgångshistorik.

## Installera på telefonen

1. Öppna sidan i Safari (iOS) eller Chrome (Android)
2. Dela-ikonen → **Lägg till på hemskärmen**
3. Appen öppnar i fullskärm utan webbläsarchrome och fungerar offline

## Utveckling

Ren HTML/CSS/JS, inga byggsteg. Starta en lokal server:

```bash
python -m http.server 8000
# öppna http://localhost:8000
```

## Licens

MIT
