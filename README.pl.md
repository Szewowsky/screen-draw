# Screen Draw

🇬🇧 [English version](README.md)

**Rysuj po ekranie.** Szybkie, sterowane klawiaturą narzędzie do adnotacji na macOS — do tutoriali, live demo i prezentacji: pisak, kształty, tekst, gasnący wskaźnik laserowy, podświetlenie kursora i spotlight, wszystko ponad tym, co właśnie pokazujesz.

![Adnotacje Screen Draw](docs/assets/hero-annotations.png)

## Po co

Dla prezenterów i twórców tutoriali, którzy chcą wskazać coś *teraz*: jeden globalny skrót i rysujesz po dowolnej aplikacji, łącznie z pełnoekranowymi wideorozmowami. Wszystko jest o jeden klawisz stąd, overlay w spoczynku kosztuje ~0% CPU, a adnotacje nigdy nie lądują tam, skąd nie da się ich cofnąć.

## Funkcje

### Narzędzia rysowania

![Pływający pasek narzędzi](docs/assets/toolbar.png)

| Narzędzie | Klawisz | Uwagi |
|---|---|---|
| Zaznacz i przesuń | `V` | Złap, przeciągnij, przestyluj lub usuń dowolną adnotację |
| Pisak | `P` | Wygładzony odręczny tusz; przytrzymaj `⇧` dla prostej linii |
| Zakreślacz | `H` | Szeroki, półprzezroczysty pas |
| Wskaźnik laserowy | `F` | Świecąca kreska, która chwilę wisi i gaśnie — nie wchodzi do undo/wyczyść |
| Gumka | `E` | Przeciągnij po kreskach, by je usunąć; jedno pociągnięcie = jeden krok undo |
| Tekst | `X` | Klik, piszesz, `Enter` — potem zaznaczasz/przesuwasz/stylujesz jak każdy kształt |
| Linia / Strzałka | `L` / `A` | Przytrzymaj `⇧`, by przyciągać do 45° |
| Prostokąt / Elipsa | `R` / `O` | Przytrzymaj `⇧` dla kwadratu / koła |

Do tego: kolory `1`–`6` + własny picker z ostatnio używanymi, rozmiar pędzla `[` `]`, cofnij/ponów `⌘Z` / `⌘⇧Z`, wyczyść `C`, tryb tablicy `W` (przezroczysty → biała → czarna), tusz sesyjny `G` (czysta karta przy wyjściu), przypięcie adnotacji `S` (zostają na ekranie, kliknięcia przechodzą przez nie), eksport zrzutu z adnotacjami `D` (PNG do `~/Downloads` + schowek), ukrycie paska `T`, pasek niewidoczny w nagraniach `⇧R`. Pełny przewodnik: [docs/features.md](docs/features.md) (EN).

### Efekty prezenterskie

Działają także **poza** trybem rysowania — włączysz z paska, panelu albo ikonki w pasku menu:

- **Podświetlenie kursora** — konfigurowalny pierścień wokół wskaźnika, nie do zgubienia.
- **Spotlight** — przyciemnia wszystko poza miękkim kołem wokół kursora.

### Wiele ekranów

Jeden overlay na każdy wyświetlacz; najedź, by przełączyć. Pasek narzędzi podąża za Tobą — do wyboru: wspólna pozycja + ustawienia narzędzi na wszystkich ekranach albo niezależne per ekran.

### Panel sterowania

<img src="docs/assets/control-panel.png" width="380" alt="Panel sterowania" />

Globalny skrót aktywacji (domyślnie `⌘⇧D`), ustawienia domyślne, zachowanie paska, efekty prezenterskie, uruchamianie przy logowaniu.

## Instalacja

Pobierz `Screen Draw-<wersja>-arm64.dmg` (Apple Silicon), przeciągnij appkę do `/Applications`, a potem — ponieważ build jest niepodpisany — przy pierwszym uruchomieniu:

1. **Prawy klik na appce → Otwórz → Otwórz** (lub na nowszych macOS: Ustawienia systemowe → **Prywatność i ochrona** → „Otwórz mimo to").
2. Zezwól na **Nagrywanie ekranu** i **Dostępność**, gdy system poprosi (potrzebne do rysowania nad innymi aplikacjami i eksportu zrzutów).

> **Skąd wziąć .dmg?** Gotowe buildy to podziękowanie dla członków społeczności i wspierających. Zawsze możesz też zbudować appkę sam ze źródeł (niżej) — ta sama aplikacja, zero ograniczeń.

## Budowanie ze źródeł

Wymagania: macOS (Apple Silicon), Node ≥ 22, npm.

```bash
git clone https://github.com/Szewowsky/screen-draw.git
cd screen-draw
npm ci
npm run dev        # build + uruchomienie
npm run dist       # budowa .dmg do dist/
```

Kontrole: `npm run lint`, `npm run type-check`, `npm test` (Vitest na czystym modelu rysowania — 150+ testów). Historia wydań: [CHANGELOG.md](CHANGELOG.md).

## Budowane z agentami AI

Screen Draw powstaje „spec-first" w workflow agentowym: PRD-y i w pełni wyspecyfikowane issues pisze Claude, implementacja biegnie autonomicznie, a każde wydanie przechodzi bramki lint + type-check + testy. Historię opowiada [lista issues](https://github.com/Szewowsky/screen-draw/issues?q=is%3Aissue) — łącznie ze śledztwami wydajnościowymi, w których proponowane refaktory zostały zmierzone i odrzucone.

## Technologia

Electron 43 · TypeScript · React 19 (z React Compilerem) · Tailwind 4 · Vite 8 · Vitest. Przezroczyste okna overlay zawsze-na-wierzchu (po jednym na ekran), czysty niemutowalny model rysowania z undo/redo, renderowanie z cache'em offscreen i ≤1 przerysowaniem na klatkę, zero pracy w spoczynku.

## Licencja

[MIT](LICENSE) — kod jest darmowy. Jeśli Screen Draw uratuje kiedyś Twoje demo, rozważ wsparcie projektu. 🧡
