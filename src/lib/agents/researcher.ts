import { getDb } from "@/lib/db";
import { newId, nowISO } from "@/lib/utils";
import { completeJSON } from "@/lib/ai";

const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const SEARCH_ENGINE_ID = "f3f7e7f0e97454c78"; // Provided by user

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export async function searchWeb(query: string, numResults = 5): Promise<SearchResult[]> {
  if (!GOOGLE_SEARCH_API_KEY) {
    console.warn("[Research Agent] GOOGLE_SEARCH_API_KEY is missing. Returning mocked results.");
    return [];
  }
  
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}&num=${numResults}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Search API error: ${res.statusText}`);
    
    const data = await res.json();
    if (!data.items) return [];
    
    return data.items.map((item: any) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet
    }));
  } catch (error) {
    console.error("[Research Agent] Search failed:", error);
    return [];
  }
}

export async function researchOpportunities(userId: string) {
  const db = await getDb();
  
  // 1. Get user career goals and profile context to form a query
  const profile = await db.get(`SELECT headline, summary FROM profiles WHERE user_id = ?`, [userId]);
  const goals = await db.query(`SELECT title, description FROM goals WHERE user_id = ? AND status = 'active'`, [userId]);
  
  if (!profile && goals.length === 0) return;
  
  const context = `
    Profile: ${profile?.headline || ""} - ${profile?.summary || ""}
    Goals: ${goals.map(g => g.title).join(", ")}
  `;

  // 2. Ask AI to generate 3 highly targeted Google search queries
  const queriesPrompt = `
    Based on the following user profile and career goals, generate 3 highly targeted Google search queries 
    to find matching job opportunities, master's programs, or scholarships.
    
    Context:
    ${context}
    
    Return a JSON object with a 'queries' array of strings.
  `;
  
  const aiResult = await completeJSON<{ queries: string[] }>({
    userId,
    agent: "researcher",
    messages: [{ role: "user", content: queriesPrompt }],
  });
  
  if (!aiResult || !aiResult.queries) return;
  
  // 3. Execute searches
  const allResults: SearchResult[] = [];
  for (const q of aiResult.queries) {
    const res = await searchWeb(q, 3);
    allResults.push(...res);
  }
  
  // 4. Ask AI to filter and extract structured opportunities from the snippets
  if (allResults.length === 0) return;
  
  const extractPrompt = `
    Review the following search results and extract any valid, distinct opportunities (jobs, programs, scholarships).
    Ignore generic articles or advice pages. Only extract actual opportunities.
    
    Results:
    ${JSON.stringify(allResults)}
    
    Return a JSON object with an 'opportunities' array containing:
    - type: "job" | "scholarship" | "program"
    - title: string
    - organization: string
    - url: string
    - summary: string
  `;
  
  const extracted = await completeJSON<{ opportunities: any[] }>({
    userId,
    agent: "researcher_extraction",
    messages: [{ role: "user", content: extractPrompt }],
  });
  
  if (!extracted || !extracted.opportunities) return;
  
  // 5. Save to database
  for (const opp of extracted.opportunities) {
    const existing = await db.get(`SELECT id FROM opportunities WHERE user_id = ? AND source_url = ?`, [userId, opp.url]);
    if (existing) continue;
    
    await db.insert("opportunities", {
      id: newId("opp"),
      user_id: userId,
      type: opp.type,
      title: opp.title,
      source_name: opp.organization,
      source_url: opp.url,
      description: opp.summary,
      status: "discovered",
      created_at: nowISO(),
      updated_at: nowISO()
    });
  }
}
