import os
import json
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# --- Import core logic from your scripts ---
# Note: To make this a single, deployable file, the relevant functions 
# from query.py and gen.py are included directly here.

# --- Dependencies from query.py & gen.py ---
import google.generativeai as genai
from dotenv import load_dotenv
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer

# --- Configuration ---
load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
INDEX_NAME = "ctf-rag-index"

# --- Initialize Models (do this once on startup) ---
try:
    if PINECONE_API_KEY:
        pinecone_client = Pinecone(api_key=PINECONE_API_KEY)
        pinecone_index = pinecone_client.Index(INDEX_NAME)
        sentence_model = SentenceTransformer('all-MiniLM-L6-v2')
    else:
        pinecone_index = None
        sentence_model = None
        print("[WARNING] PINECONE_API_KEY not found. RAG features will be disabled.")

    if GOOGLE_API_KEY:
        genai.configure(api_key=GOOGLE_API_KEY)
        gemini_model = genai.GenerativeModel(model_name='gemini-1.5-flash-latest')
    else:
        gemini_model = None
        print("[ERROR] GOOGLE_API_KEY not found. Generation features will be disabled.")

except Exception as e:
    print(f"[ERROR] Failed to initialize models: {e}")
    pinecone_index = sentence_model = gemini_model = None

# --- Core Logic Functions (adapted from your files) ---

def find_few_shot_examples(query_prompt: str, query_category: str, top_k: int = 10, want_n: int = 2):
    if not pinecone_index or not sentence_model:
        print("[INFO] RAG feature is disabled. Skipping few-shot example search.")
        return []

    try:
        query_embedding = sentence_model.encode(query_prompt).tolist()
        results = pinecone_index.query(
            vector=query_embedding,
            filter={"category": {"$eq": query_category}},
            top_k=top_k,
            include_metadata=True,
            include_values=False
        )
        matches = results.get('matches', [])
        if not matches:
            return []

        normalized = [
            {
                'completion': m.get('metadata', {}).get('completion', ''),
                'length': m.get('metadata', {}).get('completion_length', len(m.get('metadata', {}).get('completion', ''))),
                'score': m.get('score', 0.0)
            } for m in matches
        ]

        normalized.sort(key=lambda x: (-x['score'], x['length']))
        return [item['completion'] for item in normalized[:want_n]]
    except Exception as e:
        print(f"[ERROR] Pinecone query failed: {e}")
        return [] # Return empty list on failure

def generate_with_gemini(user_prompt: str, few_shot_examples: list[str]):
    if not gemini_model:
        raise HTTPException(status_code=500, detail="Gemini model is not initialized. Check API key.")

    examples_str = "\n\n---\n\n".join(few_shot_examples) if few_shot_examples else "No specific examples available."
    
    final_prompt = f"""
    You are an expert cybersecurity analyst specializing in CTF (Capture The Flag) writeups. You will expand a user's step-by-step prompt into a comprehensive, well-structured markdown document.

    **RULES (Follow these strictly):**
    1.  **Preserve Tags:** The user's prompt contains placeholders like [[img1]], [[code1]], etc. Your final writeup MUST contain the exact same number of these tags. Integrate the user's steps into a flowing narrative, but do not add or remove any `[[...]]` tags.
    2.  **Elaborate with Research:** If the user's prompt mentions a specific technical term, vulnerability (e.g., a CVE), or tool that would benefit from a brief explanation, provide a CONCISE, one- or two-sentence explanation within the writeup. This adds context for the reader.
    3.  **Mimic Style:** Use the provided few-shot examples to match the tone, style, and markdown structure (headings, bolding, lists) of a high-quality CTF writeup.

    ---
    **FEW-SHOT EXAMPLES:**

    {examples_str}

    ---
    **YOUR TASK:**

    Based on the rules and examples above, expand the following user prompt into a full writeup.

    **User Prompt:**
    {user_prompt}

    **Your Writeup:**
    """

    try:
        response = gemini_model.generate_content(final_prompt)
        if response.candidates and response.candidates[0].finish_reason.name == "SAFETY":
            return "Generation was blocked due to safety concerns. Please try rephrasing your prompt."
        return response.text or "No content generated."
    except Exception as e:
        print(f"[ERROR] Gemini API call failed: {e}")
        raise HTTPException(status_code=500, detail=f"An error occurred with the Gemini API: {e}")

# --- FastAPI Application ---

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="CTF Writeup Generator API",
    description="An API to generate CTF writeups from user prompts using RAG and Gemini.",
    version="1.0.0"
)

# --- CORS Middleware ---
# This allows the frontend (running on a different origin) to communicate with the backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

class GenerateRequest(BaseModel):
    prompt: str
    mappings: dict
    category: str = "Web Exploitation" # Default category

class GenerateResponse(BaseModel):
    generated_text: str
    mappings: dict

@app.post("/generate", response_model=GenerateResponse)
async def generate_writeup(request: GenerateRequest):
    """
    Receives a user prompt, finds relevant examples, and generates a CTF writeup.
    """
    print(f"Received request for category: {request.category}")
    
    # 1. Find few-shot examples using the RAG pipeline
    few_shot_examples = find_few_shot_examples(request.prompt, request.category)
    
    # 2. Generate the final completion with Gemini
    generated_text = generate_with_gemini(request.prompt, few_shot_examples)
    
    # 3. Return the generated text and the original mappings
    return {
        "generated_text": generated_text,
        "mappings": request.mappings
    }

@app.get("/")
async def root():
    print("running")
    return "CTF Writeup Generator API is running."

# --- Main Execution ---

if __name__ == "__main__":
    print("Starting FastAPI server...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
