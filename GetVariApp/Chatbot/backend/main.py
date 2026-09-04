import json
import os
from pathlib import Path
from typing import List, Optional, TypedDict
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from supabase import create_client, Client
import requests
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, START, END
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI()

# Origins allowed to call this from a browser. Native apps ignore CORS, so this
# only matters for the admin web build; a public deployment should name it
# rather than leaving the wildcard.
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared secret the app sends as `X-API-Key`.
#
# This process holds a Supabase *service-role* key, which bypasses row-level
# security: an open /chat on a public URL is an unauthenticated path to every
# user's data. Set AQUASAGE_API_KEY on any deployment that is reachable from
# the internet. Left unset it stays open, which is fine on a laptop and is why
# local development needs no extra setup — the startup warning below is there
# so an unset key in production is at least loud.
AQUASAGE_API_KEY = os.getenv("AQUASAGE_API_KEY")
if not AQUASAGE_API_KEY:
    print("[AquaSage] WARNING: AQUASAGE_API_KEY is unset — /chat is unauthenticated.")


def require_api_key(supplied: Optional[str]) -> None:
    """Reject a request that does not carry the shared secret."""
    if not AQUASAGE_API_KEY:
        return
    if supplied != AQUASAGE_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

# Supabase setup
supabase_url: str = os.getenv("SUPABASE_URL", "https://ntuboicvzsoamwedtprg.supabase.co")
supabase_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not supabase_key:
    raise ValueError("SUPABASE_SERVICE_ROLE_KEY is required in .env")
supabase: Client = create_client(supabase_url, supabase_key)

JINA_API_KEY = os.getenv("JINA_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Groq retires models on its own schedule — `llama-3.3-70b-versatile` was the
# default here until it stopped existing, which surfaces as a 404 from /chat
# and reads to the user as "the AI is down". Kept in the environment so the
# next retirement is a config change on the host, not a redeploy.
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

model = ChatGroq(
    model=GROQ_MODEL,
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
    # Without a timeout a hung embedding call holds the request open until the
    # client gives up, which the user experiences as the assistant thinking for
    # a minute and then failing.
    response = requests.post(url, headers=headers, json=data, timeout=10)
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
    response = requests.post(url, headers=headers, json=data, timeout=10)
    response.raise_for_status()
    results = response.json()["results"]
    return [documents[r["index"]] for r in results]

# ---------------------------------------------------------------------------
# Fast paths
# ---------------------------------------------------------------------------
#
# "Who are you?" used to cost a full pipeline: an LLM call to rephrase, a Jina
# embedding, a Supabase vector search, a Jina rerank and a second LLM call —
# five network round trips to answer a question that has one fixed answer, on
# top of a free-tier cold start. That is where the 45 seconds went.
#
# Two shortcuts fix it. Questions with a fixed answer are answered from a
# table and never reach the graph at all; questions that plainly need no
# document skip retrieval and go straight to the model.

IDENTITY_PATTERNS = (
    "who are you", "what are you", "who r u", "your name", "what is your name",
    "what should i call you", "introduce yourself", "who am i talking to",
    "what can you do", "how can you help", "what do you do",
)

GREETING_PATTERNS = ("hi", "hello", "hey", "yo", "hola", "namaste", "good morning",
                     "good afternoon", "good evening", "thanks", "thank you", "ty")

IDENTITY_ANSWER = (
    "I'm **Vari**, the hydration assistant inside getVāri. 💧\n\n"
    "I read your profile and today's intake to answer questions about water and "
    "hydration, work out your **daily target**, explain your **hydration score**, "
    "and log a drink for you — just tell me how much you had."
)

GREETING_ANSWER = "Hey! 👋 I'm **Vari**. Ask me anything about hydration, or tell me how much water you just drank."


def canned_answer(question: str) -> Optional[str]:
    """A fixed reply for a question that has one, or None to run the graph."""
    text = question.strip().lower().rstrip("?!. ")
    if not text:
        return None
    if any(pattern in text for pattern in IDENTITY_PATTERNS):
        return IDENTITY_ANSWER
    # Greetings are matched whole, so "hi" answers instantly but "high heat and
    # hydration" still goes to the model.
    if text in GREETING_PATTERNS:
        return GREETING_ANSWER
    return None


# Words that mean the answer is in the getVāri documents rather than in the
# model's general knowledge. Anything else skips retrieval, which is two
# network calls and most of the latency on a question the corpus cannot help with.
RETRIEVAL_KEYWORDS = (
    "getvari", "get vari", "vāri", "vari app", "my score", "my target", "my risk",
    "pbwr", "algorithm", "report", "recovery engine", "smartcap", "wearable",
    "my profile", "my data", "my hydration", "score", "target", "risk",
)


def needs_retrieval(question: str) -> bool:
    text = question.lower()
    return any(keyword in text for keyword in RETRIEVAL_KEYWORDS)


# Node 1: Rephrase
def rephrase_question(state: AgentState):
    print(f"--- NODE: REPHRASE ---")
    # Rephrasing exists to resolve pronouns against earlier turns. With no
    # earlier *user* turn there is nothing to resolve, and the opening greeting
    # the app posts on its own does not count — treating it as history bought a
    # whole extra LLM round trip on the very first question of every session.
    prior_user_turns = [m for m in state["chat_history"] if m.role == "user"]
    if not prior_user_turns:
        print(f"No user history, using raw question: {state['question']}")
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
    try:
        embedding = get_jina_embedding(state["standalone_question"])
    except Exception as e:  # noqa: BLE001
        # The model answers from general knowledge when the corpus is
        # unreachable, which is far better than failing the whole request.
        print(f"Embedding failed, answering without context: {e}")
        return {"context": ""}

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
    try:
        reranked = rerank(state["standalone_question"], documents)
    except Exception as e:  # noqa: BLE001
        print(f"Rerank failed, using vector order: {e}")
        reranked = documents[:4]
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
{state.get('context') or 'No specific getVāri document context found.'}
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
# Retrieval is skipped for questions the corpus cannot answer — a general
# hydration fact does not need an embedding, a vector search and a rerank.
workflow.add_conditional_edges(
    "rephrase",
    lambda state: "retrieve" if needs_retrieval(state["standalone_question"] or state["question"]) else "generate",
    {"retrieve": "retrieve", "generate": "generate"},
)
workflow.add_edge("retrieve", "generate")
workflow.add_edge("generate", END)

aqua_sage = workflow.compile()

@app.get("/")
async def root():
    return {"message": "AquaSage AI Server is online 💧", "status": "ok"}

@app.get("/ping")
async def ping():
    return {"status": "ok"}

# ---------------------------------------------------------------------------
# Runtime configuration
# ---------------------------------------------------------------------------
#
# Disease definitions and everything derived from them (goal adjustments, risk
# weights, PBWR ceilings, which diagnoses need a physician's limit) used to be
# typed into the app in several places at once, under several different spellings
# of the same id. They now live in one Supabase row that the admin console edits
# and the app fetches from here.
#
# The endpoint is deliberately forgiving: it merges the stored document over the
# defaults below and always answers 200 with something usable, because a config
# fetch that fails is a hydration app that cannot show its onboarding screen.

CONFIG_TABLE = "getvari_app_config"
CONFIG_ROW_ID = "active"

# The shipped defaults, shared verbatim with the app.
#
# `default_app_config.json` is imported by src/config/appConfigSchema.ts as
# well, so the fallback the server returns and the fallback a device uses
# before its first fetch are the same bytes. They were two hand-maintained
# copies for about an hour, which is roughly how long it takes for two
# hand-maintained copies of anything to disagree.
_DEFAULTS_PATH = Path(__file__).with_name("default_app_config.json")

with _DEFAULTS_PATH.open(encoding="utf-8") as _defaults_file:
    DEFAULT_CONFIG = json.load(_defaults_file)


@app.get("/config")
async def get_config(x_api_key: Optional[str] = Header(default=None)):
    """The app's runtime configuration, as edited in the admin console.

    Merged one level deep over the defaults: a stored document that names only
    `medicalConditions` keeps the shipped activity levels rather than losing
    them, which is what makes a partial edit in the console safe.
    """
    require_api_key(x_api_key)

    merged = dict(DEFAULT_CONFIG)
    try:
        res = (
            supabase.table(CONFIG_TABLE)
            .select("version, config, updated_at")
            .eq("id", CONFIG_ROW_ID)
            .maybe_single()
            .execute()
        )
        row = res.data if res else None
        if row:
            stored = row.get("config") or {}
            for key, value in stored.items():
                # An explicitly empty section is a mistake far more often than
                # it is an intention ("hide every disease"), and adopting it
                # would empty the onboarding screen. Ignore it.
                if value in (None, [], {}):
                    continue
                merged[key] = value
            merged["version"] = row.get("version", merged["version"])
            merged["updatedAt"] = row.get("updated_at", merged["updatedAt"])
    except Exception as e:  # noqa: BLE001 - a config read must never 500
        print(f"[Config] Falling back to defaults: {e}")

    return merged


@app.post("/chat")
async def chat(request: ChatRequest, x_api_key: Optional[str] = Header(default=None)):
    require_api_key(x_api_key)
    print(f"\n>>> INCOMING REQUEST: {request.question}")

    quick = canned_answer(request.question)
    if quick is not None:
        print("--- FAST PATH: canned answer ---")
        return {"answer": quick}

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
    # PORT is what every managed host (Render, Fly, Cloud Run) injects.
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
