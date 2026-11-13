# Werwolf

Die Werwölfe von Düsterwald **ohne Erzähler**, auf **einem** Handy im Hochformat. Die Runde gibt das Handy weiter. Beliebig viele Mitspieler ab 4.

## In EveryApp hinzufügen

EveryApp lädt diese Mini-App vom öffentlichen Branch `main`.

1. EveryApp öffnen und die App hinzufügen.
2. Diese Adresse einfügen:

```
https://github.com/Krust3nKaese3/evryWerwolf
```

Dieselbe Adresse funktioniert als QR-Code im Scanner von EveryApp. Add-Links:

- EveryApp: `everyapp://add?url=https%3A%2F%2Fgithub.com%2FKrust3nKaese3%2FevryWerwolf`
- Dev-Client: `exp+everyapp://add?url=https%3A%2F%2Fgithub.com%2FKrust3nKaese3%2FevryWerwolf`

3. Die Berechtigung **storage** bestätigen. Sie speichert Namen und den laufenden Spielstand. Der `localStorage` der WebView übersteht das vollständige Schließen von EveryApp nicht, `EveryAppBridge.storage` schon.

Nach einem Push die Mini-App in EveryApp mit ⟳ aktualisieren.

## Ablauf

1. **Namen.** Nacheinander, im Uhrzeigersinn. Diese Reihenfolge ist die Sitzordnung und wird sofort gespeichert.
2. **Rollen.** Ein Vorschlag hängt von der Spielerzahl ab und lässt sich ändern. Die Summe muss die Spielerzahl treffen. Heiltränke der Hexe: 1 bis 8, Standard 2. Nachahmungen: 1 bis 5, Standard 1. Danach werden die Rollen zufällig verteilt.
3. **Aufdecken.** Alle Namen stehen in einer Liste. Jede Person tippt den eigenen Namen. Danach ist der Name grau, bleibt aber antippbar, solange das Spiel noch nicht gestartet ist. **Spiel starten** beginnt Nacht 1.
4. **Nacht 1** kommt vor Tag 1. Der Bürgermeister ist die erste Person der Sitzordnung und bleibt das an Tag 1, außer er stirbt.
5. **Nacht.** Alle lebenden Namen stehen in einer Liste, ohne vorgegebene Reihenfolge. Die Person tippt den eigenen Namen, dann **Go**, dann die Fähigkeit oder **Ich will gar nichts machen**. Danach ist der Name grau und diese Nacht nicht mehr antippbar. Wer keine Fähigkeit hat, sieht denselben Ablauf. Sind alle grau, löst die Nacht auf.
6. **Morgen.** Die App sagt, wer gestorben ist und wen die Schaufel zurückgeholt hat. Danach Tag 1, dann Nacht 2, und so weiter.
7. **Ende.** Alle Rollen liegen offen. Das Home-Symbol öffnet die Lobby, die Namen bleiben stehen.

Ein laufendes Spiel, inklusive Bildschirm und wer gerade dran ist, wird bei jeder Aktion gespeichert. Nach einem Absturz landet der nächste Start wieder an derselben Stelle.

## Rollen

Anzeigenamen stehen nur in `ROLE_NAMES` in `game.js`.

| Rolle | Lager | Fähigkeit |
| --- | --- | --- |
| Werwolf | Wölfe | Nachts wählt das Rudel gemeinsam ein Haus. |
| Dorfbewohner | Dorf | Keine. Tippt nachts den eigenen Namen und dann „Ich will gar nichts machen“. |
| Hexe | Dorf | Heiltränke für das ganze Spiel, Anzahl in der Einrichtung (1 bis 8, Standard 2), plus ein Gifttrank. Sie sieht das Opfer nicht. |
| Seherin | Dorf | Sieht nachts die Rolle einer **Person**. |
| Amor | Dorf | Nur in Nacht 1, verbindet zwei **Personen**. |
| Jäger | Dorf | Schießt, wenn er stirbt, auf eine **Person**. |
| Waschbär | Dorf, bis er stiehlt | Einmal optional die Rolle aus einem bewohnten **Haus** stehlen. |
| Nachahmerin | Dorf | Begrenzt oft die Fähigkeit einer anderen Person frisch nachahmen und sofort einsetzen. Anzahl in der Einrichtung, Standard 1, höchstens 5. |
| Nutte | Dorf | Jede Nacht Pflicht: in einem anderen **Haus** schlafen. |
| Russe | Dorf | Einmal am Tag ein Duell. Keine Nachtaktion. |
| Politiker | eigenes Lager | Keine Fähigkeit. Gewinnt nur, wenn die Tagesabstimmung ihn wählt. |
| Schaufel | Dorf | Einmal optional eine tote **Person** zurückholen. |

Mehr als eine Karte derselben Rolle ist erlaubt, solange die Prüfung unten passt. Sonderrollen sind im Vorschlag meist 0 oder 1.

### Waschbär

Die Aktion kann übersprungen werden, der Screen bietet das ausdrücklich an. Klappt der Diebstahl, bekommt er diese Rolle ab der **nächsten** Nacht, voll aufgeladen (eine bestohlene Hexe hat neue Tränke, auch wenn die alte sie verbraucht hat). Die bestohlene Person wird Dorfbewohner. Ein bestohlener Werwolf wechselt das Lager, der Beraubte ist Dorf. Ein bestohlener Amor hat danach keine Aktion mehr, weil Amor nur in Nacht 1 handelt. Liebe bleibt bei der bestohlenen Person. Das Bürgermeisteramt wandert davon nicht.

Die bestohlene Person erfährt es auf ihrem nächsten eigenen privaten Zug: noch in derselben Nacht, wenn sie ihren Namen noch nicht abgehakt hat, sonst in der nächsten Nacht. Steht in dieser Nacht noch ihre alte Aktion an, darf sie die noch ausführen. Andere sehen keinen Extra-Screen, an dem man den Diebstahl erkennen könnte.

Ist in dem Haus niemand (die Nutte ist nachts nie daheim), passiert nichts und der eine Einsatz bleibt erhalten.

### Nachahmerin

Sie sucht eine lebende **Person** als Vorlage (Personen-Symbol) und muss die Kopie sofort spielen:

- Werwolf: ein zusätzliches Haus töten
- Jäger: nachts ein Haus erschießen
- Seherin: eine Person ansehen
- Hexe: die eingestellte Zahl Heiltränke, frisch, plus ein Gifttrank, sofort in dieser Nacht und ohne das Opfer zu sehen
- Amor: ein weiteres Paar, auch nach Nacht 1
- Waschbär: muss stehlen, mit den normalen Folgen ab der nächsten Nacht
- Nutte: schläft in dieser Nacht ebenfalls außer Haus
- Schaufel: muss eine tote Person wählen, falls jemand tot ist

Dorfbewohner, Russe und Politiker haben nichts Nutzbares: der Einsatz ist verbraucht und verpufft. Eine kopierte Nachahmerin erlaubt genau eine weitere Vorlage, nicht eine endlose Kette. Die Kopie ist unabhängig davon, was das Original schon verbraucht hat.

### Nutte

Sie ist **jede Nacht** nicht zu Hause, schon bevor sie gewählt hat, und auch wenn jemand ihr Haus früher in der Runde anschaut. Sie muss ein anderes lebendes Haus wählen und darf in der nächsten Nacht wieder dieselbe Person als Gastgeber wählen. Folgen stehen im Abschnitt Häuser.

### Russe

Auf dem Tag-Screen gibt es immer den Knopf **Duell**, damit niemand an der Anzeige erkennt, wer der Russe ist. Die App fragt nach dem eigenen Namen. Stimmt er nicht, ist die Person tot oder war das Duell schon weg, steht dort nur „Nichts passiert.“

Er selbst schießt zuerst, danach die 1 bis 5 herausgeforderten Personen in der **von ihm gewählten Reihenfolge**, dann wieder von vorn. Eine Kugel in sechs Kammern, keine neue Drehung. Jeder Zug ist ein Tipp mit Übergabe. Wer die Kugel bekommt, stirbt mit den normalen Folgen. Danach geht der Tag weiter (Diskussion und Abstimmung). Der Einsatz ist verbraucht, sobald die Herausforderer bestätigt sind. Vorher kann er zurück.

### Politiker

Stirbt er durch die Abstimmung, endet das Spiel sofort und **er allein** gewinnt. Liebeskummer und ein Jägerschuss werden dann nicht mehr ausgespielt. Jeder andere Tod (Nacht, Gift, Jäger, Duell, Liebe) ist nur eine Niederlage für ihn, das Spiel geht weiter.

### Schaufel

Einmal pro Spiel, nachts, optional, Ziel ist eine tote Person (Personen-Symbol; Tote haben kein Haus im Spiel). Die Person kommt zur **nächsten Morgenansage** zurück, mit derselben Rolle und demselben Kräftezustand (verbrauchte Tränke bleiben verbraucht). Liebe endet mit dem Tod und kommt nicht zurück. Sie sitzt wieder in der Runde, ist nachts dran und zählt wieder für das Amt. Die Wiederbelebung gilt auch, wenn die Schaufel in derselben Nacht noch stirbt. Gewertet wird erst nach der Rückkehr, eine zurückgeholte Person kann den Sieg also noch drehen. Auch ein Werwolf kann zurückgeholt werden.

## Häuser und Personen

Nachts zielen Fähigkeiten auf **Häuser** (Haus-Symbol vor dem Namen). Tagsüber auf **Personen** (Personen-Symbol).

Ausnahmen, auch als Kopie der Nachahmerin: **Seherin** und **Amor** zielen nachts auf Personen. Die Seherin kann die Nutte direkt ansehen. Amor kann die Nutte verbinden. Die **Schaufel** zielt auf tote Personen. Der **Russe** und die **Abstimmung** auch. Der **Jäger**, der nachts stirbt, schießt in der Morgenauflösung auf eine Person, nicht auf ein Haus. Ein von der Nachahmerin kopierter Jägerschuss in der Nacht bleibt ein Haus.

Ein nächtlicher Treffer auf ein Haus erwischt alle, die gerade darin sind: die Besitzerin, wenn sie daheim ist, plus jede Nutte (oder nachgeahmte Nutte), die dort schläft. Die echte Nutte ist nie daheim. Ein Treffer auf ihr eigenes Haus tut ihr nichts. Ein Treffer auf das Haus, in dem sie schläft, tötet sie und den Gastgeber, falls der daheim ist.

Ein Heiltrank schützt ein Haus für **diese Nacht** vor jedem Tod darin: Werwolf-Angriff, kopierter Werwolf, Gift und nächtlicher Schuss. Alle, die in dem Haus sind, bleiben am Leben. Das eigene Haus darf sie heilen, vergiften darf sie es nicht. Sie erfährt nicht, welches Haus angegriffen wird, und legt den Trank blind. Mehrere Tränke in derselben Nacht sind erlaubt, jeder auf ein anderes Haus. Übrige Tränke bleiben für spätere Nächte. Die Nacht wird erst aufgelöst, wenn alle lebenden Personen fertig sind, deshalb ist die Reihenfolge egal.

Amor und die Seherin treffen Personen, auch die Nutte. Der Waschbär trifft das Haus. Ist die Besitzerin nicht daheim, gelingt der Diebstahl nicht.

## Nacht

Alle Lebenden stehen in einer Liste. Die Person tippt den eigenen Namen und **Go**. Danach nur der eigene Screen: Fähigkeit, oder **Ich will gar nichts machen**. Die Nutte muss ein Haus wählen. Wer fertig ist, ist grau und nicht mehr antippbar. Liebe und ein Diebstahlshinweis erscheinen auf diesem privaten Screen, wenn sie fällig sind.

Die Hexe darf in diesem Zug so viele Heiltränke legen, wie sie noch hat, jedes Haus einmal, und danach den Gifttrank. Beides kann sie lassen. Eine nachgeahmte Hexe bekommt die eingestellte Zahl Heiltränke frisch für diese Nacht, plus einen Gifttrank.

Sind alle Namen grau, steht das Wolfsopfer fest: die meisten Stimmen. Bei Gleichstand das Haus mit dem kleinsten Abstand im Uhrzeigersinn vom Bürgermeister, sein eigenes Haus zählt als Abstand 0. Wölfe, die nichts tun, geben keine Stimme ab.

Auflösung, in dieser Reihenfolge:

1. Jeder Tod in einem geheilten Haus verpufft, egal ob Wölfe, Gift oder nächtlicher Schuss. Sonst sterben alle im Haus. Leere Häuser tun nichts.
2. Liebesketten sterben mit. Liebe endet damit.
3. Jäger, die diese Nacht gestorben sind, schießen der Reihe nach auf Personen.
4. Die Schaufel macht ihre Toten wieder lebendig.
5. Stirbt der Bürgermeister, ist das Amt schon beim Tod weitergegangen. Zusätzlich wandert es am Ende von Nacht 2 und jeder späteren Nacht einen lebenden Sitz im Uhrzeigersinn. Nach Nacht 1 gibt es diese Extra-Drehung nicht.
6. Sieg prüfen.
7. Morgenansage. Nach Nacht 1 ist das Tag 1.

## Liebe

Amor und eine Amor-Kopie verbinden je zwei lebende Personen. Zwei getrennte Paare bleiben zwei Paare: A–B und C–D sterben und gewinnen nicht gemeinsam. Eine Kette entsteht nur, wenn jemand doppelt verbunden ist: A–B und B–C werden A–B–C.

Stirbt eine Person der Kette, sterben alle verbundenen mit. Jede lebende Person der Gruppe erfährt auf dem nächsten privaten Screen alle Partner und deren Rollen.

Eine Gruppe gewinnt, wenn **genau ihre Mitglieder** noch leben und es mindestens zwei sind. Das gilt für ein gemischtes Paar, eine reine Dorfgruppe und eine reine Wolfsgruppe. Ein einzelnes anderes Paar, das noch lebt, verhindert den Liebessieg. Der Liebessieg wird vor Dorf und Wölfen geprüft.

Der Waschbär übernimmt keine Liebe. Mit dem Tod ist das Band weg, auch nach einer Wiederbelebung.

## Bürgermeister

An Tag 1 ist es die erste eingegebene Person. Die Stimme zählt **1,5**. Ein Werwolf darf das Amt haben. Auf den öffentlichen Schirmen steht der Name.

Zwei Weitergaben:

- Stirbt der Bürgermeister, geht das Amt sofort an den nächsten lebenden Sitz im Uhrzeigersinn.
- Am Ende von **Nacht 2** und jeder späteren Nacht wandert es danach noch einmal einen lebenden Sitz weiter, Tote werden übersprungen. Nach Nacht 1 bleibt es liegen, außer der Bürgermeister ist gestorben. Zurückgeholte Personen zählen bei der Drehung wieder mit.

Beispiel ab Nacht 2: A ist Bürgermeister, Sitze A B C D. Stirbt A in der Nacht, wird zuerst B Bürgermeister und durch die nächtliche Drehung danach C. Überlebt A, wird nur B Bürgermeister. In Nacht 1 entfällt die zweite Drehung: stirbt A, ist an Tag 1 nur B Bürgermeister; überlebt A, bleibt A. Stirbt B und die Schaufel holt B zurück, bevor das Amt dreht, kann B die Drehung wieder abbekommen. Die Todes-Weitergabe passiert noch vor der Wiederbelebung.

## Abstimmung und Gleichstand

Geheim, Handy weitergeben, nur Lebende. Wahl einer Person oder **Niemand**. Der Bürgermeister zählt 1,5, alle anderen 1. Wer das höchste Gewicht allein hat, stirbt. Liegt das höchste Gewicht gleichauf, stirbt niemand, auch bei einem Gleichstand mit „Niemand“. Die 1,5 lösen viele Pattstellungen, aber nicht alle: zwei Personen können vor dem Bürgermeister gleichauf liegen.

Die Stimmen selbst bleiben geheim, das Ergebnis zeigt nur die Gewichte.

## Sieg

Geprüft nach der Tagesauflösung und am Morgen nach Schüssen und Wiederbelebung.

1. Wurde der Politiker gewählt, gewinnt er sofort allein.
2. Sonst gewinnt eine Liebesgruppe, die als Einzige noch lebt.
3. Sonst gewinnt das Dorf, wenn kein Werwolf mehr lebt und noch jemand vom Dorf lebt. Ein lebender Politiker hindert das nicht.
4. Sonst gewinnen die Werwölfe, wenn mindestens einer lebt und sie **mindestens so viele** sind wie die lebende Dorfseite. Der Politiker zählt auf keiner der beiden Seiten mit. Ein Werwolf und ein Politiker, ohne Dorf, sind ein Wolfsieg.
5. Lebt niemand mehr, oder nur noch der Politiker, gewinnt niemand.

Start ist nur erlaubt, wenn mindestens ein Werwolf da ist, mindestens eine Person auf der Dorfseite, und die Wölfe weniger sind als die Dorfseite. Der Politiker ist dabei keine Dorfseite. Mindestens 4 Namen, nach oben offen.

## Speicher und Fehlerbericht

Namen liegen unter `werwolf.lobby.v1`, sobald jemand einen Namen hinzufügt, ändert sich die Liste also sofort. Das laufende Spiel liegt unter `werwolf.game.v1`. Home und „Spiel abbrechen“ löschen nur das Spiel, nicht die Namen.

Das Käfer-Symbol sitzt auf jedem Screen, ohne selbst eine Rolle zu verraten. Es öffnet einen Bericht mit Beschreibungsfeld. **Kopieren** legt einen Markdown-Block in die Zwischenablage: Beschreibung, Version, Zeitpunkt, Konfiguration, den kompletten Spielstand und das Aktionsprotokoll (Bildwechsel, Tipps, Nachtaktionen, Auflösung, Fehler mit Stack). Zurück schließt den Bericht und lässt das Spiel, wie es war. Der Text enthält Geheimnisse.

## UX gegenüber der Rohfassung

Die erste spielbare Fassung ist auf Branch `roh` eingefroren (Commit `eefdb97c`, Screenshots unter `roh-screenshots/` auf `roh`). Dieser Branch bleibt unverändert und ist die Vergleichsbasis.

UX-Verbesserungen laufen weiter auf `main`. Später vergleichen wir die Oberfläche mit der Rohfassung, um zu lernen, wie klarere Bedienung von Anfang an aussehen sollte.

Gegenüber `roh`:

- **Nacht.** Keine vorgegebene Reihenfolge und keine zweite Runde. Liste aller Lebenden, eigener Name, **Go**, Fähigkeit oder **Ich will gar nichts machen**. Danach grau und nicht mehr antippbar.
- **Rollen.** Liste aller Namen. Nach dem Ansehen grau, aber weiter antippbar, bis **Spiel starten**.
- **Ablauf.** Nacht 1 direkt nach dem Aufdecken, dann Morgen und Tag 1. Die erste Person ist an Tag 1 Bürgermeister. Die zusätzliche Drehung des Amts beginnt erst am Ende von Nacht 2. Das Duell bleibt am Tag.
- **Hexe.** Sieht das Opfer nicht und legt Heiltränke blind. Die Anzahl ist einstellbar, 1 bis 8, Standard 2, für das ganze Spiel. In einer Nacht darf sie so viele legen, wie sie noch hat, jedes Haus nur einmal. Der Trank hält in dieser Nacht jeden Tod in dem Haus auf. Aufgelöst wird erst, wenn alle gehandelt haben.

## Aufbau

```
evryWerwolf/
├── everyapp.json
├── index.html
├── styles.css
├── app.js
├── game.js
├── test/logic.test.js
└── README.md
```

`node test/logic.test.js` prüft die Spiellogik.

## Festgelegte Regeldetails

Diese Punkte waren so nicht wortwörtlich vorgegeben:

- Nacht 1 liegt **vor** Tag 1. Die erste Person ist an Tag 1 Bürgermeister, weil das Amt nach Nacht 1 nicht zusätzlich wandert.
- Ab Nacht 2 wandert das Amt am Morgen zusätzlich zur Weitergabe beim Tod.
- Wolfs-Gleichstand: im Uhrzeigersinn ab dem Bürgermeister, Abstand 0 ist er selbst.
- Abstimmungs-Gleichstand: niemand stirbt. Zusätzlich gibt es die Stimme „Niemand“.
- Heiltränke: 1 bis 8 pro Spiel, Standard 2, kein Nachtlimit außer der Restzahl. Jeder Trank ein anderes Haus, nur diese Nacht, gegen jeden Tod darin. Die Hexe sieht das Opfer nicht.
- Die Hexe sieht nicht, wer in einem Haus schläft.
- Ein echter Waschbär verliert seinen Einsatz nicht, wenn das Haus leer ist. Die Kopie der Nachahmerin hat den Einsatz dann schon verbraucht, kann aber ein anderes Haus versuchen. Gibt es gar kein bewohntes Haus, verpufft die Kopie.
- Kopierte Nachahmerin: nur eine weitere Vorlage, dann Schluss.
- Liebessieg für jede zusammenhängende Gruppe, die allein übrig ist, nicht nur für ein gemischtes Paar. Reine Wölfe als Paar gewinnen als Liebespaar, nicht als Rudel.
- Politiker in so einer Gruppe: es gewinnt die Gruppe, nicht er allein. Sein Alleinsieg ist nur die Wahl.
- Mindestgröße 4. Im Vorschlag kommen die Sonderrollen schrittweise dazu, immer mit mindestens einem Dorfbewohner und ohne Sofort-Sieg der Wölfe.
