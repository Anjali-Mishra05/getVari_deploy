import os
import os.path
from dotenv import load_dotenv
from supabase import create_client, Client
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, UnstructuredWordDocumentLoader
import requests

load_dotenv()

# Supabase setup
url: str = "https://ntuboicvzsoamwedtprg.supabase.co"
key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(url, key)

JINA_API_KEY = os.getenv("JINA_API_KEY")

def get_jina_embedding(text: str):
    url = "https://api.jina.ai/v1/embeddings"
    headers = {
        "Authorization": f"Bearer {JINA_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "jina-embeddings-v3",
        "task": "retrieval.passage",
        "dimensions": 1024,
        "input": [text]
    }
    response = requests.post(url, headers=headers, json=data)
    response.raise_for_status()
    return response.json()["data"][0]["embedding"]

def ingest():
    # Use paths relative to the script location
    script_dir = os.path.dirname(os.path.abspath(__file__))
    files = [
        {"name": "getVari_algo.docx", "path": os.path.join(script_dir, "..", "getVari_algo.docx")},
        {"name": "Working Report.pdf", "path": os.path.join(script_dir, "..", "Working Report.pdf")}
    ]

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=900,
        chunk_overlap=150,
    )

    for file_info in files:
        file_name = file_info["name"]
        file_path = file_info["path"]
        print(f"Processing {file_name}...")

        if not os.path.exists(file_path):
            print(f"Error: {file_path} not found.")
            continue

        if file_name.endswith(".pdf"):
            loader = PyPDFLoader(file_path)
            pages = loader.load()
            text = "\n".join([p.page_content for p in pages])
        elif file_name.endswith(".docx"):
            loader = UnstructuredWordDocumentLoader(file_path)
            docs = loader.load()
            text = "\n".join([d.page_content for d in docs])
        else:
            print(f"Unsupported file type: {file_name}")
            continue

        chunks = splitter.split_text(text)
        print(f"Generated {len(chunks)} chunks for {file_name}. Uploading to Supabase...")

        for chunk in chunks:
            embedding = get_jina_embedding(chunk)

            data = {
                "content": chunk,
                "metadata": {"source": file_name},
                "embedding": embedding
            }

            supabase.table("documents").insert(data).execute()

    print("Ingestion complete!")

if __name__ == "__main__":
    ingest()
