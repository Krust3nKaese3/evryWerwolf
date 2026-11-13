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
2. **Rollen.** Ein Vorschlag hängt von der Spielerzahl ab und lässt sich ändern. Die Summe muss die Spielerzahl treffen. Danach werden die Rollen zufällig verteilt.
3. **Aufdecken.** Das Handy geht reihum. Zuerst steht nur der Name, nach dem Tippen die eigene Rolle, dann wird sie verdeckt.
4. **Tag 1** beginnt vor der ersten Nacht. Der Bürgermeister ist die erste Person der Sitzordnung. Diskussion, optional ein Duell, dann geheime Abstimmung.
5. **Nacht.** Zwei Runden, jedes Mal alle Lebenden in Sitzordnung, auch Dorfbewohner. Vor jedem Blick ein Übergabeschirm ohne Inhalt der vorherigen Person.
6. **Morgen.** Die App sagt, wer gestorben ist und wen die Schaufel zurückgeholt hat. Danach der nächste Tag.
7. **Ende.** Alle Rollen liegen offen. Das Home-Symbol öffnet die Lobby, die Namen bleiben stehen.

Ein laufendes Spiel, inklusive Bildschirm und wer gerade dran ist, wird bei jeder Aktion gespeichert. Nach einem Absturz landet der nächste Start wieder an derselben Stelle.

## Rollen

Anzeigenamen stehen nur in `ROLE_NAMES` in `game.js`.

| Rolle | Lager | Fähigkeit |
| --- | --- | --- |
| Werwolf | Wölfe | Nachts wählt das Rudel gemeinsam ein Haus. |
| Dorfbewohner | Dorf | Keine. Sieht nachts denselben Schlafscreen wie jemand ohne Aktion. |
| Hexe | Dorf | Ein Heiltrank und ein Gifttrank für das ganze Spiel. Sie erfährt das Opferhaus der Wölfe, bevor sie sich entscheidet. |
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

Die bestohlene Person erfährt es auf ihrem nächsten eigenen privaten Zug: noch in derselben Nacht, wenn sie in der Runde nach dem Waschbär kommt, sonst in der nächsten Nacht. Steht in dieser Nacht noch ihre alte Aktion an, darf sie die noch ausführen. Andere sehen keinen Extra-Screen, an dem man den Diebstahl erkennen könnte.

Ist in dem Haus niemand (die Nutte ist nachts nie daheim), passiert nichts und der eine Einsatz bleibt erhalten.

### Nachahmerin

Sie sucht eine lebende **Person** als Vorlage (Personen-Symbol) und muss die Kopie sofort spielen:

- Werwolf: ein zusätzliches Haus töten
- Jäger: nachts ein Haus erschießen
- Seherin: eine Person ansehen
- Hexe: Heil- und Gifttrank, beide frisch, in Runde 2
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

Der Heiltrank hebt **Werwolf-Angriffe** auf dieses Haus auf, Rudel und kopierten Werwolf, und rettet damit alle darin. Gift und ein nächtlicher Schuss bleiben. Die Hexe erfährt die angegriffenen Häuser, nicht wer darin schläft, und kann das eigene Haus heilen. Vergiften kann sie ein anderes Haus.

Amor und die Seherin treffen Personen, auch die Nutte. Der Waschbär trifft das Haus. Ist die Besitzerin nicht daheim, gelingt der Diebstahl nicht.

## Nachtordnung

Runde 1, Sitzordnung, nur Lebende. Jede Person sieht nur den eigenen Screen, davor die Übergabe.

1. Nutte wählt ein Haus, falls sie es ist.
2. Nachahmerin darf kopieren und, außer bei der Hexe, sofort handeln.
3. Waschbär darf stehlen oder überspringen.
4. Seherin sieht eine Person.
5. Amor verbindet in Nacht 1 zwei Personen.
6. Werwölfe wählen ein Haus und sehen die anderen Wölfe samt bisheriger Wahl.
7. Schaufel darf eine tote Person wählen oder überspringen.
8. Alle anderen, auch die Hexe, schlafen nur.

Danach steht das Opferhaus fest: die meisten Stimmen. Bei Gleichstand das Haus mit dem kleinsten Abstand im Uhrzeigersinn vom Bürgermeister, sein eigenes Haus zählt als Abstand 0.

Runde 2, wieder alle Lebenden: Hexe und eine Hexe-Kopie setzen Heilung und Gift. Wer neue Liebe noch nicht gesehen hat, sieht Partner und Rollen. Alle anderen schlafen, damit die Hexe nicht an der Übergabe zu erkennen ist. Ohne Werwolf-Angriff kann der Heiltrank nicht gelegt werden und bleibt liegen.

Auflösung, in dieser Reihenfolge:

1. Werwolf-Angriffe auf geheilte Häuser verpuffen. Sonst sterben alle im Haus.
2. Gift und nächtliche Schüsse töten alle im Haus. Heilung stoppt sie nicht. Leere Häuser tun nichts.
3. Liebesketten sterben mit. Liebe endet damit.
4. Jäger, die diese Nacht gestorben sind, schießen der Reihe nach auf Personen.
5. Die Schaufel macht ihre Toten wieder lebendig.
6. Das Bürgermeisteramt wandert einen lebenden Sitz im Uhrzeigersinn.
7. Sieg prüfen.
8. Morgenansage.

## Liebe

Amor und eine Amor-Kopie verbinden je zwei lebende Personen. Zwei getrennte Paare bleiben zwei Paare: A–B und C–D sterben und gewinnen nicht gemeinsam. Eine Kette entsteht nur, wenn jemand doppelt verbunden ist: A–B und B–C werden A–B–C.

Stirbt eine Person der Kette, sterben alle verbundenen mit. Jede lebende Person der Gruppe erfährt auf dem nächsten privaten Screen alle Partner und deren Rollen.

Eine Gruppe gewinnt, wenn **genau ihre Mitglieder** noch leben und es mindestens zwei sind. Das gilt für ein gemischtes Paar, eine reine Dorfgruppe und eine reine Wolfsgruppe. Ein einzelnes anderes Paar, das noch lebt, verhindert den Liebessieg. Der Liebessieg wird vor Dorf und Wölfen geprüft.

Der Waschbär übernimmt keine Liebe. Mit dem Tod ist das Band weg, auch nach einer Wiederbelebung.

## Bürgermeister

An Tag 1 ist es die erste eingegebene Person. Die Stimme zählt **1,5**. Ein Werwolf darf das Amt haben. Auf den öffentlichen Schirmen steht der Name.

Zwei Weitergaben:

- Stirbt der Bürgermeister, geht das Amt sofort an den nächsten lebenden Sitz im Uhrzeigersinn.
- Am Ende **jeder** Nacht wandert es danach noch einmal einen lebenden Sitz weiter, Tote werden übersprungen. Zurückgeholte Personen zählen dabei wieder mit.

Beispiel: A ist Bürgermeister, Sitze A B C D. Stirbt A in der Nacht, wird zuerst B Bürgermeister und durch die nächtliche Drehung danach C. Überlebt A, wird nur B Bürgermeister. Stirbt B und die Schaufel holt B zurück, bevor das Amt dreht, kann B die Drehung wieder abbekommen. Die Todes-Weitergabe passiert noch vor der Wiederbelebung.

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

- Tag 1 liegt **vor** Nacht 1, damit die erste Person an Tag 1 wirklich Bürgermeister ist und das Amt erst danach jede Nacht wandert.
- Stirbt der Bürgermeister in einer Nacht, wandert das Amt zweimal: einmal wegen des Todes, einmal wegen der Nacht.
- Wolfs-Gleichstand: im Uhrzeigersinn ab dem Bürgermeister, Abstand 0 ist er selbst.
- Abstimmungs-Gleichstand: niemand stirbt. Zusätzlich gibt es die Stimme „Niemand“.
- Heiltrank stoppt nur Werwolf-Angriffe, nicht Gift und nicht den nächtlichen Schuss.
- Die Hexe sieht das Haus, nicht die Gäste.
- Ein echter Waschbär verliert seinen Einsatz nicht, wenn das Haus leer ist. Die Kopie der Nachahmerin hat den Einsatz dann schon verbraucht, kann aber ein anderes Haus versuchen. Gibt es gar kein bewohntes Haus, verpufft die Kopie.
- Kopierte Nachahmerin: nur eine weitere Vorlage, dann Schluss.
- Liebessieg für jede zusammenhängende Gruppe, die allein übrig ist, nicht nur für ein gemischtes Paar. Reine Wölfe als Paar gewinnen als Liebespaar, nicht als Rudel.
- Politiker in so einer Gruppe: es gewinnt die Gruppe, nicht er allein. Sein Alleinsieg ist nur die Wahl.
- Mindestgröße 4. Im Vorschlag kommen die Sonderrollen schrittweise dazu, immer mit mindestens einem Dorfbewohner und ohne Sofort-Sieg der Wölfe.
