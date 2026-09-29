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
      const res = await fetch("https://cms-pdf-processor.onrender.com/api/extract-toc", {
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
    formData.append("title", article.title);
    formData.append("start_page", article.start_page.toString());
    formData.append("end_page", article.end_page.toString());

    try {
      const res = await fetch("https://cms-pdf-processor.onrender.com/api/process-article", {
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
    <main className="min-h-screen p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div className="flex flex-col space-y-2 pb-4">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Narzędzie CMS PDF</h1>
          <p className="text-slate-500">Automatyczna konwersja artykułów z magazynów do gotowego kodu HTML za pomocą AI.</p>
        </div>

        <Card className="border-t-4 border-t-blue-600 shadow-md">
          <CardHeader>
            <CardTitle>Struktura numeru</CardTitle>
            <CardDescription>Wgraj plik z najnowszym wydaniem czasopisma i wskaż stronę spisu treści.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleExtractTOC} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
              
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="pdf">Plik PDF</Label>
                <Input 
                  id="pdf" 
                  type="file" 
                  accept="application/pdf" 
                  onChange={(e) => setFile(e.target.files?.[0] || null)} 
                  className="cursor-pointer bg-white file:mr-4 file:py-1 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              <div className="space-y-2">
                <Label>Czasopismo</Label>
                <Select value={magazine} onValueChange={(val) => val && setMagazine(val)}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Wybierz tytuł"/>
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
                <Label htmlFor="tocPage">Strona spisu</Label>
                <Input 
                  id="tocPage" 
                  type="number" 
                  min="1" 
                  value={tocPage} 
                  onChange={(e) => setTocPage(e.target.value)} 
                  className="bg-white"
                />
              </div>

              {error && <p className="text-sm text-red-500 font-medium md:col-span-4">{error}</p>}

              <Button type="submit" className="md:col-span-4 mt-4 bg-slate-900 hover:bg-slate-800 text-white shadow-sm" disabled={isExtracting}>
                {isExtracting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                    Trwa analiza AI...
                  </>
                ) : (
                  "Analizuj spis treści"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {articles.length > 0 && (
          <div className="space-y-6 pt-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-800 flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600"/>
                Zidentyfikowane artykuły ({articles.length})
              </h2>
              <Button 
                onClick={handleGenerateAll} 
                disabled={isGeneratingAll || isExtracting}
                className="bg-blue-600 hover:bg-blue-700 text-white shadow-md"
              >
                {isGeneratingAll ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Przetwarzanie...</>
                ) : (
                  <><Play className="mr-2 h-4 w-4"/> Generuj wszystkie teksty</>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {articles.map((article, index) => (
                <Card key={index} className="flex flex-col lg:flex-row shadow-sm border border-slate-200 overflow-hidden bg-white">
                  
                  <div className="flex flex-col w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-slate-200">
                    <CardHeader className="flex-1 pb-4">
                      <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">
                        {article.category || "BRAK DZIAŁU"}
                      </div>
                      <CardTitle className="text-lg leading-tight text-slate-900">{article.title}</CardTitle>
                      <CardDescription className="mt-2 line-clamp-2 text-slate-500">
                        {article.author || "Brak autora"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pb-4">
                      <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                        <div>
                          <Label className="text-xs text-slate-500">Strona Startowa</Label>
                          <p className="font-mono text-xl font-semibold text-slate-700 mt-1">{article.start_page}</p>
                        </div>
                        <div>
                          <Label htmlFor={`end-${index}`} className="text-xs text-slate-500">Strona Końcowa</Label>
                          <Input 
                            id={`end-${index}`} 
                            type="number" 
                            min={article.start_page} 
                            value={article.end_page || ""} 
                            onChange={(e) => updateArticleEndPage(index, e.target.value)}
                            className="h-10 mt-1 font-mono text-base bg-white"
                          />
                        </div>
                      </div>
                      {article.error && <p className="text-sm text-red-500 font-medium">{article.error}</p>}
                    </CardContent>
                    <CardFooter className="bg-slate-50 p-4 border-t border-slate-100 mt-auto">
                      <Button 
                        className="w-full bg-white text-slate-700 hover:bg-slate-100 border border-slate-300 shadow-sm" 
                        variant="outline"
                        onClick={() => handleGenerateArticle(index)}
                        disabled={article.isLoading || isGeneratingAll}
                      >
                        {article.isLoading ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-600"/> Generowanie kodu...</>
                        ) : (
                          "Generuj HTML dla artykułu"
                        )}
                      </Button>
                    </CardFooter>
                  </div>

                  <div className="w-full lg:w-2/3 bg-slate-900 flex flex-col relative min-h-[350px]">
                    {article.html ? (
                      <>
                        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950">
                          <span className="text-xs font-mono text-blue-400">kod-html-cms.html</span>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => copyToClipboard(article.html!, index)}
                            className="h-8 text-xs bg-slate-800 hover:bg-slate-700 text-white"
                          >
                            {copiedIndex === index ? <Check className="mr-1 h-3 w-3 text-green-400"/> : <Copy className="mr-1 h-3 w-3"/>}
                            {copiedIndex === index ? "Skopiowano" : "Kopiuj kod"}
                          </Button>
                        </div>
                        <Textarea 
                          value={article.html} 
                          readOnly 
                          spellCheck={false} 
                          className="flex-1 w-full p-4 font-mono text-sm leading-relaxed resize-none bg-transparent text-slate-300 border-none focus-visible:ring-0 rounded-none custom-scrollbar" 
                        />
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500 text-sm">
                        {article.isLoading ? (
                          <>
                            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4"/>
                            <p>Sztuczna inteligencja formatuje dokument...</p>
                          </>
                        ) : (
                          <p>Oczekuje na wygenerowanie kodu HTML.</p>
                        )}
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