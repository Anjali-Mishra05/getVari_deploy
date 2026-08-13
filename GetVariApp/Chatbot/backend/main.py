import os
from typing import List, Optional, TypedDict
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client
import requests
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, START, END
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase setup
supabase_url: str = "https://ntuboicvzsoamwedtprg.supabase.co"
supabase_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

JINA_API_KEY = os.getenv("JINA_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

model = ChatGroq(
    model="llama-3.3-70b-versatile",
    groq_api_key=GROQ_API_KEY,
    temperature=0.2
)

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    question: str
    chatHistory: List[Message] = []
    userProfile: Optional[dict] = {}

class AgentState(TypedDict):
    question: str
    standalone_question: Optional[str]
    chat_history: List[Message]
    user_profile: Optional[dict]
    context: Optional[str]
    answer: Optional[str]

def get_jina_embedding(text: str):
    url = "https://api.jina.ai/v1/embeddings"
    headers = {
        "Authorization": f"Bearer {JINA_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "jina-embeddings-v3",
        "task": "retrieval.query",
        "dimensions": 1024,
        "input": [text]
    }
    response = requests.post(url, headers=headers, json=data)
    response.raise_for_status()
    return response.json()["data"][0]["embedding"]

def rerank(query: str, documents: List[dict]):
    url = "https://api.jina.ai/v1/rerank"
    headers = {
        "Authorization": f"Bearer {JINA_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "jina-reranker-v2-base-multilingual",
        "query": query,
        "documents": [d["content"] for d in documents],
        "top_n": 4
    }
    response = requests.post(url, headers=headers, json=data)
    response.raise_for_status()
    results = response.json()["results"]
    return [documents[r["index"]] for r in results]

# Node 1: Rephrase
def rephrase_question(state: AgentState):
    print(f"--- NODE: REPHRASE ---")
    if not state["chat_history"]:
        print(f"No history, using raw question: {state['question']}")
        return {"standalone_question": state["question"]}

    history_str = "\n".join([f"{m.role}: {m.content}" for m in state["chat_history"]])
    prompt = f"""Given the following conversation and a follow-up question, rewrite the follow-up question into a clear standalone question while preserving its original meaning.

Chat History:
{history_str}

Follow-up Question:
{state['question']}

Standalone Question:"""

    res = model.invoke(prompt)
    print(f"Rephrased to: {res.content}")
    return {"standalone_question": res.content}

# Node 2: Retrieve
def retrieve(state: AgentState):
    print(f"--- NODE: RETRIEVE ---")
    print(f"Retrieving for: {state['standalone_question']}")
    embedding = get_jina_embedding(state["standalone_question"])

    # RPC match_documents needs to be created in Supabase
    res = supabase.rpc("match_documents", {
        "query_embedding": embedding,
        "match_threshold": 0.3,
        "match_count": 10
    }).execute()

    documents = res.data
    if not documents:
        print("No documents found in vector search.")
        return {"context": ""}

    print(f"Found {len(documents)} potential chunks. Reranking...")
    reranked = rerank(state["standalone_question"], documents)
    context = "\n\n---\n\n".join([f"[Source: {d['metadata']['source']}]\n{d['content']}" for d in reranked])
    return {"context": context}

# Node 3: Generate
def generate(state: AgentState):
    print(f"--- NODE: GENERATE ---")

    # Check for Research Paper / Formula questions first
    security_keywords = ["research paper", "which paper", "show me the research", "what formula", "formula used", "source of truth", "where is this from"]
    if any(k in state['question'].lower() for k in security_keywords):
        return {"answer": "Our recommendations come from hydration guidelines our research team has validated and integrated. The **underlying sources and formulas aren't shared publicly**."}

    system_prompt = """You are an intelligent hydration and wellness assistant 💧.

## ✂️ Length (most important rule)
- **Maximum 1–2 short paragraphs.** Two or three sentences each, at most.
- No preamble, no recap of the question, no closing pleasantries, no section headings.
- **Bold** the numbers and the words that carry the answer, so it can be skimmed.
- Never mention databases, logs, internal logic or how the app works.
- The only exception is the personalized report format at the bottom.

## 🚫 Do NOT add a hydration tip
The app appends its own short tip to every reply. Ending your answer with a tip
just produces two, so finish on the answer itself.

## 🌊 Your Role
- Act as an expert on water, hydration, and hydration-related facts.
- Answer user questions to the point using either:
    1. The provided context (for getVāri-specific algorithm, reports, and data).
    2. Your extensive internal knowledge about water and hydration science.
- **STRICT RESTRICTION**: You are **PROHIBITED** from answering questions unrelated to water or hydration (e.g., politicians, history, news, general trivia). If a question is unrelated, reply EXACTLY: "I can only answer questions related to water, hydration, and the uploaded getVāri documents."
- Only ask for personal details if the user explicitly asks you to **calculate their daily water requirement** or **analyze their hydration score**.

## 🧮 Water Calculation Protocol
If and ONLY IF the user wants a calculation:
1. Check for these 4 details: 👤 Age, ⚖️ Weight, 🏃 Activity Level, 🌤️ Climate.
2. If any are missing, ask for them politely.
3. Once provided, perform the calculation using internal formulas (don't show the math, just the result).
4. Provide the report in the format specified below.

## 🔒 Research Paper Policy
If asked about research or formulas, reply: "These recommendations are based on methodologies and hydration guidelines that have been extensively studied, validated, and integrated by our research team. The underlying research sources and proprietary formulas are not publicly shared."

# 💧 Response Format (ONLY for Personalized Reports)
Keep it to these four lines — no headings, no profile recap, no extra sections:

**Your daily target: X.X L/day** ([Age], [Weight], [Activity], [Climate])
**Hydration score: XX/100** — [Poor/Fair/Good/Excellent]
Next step: [one short action]
"""

    user_profile_str = ""
    if state.get('user_profile'):
        p = state['user_profile']
        user_profile_str = f"""
KNOWN USER INFO:
- Age: {p.get('age', 'N/A')}
- Gender: {p.get('gender', 'N/A')}
- Weight: {p.get('weightKg', 'N/A')}kg
- Activity Level: {p.get('activityLevel', 'N/A')}
- Location: {p.get('selectedCity', 'N/A')}
"""

    prompt = f"""{system_prompt}

{user_profile_str}

==========================
Retrieved Context (getVāri Source of Truth):
{state['context'] if state['context'] else 'No specific getVāri document context found.'}
==========================

User Question: {state['standalone_question']}

==========================
STRICT RULES FOR YOUR ANSWER:
1. If the question is about getVāri logic/reports, use the context.
2. If the question is a general fact about water/hydration (e.g. "What are the benefits of water?", "How does heat affect hydration?"), use your expert knowledge.
3. If the question is NOT about water or hydration, reply EXACTLY: "I can only answer questions related to water, hydration, and the uploaded getVāri documents."
4. Never mention research papers or formulas.
5. **FORMATTING RULE**: NEVER use # or single * symbols. Use double asterisks **only** around words that should be bold (e.g., **Word**). I will handle the bolding in the UI so the asterisks won't show. Use plain dashes (-) for lists.
6. **BE BRIEF**: 1–2 short paragraphs, even for the personalized report. Cut anything the user did not ask for.
7. Do NOT end with a hydration tip — the app adds one. Finish on the answer.

Answer:"""

    res = model.invoke(prompt)
    return {"answer": res.content}

# Build Workflow
workflow = StateGraph(AgentState)
workflow.add_node("rephrase", rephrase_question)
workflow.add_node("retrieve", retrieve)
workflow.add_node("generate", generate)

workflow.add_edge(START, "rephrase")
workflow.add_edge("rephrase", "retrieve")
workflow.add_edge("retrieve", "generate")
workflow.add_edge("generate", END)

aqua_sage = workflow.compile()

@app.get("/")
async def root():
    return {"message": "AquaSage AI Server is online 💧", "status": "ok"}

@app.get("/ping")
async def ping():
    return {"status": "ok"}

@app.post("/chat")
async def chat(request: ChatRequest):
    print(f"\n>>> INCOMING REQUEST: {request.question}")
    try:
        inputs = {
            "question": request.question,
            "chat_history": request.chatHistory,
            "user_profile": request.userProfile,
            "standalone_question": None,
            "context": None,
            "answer": None
        }
        result = aqua_sage.invoke(inputs)
        return {"answer": result["answer"]}
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*50)
    print("AQUASAGE AI SERVER STARTING...")
    print("Listening on: http://0.0.0.0:8000")
    print("For Emulator: Use address http://10.0.2.2:8000")
    print("="*50 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
