import os
import io
import json
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader, PdfWriter
from google import genai
from google.genai import types
from tenacity import retry, wait_exponential, stop_after_attempt
from dotenv import load_dotenv

from rules import get_system_instruction

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI(title="CMS PDF Processor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://cms-pdf-processor.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@retry(wait=wait_exponential(multiplier=2, min=4, max=60), stop=stop_after_attempt(3))
def call_gemini_with_retry(model_name, contents, config=None):
    try:
        response = client.models.generate_content(
            model=model_name,
            contents=contents,
            config=config
        )
        return response.text
    except Exception as e:
        print(f"SZCZEGÓŁY BŁĘDU API: {str(e)}")
        raise

@app.post("/api/extract-toc")
async def extract_toc(
    file: UploadFile = File(...),
    toc_page: int = Form(...)
):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Plik musi być w formacie PDF.")
    
    try:
        pdf_bytes = await file.read()
        reader = PdfReader(io.BytesIO(pdf_bytes))
        writer = PdfWriter()
        
        toc_page_index = toc_page - 1
        if toc_page_index < len(reader.pages):
            writer.add_page(reader.pages[toc_page_index])
        else:
            raise HTTPException(status_code=400, detail="Błędny numer strony spisu treści.")
            
        cropped_pdf_io = io.BytesIO()
        writer.write(cropped_pdf_io)
        pdf_data = cropped_pdf_io.getvalue()

        prompt = """
        Przeanalizuj podaną stronę spisu treści z magazynu. 
        Zwróć tablicę obiektów JSON reprezentujących poszczególne artykuły.
        Zwróć WYŁĄCZNIE czysty JSON bez żadnych dodatkowych znaczników, tekstów czy formatowania Markdown.
        Każdy obiekt musi zawierać następujące klucze:
        - "category" (dział, np. "TEMAT NUMERU", "WARTO WIEDZIEĆ", jeśli nie ma zostaw puste)
        - "title" (tytuł artykułu)
        - "author" (imię i nazwisko autora, w tym stopnie naukowe, jeśli są widoczne)
        - "start_page" (numer strony początkowej jako wartość numeryczna)
        """
        
        contents = [
            types.Part.from_bytes(data=pdf_data, mime_type="application/pdf"),
            prompt
        ]
        
        response_text = call_gemini_with_retry("gemini-3.6-flash", contents)
        
        clean_text = response_text.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        elif clean_text.startswith("```"):
            clean_text = clean_text[3:]
            
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
            
        articles = json.loads(clean_text.strip())
        
        # Sortowanie artykułów według stron i automatyczne wyliczanie stron końcowych
        articles = sorted(articles, key=lambda x: x.get("start_page", 0))
        for i in range(len(articles) - 1):
            calculated_end = articles[i+1]["start_page"] - 1
            articles[i]["end_page"] = max(articles[i]["start_page"], calculated_end)
            
        if articles:
            articles[-1]["end_page"] = articles[-1]["start_page"]

        return articles

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process-article")
async def process_article(
    file: UploadFile = File(...),
    magazine: str = Form(...),
    title: str = Form(...),
    start_page: int = Form(...),
    end_page: int = Form(...)
):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Plik musi być w formacie PDF.")
    
    try:
        pdf_bytes = await file.read()
        reader = PdfReader(io.BytesIO(pdf_bytes))
        writer = PdfWriter()
        
        # TWORZYMY SZEROKIE OKNO (BUFFER)
        # Zamiast celować precyzyjnie, wycinamy 2 strony przed i aż 15 stron po wskazanym zakresie.
        # To gwarantuje, że artykuł w całości znajduje się w przesłanym fragmencie,
        # nawet jeśli fizyczne przesunięcie w pliku wynosi +10 stron z powodu okładek/reklam.
        physical_start = max(0, start_page - 1 - 2)
        physical_end = min(len(reader.pages) - 1, end_page - 1 + 15)

        for i in range(physical_start, physical_end + 1):
            writer.add_page(reader.pages[i])
                
        cropped_pdf_io = io.BytesIO()
        writer.write(cropped_pdf_io)
        pdf_data = cropped_pdf_io.getvalue()
        
        system_instruction = get_system_instruction(magazine)
        prompt = f"""
        W załączonym dokumencie (który jest szeroko wyciętym fragmentem magazynu) znajduje się artykuł zatytułowany "{title}".
        Twoim zadaniem jest odnalezienie tego konkretnego artykułu i wygenerowanie z niego kodu HTML.
        
        ZASADA KADROWANIA:
        - Dokument zawiera strony poprzedzające (np. końcówka innego artykułu, okładki, reklamy) – całkowicie je zignoruj.
        - Dokument zawiera wiele stron po fizycznym zakończeniu tego artykułu – nie dołączaj z nich żadnych treści.
        - Rozpocznij formatowanie dokładnie od nagłówka "{title}" i zakończ dokładnie w miejscu, gdzie kończy się jego merytoryczny tekst.
        
        Przetwórz ten tekst zgodnie z instrukcjami systemowymi czasopisma '{magazine}'.
        """
        
        contents = [
            types.Part.from_bytes(data=pdf_data, mime_type="application/pdf"),
            prompt
        ]
        
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.1
        )
        
        generated_html = call_gemini_with_retry("gemini-3.6-flash", contents, config)
        
        if generated_html.startswith("```html\n"):
            generated_html = generated_html[8:]
        elif generated_html.startswith("```html"):
            generated_html = generated_html[7:]
            
        if generated_html.endswith("```"):
            generated_html = generated_html[:-3]
            
        return {"html": generated_html.strip()}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))