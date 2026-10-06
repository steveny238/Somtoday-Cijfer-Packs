# Somtoday Cijfer Onthuller

Een Chrome/Edge-extensie (Manifest V3) die herkende cijfers op Somtoday verbergt achter een knop **Onthul cijfer**. Na een klik kies je uit zeven onthullingen. Bij elke onthulling gaat het cijfer eerst langs verschillende getallen en stopt het daarna op het echte cijfer.

1. **Lootbox**: een gamekist zweeft in beeld. Klik erop, hij schudt steeds harder, het slot en de naad gloeien en de kist knalt open met vonken en een lichtstraal. Daarna schuift een rol met kaartjes langs een markering (zoals bij het openen van kisten in games). De cijfers vliegen voorbij, de rol vertraagt en stopt op het echte cijfer, dat dan zijn kleur krijgt (brons, zilver, goud of speciaal).
2. **Casino reveal**: een casinoautomaat met drie rollen die na elkaar stoppen.
3. **Rad van fortuin**: een rad met cijfers draait en vertraagt tot de pijl het echte cijfer aanwijst.
4. **Kraskaart**: kras het vak open met je muis of vinger (of kies *Automatisch krassen*). Onder het laagje wisselen de cijfers; als genoeg is vrijgekrast komt het cijfer tot rust.
5. **Dobbelstenen**: elke dobbelsteen toont één teken van je cijfer, tuimelt langs andere tekens en landt op het juiste.
6. **Walkout**: je loopt door een neon-spelerstunnel. Ringen vliegen langs je heen terwijl de gegevens van de toets op je afkomen en voorbijvliegen (vak, omschrijving, weging, datum, periode, ...). Aan het eind van de tunnel gaat het stadionlicht open en valt een speelkaart in beeld. Op de kaart schieten de cijfers door elkaar, ook los om de kaart heen, tot ze stoppen op het echte cijfer. De kaart toont de toetsgegevens als "stats" en krijgt bij het landen een kleur op basis van je cijfer.
7. **Plinko**: klik op *Laat de bal vallen*. De bal stuitert van pin naar pin door een Plinko-bord. De cijfers in de vakjes onderin wisselen door elkaar en onder het bord zie je het cijfer in het vakje waar de bal boven hangt. De bal belandt in het vakje met je echte cijfer, dat dan zijn kleur krijgt.

De animaties kiezen of wijzigen het cijfer nooit: het wordt rechtstreeks uit de pagina gelezen. Alleen de tussencijfers zijn decoratie, en die zijn nooit gelijk aan je echte cijfer.

## Installeren (Chrome en Edge)

1. Pak de ZIP uit naar een vaste map, bijvoorbeeld `Documenten\somtoday-cijfer-onthuller`. Verwijder die map later niet, anders stopt de extensie.
2. Open de extensiepagina:
   - Chrome: ga naar `chrome://extensions`
   - Edge: ga naar `edge://extensions`
3. Zet **Ontwikkelaarsmodus** (Developer mode) aan.
4. Klik op **Niet-gepakt laden** (in sommige versies: *Uitgepakte extensie laden*, Engels: *Load unpacked*).
5. Kies de map die `manifest.json` bevat.
6. Open Somtoday en ververs de pagina (F5).

Updaten: vervang de bestanden in de map en klik op de extensiepagina op het vernieuw-icoon bij de extensie.

## Bestanden

| Bestand | Inhoud |
| --- | --- |
| `manifest.json` | Manifest V3, alleen `*.somtoday.nl`, geen extra permissies |
| `content.js` | Herkenning, verbergen, popup en beide animaties |
| `styles.css` | Knop, popup, walkout, kaart, casinoautomaat, rad, kraskaart, dobbelstenen, lootbox en plinko |
| `README.md` | Deze uitleg |

## Hoe werkt het

**Herkennen.** De extensie zoekt:
- tabellen en ARIA-grids met een kolomkop die `cijfer`, `resultaat` of `beoordeling` bevat (kolommen met `weging`, `gewicht`, `aantal` of `datum` in de kop worden overgeslagen);
- elementen met `data-grade`, `data-cijfer`, `data-resultaat`, of een `class`, `aria-label` of `data-testid` met `cijfer` of `grade`, waarvan de tekst alleen een cijfer is.

Een waarde telt alleen als cijfer als het een getal van 1 t/m 10 is, met maximaal twee decimalen (komma of punt), bijvoorbeeld `7`, `7,5` of `10`.

**Verbergen zonder de pagina te wijzigen.** De tekst van het cijfer wordt nooit vervangen of gewist. Het element krijgt alleen het attribuut `data-sdr="hidden"`; CSS verbergt het visueel en er wordt tijdelijk een knop aan toegevoegd. Na de onthulling wordt alleen die knop verwijderd en wordt het attribuut `data-sdr="done"`.

**Werkt met React en herrenderen.** Een `MutationObserver` houdt de pagina bij. Wordt een knop door een update weggehaald, dan komt hij terug zolang het cijfer nog niet onthuld is. Een onthuld cijfer komt niet terug achter een knop, ook niet als de pagina het element opnieuw opbouwt: het wordt herkend aan het element zelf of aan de rijtekst plus het cijfer. Dit staat alleen in het werkgeheugen van de pagina en verdwijnt bij herladen.

**Opruimen.** Sluiten (kruisje, Esc, klik naast het venster of Sluiten) stopt alle timers en verwijdert de popup, animaties en confetti. Sluit je tijdens de animatie, dan blijft het cijfer verborgen en de knop staan.

**Minder beweging.** Met `prefers-reduced-motion: reduce` (bijvoorbeeld als Windows-animaties uitstaan) vervallen schudden, lichtstralen, vloeiend scrollen en confetti. Het cijfer rolt of springt dan nog steeds langs verschillende getallen voordat het stopt.

## Privacy

Alles gebeurt lokaal in je browser. De extensie verstuurt niets, gebruikt geen server, geen `storage` en geen externe bestanden of afbeeldingen. De walkout, de kaart, het rad en de automaat zijn volledig met CSS en eigen inline-SVG getekend, zonder logo's of game-assets. De stijl is geïnspireerd op voetbalgames, maar is niet van een bestaand spel overgenomen.

## Toetsgegevens in de walkout

De gegevens komen uit de rij (of het lijstitem) waar het cijfer staat. Bij een tabel worden de kolomkoppen gebruikt om de waarden te benoemen (`Vak`, `Omschrijving`, `Weging`, `Datum`, `Periode`, `Docent`, `Type`). Andere cijfers of cijferkolommen worden bewust niet getoond, zodat er niets verklapt wordt. Lukt het uitlezen niet, dan toont de walkout een algemene tekst en blijft de kaart werken. Alles blijft lokaal in je browser.

## Beperkingen

- Cijfers in een **Shadow DOM** of in een **iframe** worden niet herkend.
- Ziet de extensie een cijfer niet, dan blijft dat gewoon zichtbaar. Zie "Problemen oplossen" om de herkenning uit te breiden.
- Een schermlezer kan een verborgen cijfer nog voorlezen, want de tekst blijft bewust in de pagina staan.
- Twee identieke rijen (zelfde tekst en cijfer) tellen als één cijfer als de pagina ze opnieuw opbouwt.
- Heeft een cijfercel een vaste, smalle breedte, dan wordt die tijdelijk ruimer gemaakt zodat de knop past.

## Problemen oplossen

- **Er verschijnt geen knop:** ververs de pagina en controleer of de extensie aan staat. Staat het cijfer in een kolom met een andere kop dan hierboven, dan moet `HEADER_RE` bovenin `content.js` worden uitgebreid.
- **Verkeerde plek verborgen:** voeg de kolomkop toe aan `HEADER_EXCLUDE_RE`, of zet `data-sdr-ignore` op het element.
- **Handmatig testen:** open DevTools en controleer dat het cijfer zelf nog in de DOM staat; alleen het attribuut `data-sdr` en een `span.sdr-wrap` zijn toegevoegd.
