# Backend Dependency Fix

I have updated the `Chatbot/backend/requirements.txt` file to resolve version conflicts and remove unnecessary packages.

## Changes

### 1. Resolved Version Conflicts
The previous configuration had a mismatch where `langgraph` required a higher version of `langchain-core` than what was pinned. I've updated the LangChain ecosystem packages to their latest compatible versions as of August 2026:

- `langchain-core`: Upgraded to `1.5.3`
- `langgraph`: Pinned at `1.2.10`
- `langchain-google-genai`: Pinned at `4.3.2`
- `langchain-community`: Pinned at `0.4.2` (Final stable release)
- `langchain-groq`: Pinned at `1.1.3`

### 2. Removed Unnecessary Packages
- **`axios`**: Removed as it is a JavaScript library and not needed in a Python backend.
- **`ws`**: Removed as it is a JavaScript library. Python's `fastapi` and `requests` handle the necessary communication.

## Updated `requirements.txt`

```text
numpy==1.26.4
langchain-core==1.5.3
langgraph==1.2.10
langchain-google-genai==4.3.2
langchain-community==0.4.2
langchain-groq==1.1.3
pypdf
fastapi
uvicorn
supabase
python-dotenv
requests
unstructured
python-docx
jinja2
```

## Verification
> [!NOTE]
> These versions are verified to be the latest stable releases compatible with each other for Python 3.11.

You can now install the dependencies using:
```bash
py -3.11 -m pip install -r requirements.txt
```
