# CMS PDF Processor

Wewnętrzne narzędzie automatyzujące proces wydawniczy. Aplikacja konwertuje surowe artykuły z plików PDF (magazyny branżowe) na zoptymalizowany, gotowy do publikacji kod HTML dla systemu CMS, z wykorzystaniem sztucznej inteligencji (Gemini Flash) i precyzyjnych zasad formatowania.

## 🛠️ Stack Technologiczny
* **Frontend:** Next.js 15, React, Tailwind CSS v4, Shadcn/UI (Hostowane na Vercel)
* **Backend:** Python 3.11, FastAPI, pypdf, Google GenAI SDK (Hostowane na Render)

### 📦 Główne zależności (Backend)
Za zarządzanie środowiskiem Pythona odpowiada plik `requirements.txt`. Główne filary aplikacji to:
* **FastAPI & Uvicorn:** Nowoczesny, asynchroniczny framework webowy oraz serwer ASGI, obsługujące szybkie żądania HTTP i upload plików binarnych.
* **Google GenAI:** Oficjalne SDK (`google-genai`) do komunikacji z multimodalnymi modelami LLM.
* **PyPDF:** Lekka biblioteka do operacji na plikach PDF bezpośrednio w pamięci RAM (wirtualne wycinanie pojedynczych stron i buforowanie), co eliminuje konieczność zapisu plików tymczasowych na serwerze.
* **Tenacity:** Implementacja wzorca "Retry" ze strategią wykładniczego opóźnienia, zabezpieczająca komunikację z zewnętrznym API przed błędami typu Rate Limit.
* **Python Multipart:** Moduł niezbędny do poprawnego parsowania przesyłanych plików (`multipart/form-data`) przez frontend.
## 🚀 Uruchomienie lokalne i konfiguracja

Aby uruchomić projekt na własnym komputerze, musisz skonfigurować zmienne środowiskowe i odpalić dwa niezależne serwery.

### 1. Zmienne środowiskowe (.env)
Utwórz plik `.env` w folderze `backend/` i uzupełnij go swoimi kluczami:
``env
GEMINI_API_KEY=twój_klucz_od_google
API_SECRET_TOKEN=twoje_wlasne_haslo_do_zabezpieczenia_aplikacji
2. Uruchomienie Backendu (FastAPI)
Bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
API będzie dostępne pod adresem: http://localhost:8000

3. Uruchomienie Frontendu (Next.js)
Bash
cd frontend
npm install
npm run dev
Aplikacja webowa uruchomi się pod adresem: http://localhost:3000
## ⚙️ Architektura i proces przetwarzania (Krok po kroku)

Aplikacja opiera się na rozproszonej architekturze (Next.js na froncie, FastAPI na backendzie) i wykorzystuje multimodalny model językowy do analizy struktury dokumentów PDF. Proces działania przebiega w 5 głównych etapach:

### 1. Autoryzacja (Security)
Dostęp do narzędzia chroniony jest tokenem API (`X-API-Key`). Frontend waliduje klucz w pamięci sesji przeglądarki (`sessionStorage`), a każda próba odpytania backendu bez autoryzacji kończy się odrzuceniem żądania (HTTP 401 Unauthorized), co chroni przed nieautoryzowanym zużyciem tokenów dostawcy AI.

### 2. Izolacja spisu treści (Optymalizacja kosztów)
Po wgraniu pliku PDF i wskazaniu strony ze spisem treści, backend używa biblioteki `pypdf` do wycięcia wyłącznie tej jednej strony z całego wolumenu. 
* Do API Gemini trafia tylko wyizolowana strona, co drastycznie obniża czas odpowiedzi i koszty operacyjne (zużycie tokenów).
* Model zwraca surowy JSON z tytułami, autorami i stronami startowymi.
* Algorytm w Pythonie automatycznie kalkuluje fizyczne strony końcowe artykułów na podstawie strony startowej następnego tekstu.

### 3. Szerokie okno buforowania (Tolerancja błędów)
Podczas generowania konkretnego artykułu, system **nie** wycina stron PDF w sposób idealnie ścisły. Zamiast tego stosuje bufor korygujący:
* `Start_page - 2` strony.
* `End_page + 15` stron.
Dzięki temu artykuł zawsze znajduje się w wysyłanej paczce, nawet jeśli fizyczna numeracja pliku różni się od numeracji na wydrukach z powodu obecności pełnostronicowych reklam i wklejek.

### 4. Multimodalne kadrowanie i formatowanie (Gemini AI)
Wycinek PDF trafia do modelu LLM (Gemini 3.6 Flash) z rygorystycznym promptem ustawionym na niską temperaturę (`0.1`), co wymusza dokładność i zapobiega halucynacjom.
* AI samodzielnie odnajduje właściwy nagłówek w "brudnym" wycinku i ignoruje okładki, reklamy oraz resztki innych artykułów.
* Aplikowane są żelazne zasady dla konkretnego czasopisma (definiowane w `rules.py`):
  - Ustawianie odpowiednich poziomów nagłówków (np. `<h3>` lub `<h2>`).
  - Zabezpieczanie indeksów górnych (np. zapisywanie `m<sup>2</sup>`, `cm<sup>3</sup>`).
  - Usuwanie artefaktów z procesów OCR (np. błędnych punktorów).
  - Wstawianie pustych akapitów (`<p>&nbsp;</p>`) pełniących rolę wizualnego światła przed śródtytułami.
  - Oznaczanie miejsc po zdjęciach i tabelach specjalnym tagiem informacyjnym.

### 5. Zwrot gotowego kodu do CMS
Wygenerowany i oczyszczony ze znaczników Markdown ciąg HTML trafia z powrotem do interfejsu w Next.js. Redaktor za pomocą jednego kliknięcia kopiuje gotowy kod do schowka i wkleja bezpośrednio do edytora w systemie CMS, pomijając etap żmudnego, ręcznego przepisywania i formatowania.


## 🐍 Dokumentacja kodu: `backend/main.py`

Główny plik aplikacji serwerowej oparty na frameworku FastAPI. Odpowiada za odbieranie plików PDF, operacje na dokumentach w pamięci RAM oraz komunikację z modelem Google Gemini.

### 1. Inicjalizacja i konfiguracja środowiska
```python
import os, io, json
from fastapi import FastAPI, File, ...
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader, PdfWriter
from google import genai
from tenacity import retry, wait_exponential, stop_after_attempt
from dotenv import load_dotenv

load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
app = FastAPI(title="CMS PDF Processor API")

```

* **Biblioteki:** Importujemy narzędzia FastAPI do tworzenia endpointów, `pypdf` do cięcia PDF-ów oraz oficjalne SDK `google.genai`. Biblioteka `io` jest kluczowa – pozwala trzymać ucięte pliki PDF w pamięci RAM (`BytesIO`), dzięki czemu aplikacja nie musi zapisywać tymczasowych plików na dysku serwera.
* **CORS:** Middleware `CORSMiddleware` jest skonfigurowany tak, aby przepuszczać żądania wyłącznie ze zdefiniowanych adresów (lokalnego `localhost:3000` oraz produkcyjnego z Vercela), co blokuje nieautoryzowany ruch z innych domen.

### 2. Silnik komunikacji z AI (Zabezpieczenie przed limitami)

```python
@retry(wait=wait_exponential(multiplier=2, min=4, max=60), stop=stop_after_attempt(3))
def call_gemini_with_retry(model_name, contents, config=None):
    # ...

```

Dekorator `@retry` (z biblioteki Tenacity) to mechanizm ochronny. Jeśli API Google zwróci błąd (np. HTTP 429 - przekroczono limit zapytań), skrypt nie rzuca błędem do użytkownika. Zamiast tego czeka kilka sekund (czas rośnie wykładniczo) i automatycznie ponawia próbę. Maksymalnie wykonuje 3 próby, co gwarantuje stabilność przy masowym generowaniu artykułów.

### 3. Endpoint: Analiza spisu treści (`/api/extract-toc`)

Endpoint przyjmuje cały plik PDF oraz numer fizycznej strony spisu treści, a następnie:

1. **Wycinanie strony:** Wczytuje PDF do pamięci, izoluje tylko wskazaną stronę (`writer.add_page(reader.pages[toc_page_index])`) i tworzy z niej nowy, jednokartkowy plik PDF. Zapobiega to wysyłaniu setek stron do AI, co zjadłoby limity.
2. **Promptowanie:** Zleca modelowi Gemini wyciągnięcie danych (dział, tytuł, autor, strona startowa) i wymusza zwrot w formacie surowego JSON-a.
3. **Oczyszczanie danych:** Bloki `clean_text.startswith("```json")` usuwają niepotrzebne znaczniki formatowania Markdown, które modele językowe często samowolnie dodają.
4. **Kalkulacja stron:**
```python
for i in range(len(articles) - 1):
    calculated_end = articles[i+1]["start_page"] - 1
    articles[i]["end_page"] = max(articles[i]["start_page"], calculated_end)

```


Pętla sortuje artykuły i matematycznie wylicza, gdzie kończy się dany tekst, zakładając, że kończy się on stronę przed rozpoczęciem kolejnego artykułu.

### 4. Endpoint: Generowanie kodu HTML (`/api/process-article`)

Endpoint właściwy, który konwertuje tekst na kod.

1. **Szerokie Okno (Buforowanie):**
```python
physical_start = max(0, start_page - 1 - 2)
physical_end = min(len(reader.pages) - 1, end_page - 1 + 15)

```


Zamiast wycinać PDF precyzyjnie (co jest podatne na błędy przez różnice w numeracji okładek), skrypt wycina fragment zaczynający się 2 strony wcześniej i kończący się aż 15 stron dalej. Ten "brudny" wycinek trafia do AI.
2. **Konfiguracja czasopisma:** Skrypt wywołuje `get_system_instruction(magazine)` z pliku `rules.py`, zaciągając precyzyjne zasady formatowania dla konkretnego wydawnictwa.
3. **Kadrowanie AI:** Prompt nakazuje modelowi zignorowanie "śmieci" otaczających właściwy tekst i skupienie się wyłącznie na artykule o zadanym tytule.
4. **Niska Temperatura:** W obiekcie `GenerateContentConfig` parametr `temperature` ustawiono na `0.1`. Zmusza to model do analitycznej, dosłownej pracy, całkowicie blokując "kreatywność" i ryzyko halucynowania (zmyślania) tekstu.
5. **Zwrot kodu:** System ponownie czyści wynik ze znaczników ````html` i zwraca gotowy kod do frontendu.


## 💻 Dokumentacja kodu: `frontend/src/app/page.tsx`

Główny komponent kliencki (`"use client"`) w Next.js. Odpowiada za zarządzanie stanem aplikacji, obsługę formularzy oraz asynchroniczną komunikację z backendem na Renderze. Warstwa wizualna oparta jest na komponentach Shadcn/UI oraz Tailwind CSS.

### 1. Model Danych i Zarządzanie Stanem
```typescript
interface Article {
  category?: string;
  title: string;
  author?: string;
  start_page: number;
  end_page?: number;
  html?: string;
  isLoading?: boolean;
  error?: string;
}

```

* **Interfejs `Article**`: Typuje strukturę danych dla pojedynczego tekstu. Rozszerza surowe dane zwracane z API o stany UI (np. czy dany tekst się obecnie ładuje, czy wystąpił przy nim błąd) oraz o wygenerowany kod `html`.
* **Hooki `useState**`: Przechowują globalny stan widoku, w tym referencję do wgranego pliku PDF (`file`), tablicę wyciągniętych tekstów (`articles`) oraz flagi blokujące przyciski podczas ładowania (`isExtracting`, `isGeneratingAll`).

### 2. Komunikacja API: Ekstrakcja spisu treści (`handleExtractTOC`)

Funkcja uruchamiana po zatwierdzeniu głównego formularza.

* Tworzy obiekt `FormData`, co jest niezbędne do poprawnego przesłania pliku binarnego (PDF) w żądaniu HTTP typu `multipart/form-data`.
* Wysyła zapytanie `POST` na endpoint `/api/extract-toc` na serwerze produkcyjnym Render.
* Po odebraniu odpowiedzi (tablica JSON), funkcja mapuje każdy obiekt, dodając mu domyślną stronę końcową (równą stronie startowej w przypadku braku innej wartości) oraz flagę `isLoading: false`. Wynik nadpisuje stan `setArticles`.

### 3. Komunikacja API: Konwersja pojedynczego tekstu (`handleGenerateArticle`)

Funkcja wywoływana dla konkretnego elementu z listy, identyfikowanego po jego indeksie w tablicy.

* Waliduje, czy użytkownik nie wpisał strony końcowej mniejszej niż początkowa.
* Aktywuje lokalny loader dla tego konkretnego elementu za pomocą funkcji pomocniczej `updateArticleState`.
* Wysyła do API w postaci `FormData` nie tylko plik PDF, ale też kontekst: wybrany profil czasopisma (`magazine`), tytuł tekstu do znalezienia oraz zakres stron zadeklarowany przez redaktora na interfejsie.
* Otrzymany kod HTML zapisuje bezpośrednio w stanie danego artykułu, co natychmiastowo aktualizuje widok w polu `Textarea`.

### 4. Przetwarzanie masowe (`handleGenerateAll`)

```typescript
const handleGenerateAll = async () => {
  setIsGeneratingAll(true);
  for (let i = 0; i < articles.length; i++) {
    if (!articles[i].html) {
      await handleGenerateArticle(i);
    }
  }
  setIsGeneratingAll(false);
};

```

Pętla asynchroniczna, która automatyzuje pracę. Iteruje po całej tablicy zidentyfikowanych artykułów. Słowo kluczowe `await` wewnątrz pętli wymusza przetwarzanie sekwencyjne (jeden po drugim), co zapobiega wysłaniu kilkunastu zapytań do Gemini jednocześnie (chroni to przed uderzeniem w limity `Rate Limit` na serwerach Google). Pomią te artykuły, które mają już wygenerowany kod HTML.

### 5. Funkcje pomocnicze i modyfikatory stanu

* **`updateArticleState`**: Generyczna funkcja przyjmująca indeks artykułu oraz obiekt `Partial<Article>`. Pozwala na punktową aktualizację tylko jednego parametru w konkretnym artykule (np. wyłącznie dodanie błędu lub zmiany statusu ładowania) bez nadpisywania reszty właściwości. Zgodnie z zasadami Reacta, tworzy płytką kopię tablicy.
* **`copyToClipboard`**: Wykorzystuje natywne przeglądarkowe Web API (`navigator.clipboard.writeText`) do błyskawicznego kopiowania wygenerowanego HTML-a do schowka systemowego. Ustawia na 2 sekundy status `copiedIndex`, co triggeruje zmianę ikony przycisku na zielony znacznik potwierdzenia.

## 📜 Dokumentacja kodu: `backend/rules.py`

Plik konfiguracyjny przechowujący logikę formatowania tekstu, oddzieloną od głównego silnika aplikacji w `main.py`. Zamiast łańcuchów warunkowych `if/else`, zastosowano tu wzorzec słownika (Dictionary Mapping).

### Struktura i działanie
1. **Zmienna `BASE_RULES`**: Zawiera żelazne, uniwersalne reguły dla modelu AI, które obowiązują niezależnie od wybranego magazynu (np. nakaz zwracania surowego HTML, ochrona oryginalnej treści, zabezpieczanie indeksów m² czy wstawianie czerwonego znacznika w miejscu grafik/tabel).
2. **Słownik `PROFILES`**: Przechowuje dedykowane, specyficzne dla danego czasopisma wytyczne. Kluczem jest nazwa magazynu (np. "Współczesna Dietetyka", "Drogi"), a wartością dokładna instrukcja (np. nakaz stosowania tagów `<h3>` lub dodawania specjalnego kontenera `<div style="...">` dla sekcji "Uwaga").
3. **Funkcja `get_system_instruction(magazine)`**: Pobiera ciąg znaków z nazwą magazynu, szuka dla niego dopasowania w słowniku `PROFILES` (wykorzystując metodę `.get()` z domyślnym fallbackiem `DEFAULT_RULES`, jeśli czasopismo nie zostanie znalezione) i łączy go z regułami bazowymi. Zwrócony, połączony tekst służy jako ostateczna "Instrukcja Systemowa" dla modelu Gemini.
