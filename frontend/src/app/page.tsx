"use client";

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Copy, Check, FileText, Play } from "lucide-react";

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

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [magazine, setMagazine] = useState("Współczesna Dietetyka");
  const [tocPage, setTocPage] = useState("6");
  const [articles, setArticles] = useState<Article[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleExtractTOC = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setArticles([]);
    
    if (!file || !tocPage) {
      setError("Wybierz plik PDF i podaj numer strony spisu treści.");
      return;
    }

    setIsExtracting(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("toc_page", tocPage);

    try {
      const res = await fetch("http://localhost:8000/api/extract-toc", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Wystąpił błąd podczas ekstrakcji spisu treści");
      }

      const initializedArticles = data.map((art: any) => ({
        ...art,
        end_page: art.end_page || art.start_page,
        html: "",
        isLoading: false
      }));
      setArticles(initializedArticles);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  const updateArticleEndPage = (index: number, value: string) => {
    const newArticles = [...articles];
    newArticles[index].end_page = parseInt(value) || newArticles[index].start_page;
    setArticles(newArticles);
  };

  const handleGenerateArticle = async (index: number) => {
    const article = articles[index];

    if (!article.end_page || article.end_page < article.start_page) {
      updateArticleState(index, { error: "Błędna strona końcowa." });
      return;
    }

    updateArticleState(index, { isLoading: true, error: undefined });

    const formData = new FormData();
    formData.append("file", file!);
    formData.append("magazine", magazine);
    formData.append("title", article.title); // Wysyłamy tytuł do backendu
    formData.append("start_page", article.start_page.toString());
    formData.append("end_page", article.end_page.toString());

    try {
      const res = await fetch("http://localhost:8000/api/process-article", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Wystąpił błąd");
      }

      updateArticleState(index, { html: data.html, isLoading: false });
    } catch (err: any) {
      updateArticleState(index, { error: err.message, isLoading: false });
    }
  };

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    for (let i = 0; i < articles.length; i++) {
      if (!articles[i].html) {
        await handleGenerateArticle(i);
      }
    }
    setIsGeneratingAll(false);
  };

  const updateArticleState = (index: number, updates: Partial<Article>) => {
    setArticles(prev => {
      const newArr = [...prev];
      newArr[index] = { ...newArr[index], ...updates };
      return newArr;
    });
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <Card className="border-t-4 border-t-indigo-600 shadow-md">
          <CardHeader>
            <CardTitle>Ekstrakcja struktury magazynu</CardTitle>
            <CardDescription>Wgraj plik PDF, wybierz magazyn i wskaż stronę spisu treści.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleExtractTOC} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
              
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="pdf">Plik PDF Magazynu</Label>
                <Input 
                  id="pdf" 
                  type="file" 
                  accept="application/pdf" 
                  onChange={(e) => setFile(e.target.files?.[0] || null)} 
                />
              </div>

              <div className="space-y-2">
                <Label>Czasopismo</Label>
                <Select value={magazine} onValueChange={(val) => val && setMagazine(val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz czasopismo"/>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Kreatywny Wychowawca">Kreatywny Wychowawca</SelectItem>
                    <SelectItem value="GETCREATIVE">GETCREATIVE</SelectItem>
                    <SelectItem value="Leczenie Żywieniowe">Leczenie Żywieniowe</SelectItem>
                    <SelectItem value="Obesity">Obesity</SelectItem>
                    <SelectItem value="Współczesna Dietetyka">Współczesna Dietetyka</SelectItem>
                    <SelectItem value="Drogi Samorządowe">Drogi Samorządowe</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tocPage">Strona spisu (fizyczna w czytniku PDF)</Label>
                <Input 
                  id="tocPage" 
                  type="number" 
                  min="1" 
                  value={tocPage} 
                  onChange={(e) => setTocPage(e.target.value)} 
                />
              </div>

              {error && <p className="text-sm text-red-500 font-medium md:col-span-4">{error}</p>}

              <Button type="submit" className="md:col-span-4 mt-2" disabled={isExtracting}>
                {isExtracting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                    Analiza spisu treści za pomocą Gemini...
                  </>
                ) : (
                  "Wczytaj spis treści"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {articles.length > 0 && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
                <FileText className="h-6 w-6 text-indigo-600"/>
                Znalezione artykuły ({articles.length})
              </h2>
              <Button 
                onClick={handleGenerateAll} 
                disabled={isGeneratingAll || isExtracting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isGeneratingAll ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Przetwarzanie zbiorcze...</>
                ) : (
                  <><Play className="mr-2 h-4 w-4"/> Generuj HTML dla wszystkich</>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-8">
              {articles.map((article, index) => (
                <Card key={index} className="flex flex-col lg:flex-row shadow-sm overflow-hidden">
                  
                  {/* Lewa kolumna: Konfiguracja artykułu */}
                  <div className="flex flex-col w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white">
                    <CardHeader className="flex-1">
                      <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">
                        {article.category || "BRAK DZIAŁU"}
                      </div>
                      <CardTitle className="text-lg leading-tight">{article.title}</CardTitle>
                      <CardDescription className="mt-2 line-clamp-2">
                        {article.author || "Brak autora"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <div>
                          <Label className="text-xs text-slate-500">Strona DRUKOWANA</Label>
                          <p className="font-mono text-lg font-medium">{article.start_page}</p>
                        </div>
                        <div>
                          <Label htmlFor={`end-${index}`} className="text-xs text-slate-500">Koniec DRUKOWANY</Label>
                          <Input 
                            id={`end-${index}`} 
                            type="number" 
                            min={article.start_page} 
                            value={article.end_page || ""} 
                            onChange={(e) => updateArticleEndPage(index, e.target.value)}
                            className="h-8 font-mono bg-white"
                          />
                        </div>
                      </div>
                      {article.error && <p className="text-sm text-red-500 font-medium">{article.error}</p>}
                    </CardContent>
                    <CardFooter className="bg-slate-50 p-4 border-t border-slate-100 mt-auto">
                      <Button 
                        className="w-full" 
                        variant="outline"
                        onClick={() => handleGenerateArticle(index)}
                        disabled={article.isLoading || isGeneratingAll}
                      >
                        {article.isLoading ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Generowanie...</>
                        ) : (
                          "Generuj HTML"
                        )}
                      </Button>
                    </CardFooter>
                  </div>

                  {/* Prawa kolumna: Wygenerowany HTML */}
                  <div className="w-full lg:w-2/3 bg-slate-900 flex flex-col relative min-h-[300px]">
                    {article.html ? (
                      <>
                        <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-950/50">
                          <span className="text-xs font-mono text-emerald-400">gotowy-kod.html</span>
                          <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={() => copyToClipboard(article.html!, index)}
                            className="h-7 text-xs bg-slate-800 hover:bg-slate-700 text-white border-none"
                          >
                            {copiedIndex === index ? <Check className="mr-1 h-3 w-3 text-emerald-400"/> : <Copy className="mr-1 h-3 w-3"/>}
                            {copiedIndex === index ? "Skopiowano" : "Kopiuj"}
                          </Button>
                        </div>
                        <Textarea 
                          value={article.html} 
                          readOnly 
                          spellCheck={false} 
                          className="flex-1 w-full p-4 font-mono text-sm resize-none bg-transparent text-slate-300 border-none focus-visible:ring-0 rounded-none" 
                        />
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center p-8 text-slate-600 text-sm font-medium text-center">
                        {article.isLoading ? "Przetwarzanie dokumentu..." : "Kliknij \"Generuj HTML\", aby otrzymać kod lub skorzystaj z przycisku generowania zbiorczego na górze."}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}