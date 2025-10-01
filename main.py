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
        gemini_model = genai.GenerativeModel(model_name='gemini-2.5-flash')
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
    
    # Input validation
    if not user_prompt or not user_prompt.strip():
        raise HTTPException(status_code=400, detail="Please provide a valid prompt.")
    
    # Check if the prompt is too short or lacks substance
    stripped_prompt = user_prompt.strip()
    if len(stripped_prompt) < 20:
        raise HTTPException(
            status_code=400, 
            detail="Your prompt is too short. Please provide a detailed description of your CTF challenge steps."
        )
    
    # Check for common meaningless inputs
    meaningless_inputs = ['test', 'hi', 'hello', 'hey', 'testing', 'example', 'sample']
    if stripped_prompt.lower() in meaningless_inputs:
        raise HTTPException(
            status_code=400,
            detail="Please provide a meaningful CTF writeup prompt with actual challenge steps, not just a test message."
        )
    
    # Check if the prompt contains at least some CTF-relevant content indicators
    # This is a basic check - you can expand this list
    has_ctf_indicators = any(keyword in stripped_prompt.lower() for keyword in [
        'challenge', 'flag', 'ctf', 'exploit', 'vulnerability', 'pwn', 'reverse',
        'web', 'crypto', 'forensic', 'binary', 'payload', 'script', 'command',
        'server', 'file', 'code', 'analyze', 'decode', 'bypass', 'leak', 'scan'
    ])
    
    # Also check for placeholder tags which indicate structured input
    has_placeholders = '[[' in stripped_prompt and ']]' in stripped_prompt
    
    if not has_ctf_indicators and not has_placeholders:
        raise HTTPException(
            status_code=400,
            detail="Your prompt doesn't seem to contain CTF-related content. Please provide steps from a CTF challenge with technical details."
        )

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
    
import base64
import uuid
import zipfile
from pathlib import Path
import shutil
from fastapi.responses import FileResponse
import pypandoc

# --- FastAPI Application ---

from fastapi.middleware.cors import CORSMiddleware

# Create a temporary directory for images
TEMP_IMAGE_DIR = Path('temp_images')
TEMP_IMAGE_DIR.mkdir(exist_ok=True)

app = FastAPI(
    title="CTF Writeup Generator API",
    description="An API to generate CTF writeups from user prompts using RAG and Gemini.",
    version="1.0.0"
)

# --- CORS Middleware ---

# This allows the frontend (running on a different origin) to communicate with the backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", "http://localhost:8000", "http://127.0.0.1:8000", "http://localhost:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    prompt: str
    mappings: dict
    category: str = "Web Exploitation" # Default category

class GenerateResponse(BaseModel):
    generated_text: str
    session_id: str

class DownloadRequest(BaseModel):
    session_id: str
    markdown_content: str

def replace_placeholders(text: str, mappings: dict, session_id: str) -> str:
    """Replaces image and code placeholders with markdown-formatted content."""
    session_dir = TEMP_IMAGE_DIR / session_id
    session_dir.mkdir(exist_ok=True)

    for placeholder, content in mappings.items():
        if placeholder.startswith("[[img"):
            try:
                # Decode the base64 string
                header, data = content.split(',', 1)
                image_data = base64.b64decode(data)
                
                # Get the file extension
                file_ext = header.split('/')[1].split(';')[0]
                
                # Create a unique filename
                image_filename = f"{str(uuid.uuid4())}.{file_ext}"
                image_path = session_dir / image_filename
                
                # Save the image
                with open(image_path, "wb") as f:
                    f.write(image_data)
                
                # Replace placeholder with relative path
                text = text.replace(placeholder, f"![{placeholder}]({session_id}/{image_filename})")

            except Exception as e:
                print(f"[ERROR] Failed to process image {placeholder}: {e}")
                # Replace with a broken image link if processing fails
                text = text.replace(placeholder, f"![{placeholder} (processing failed)]()")

        elif placeholder.startswith("[[code"):
            # Format code into a markdown code block
            text = text.replace(placeholder, f"```\n{content}\n```")
    return text

@app.post("/generate", response_model=GenerateResponse)
async def generate_writeup(request: GenerateRequest):
    """
    Receives a user prompt, finds relevant examples, generates a CTF writeup,
    and replaces placeholders.
    """
    print(f"Received request for category: {request.category}")
    
    session_id = str(uuid.uuid4())

    # 1. Find few-shot examples using the RAG pipeline
    few_shot_examples = find_few_shot_examples(request.prompt, request.category)
    
    # 2. Generate the initial writeup with placeholders
    generated_text_with_placeholders = generate_with_gemini(request.prompt, few_shot_examples)
    
    # 3. Replace placeholders with actual content
    final_generated_text = replace_placeholders(generated_text_with_placeholders, request.mappings, session_id)
    
    # 4. Return the final text and the session ID
    return {
        "generated_text": final_generated_text,
        "session_id": session_id
    }

@app.post("/download-package")
async def download_package(request: DownloadRequest):
    session_dir = TEMP_IMAGE_DIR / request.session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found.")

    zip_path = TEMP_IMAGE_DIR / f"{request.session_id}.zip"
    with zipfile.ZipFile(zip_path, 'w') as zipf:
        # Write the markdown file
        zipf.writestr("writeup.md", request.markdown_content)
        # Add images to the zip file
        for image_file in session_dir.glob("*"):
            zipf.write(image_file, arcname=f"{request.session_id}/{image_file.name}")

    # Do NOT delete session_dir here, so docx download works after zip
    # Cleanup can be done later or via a scheduled job

    return FileResponse(zip_path, media_type='application/zip', filename='writeup_package.zip')

@app.post("/download-docx")
async def download_docx(request: DownloadRequest):
    session_dir = TEMP_IMAGE_DIR / request.session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="Session not found.")

    # Create a temporary markdown file
    temp_md_path = TEMP_IMAGE_DIR / f"{request.session_id}.md"
    with open(temp_md_path, "w", encoding="utf-8") as f:
        f.write(request.markdown_content)

    # Convert to docx
    output_docx_path = TEMP_IMAGE_DIR / f"{request.session_id}.docx"
    try:
        pypandoc.convert_file(
            str(temp_md_path),
            'docx',
            outputfile=str(output_docx_path),
            extra_args=[f'--resource-path={str(TEMP_IMAGE_DIR)}']
        )
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Pandoc not installed: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to convert to DOCX: {e}")

    # Clean up the temp markdown file
    os.remove(temp_md_path)

    return FileResponse(output_docx_path, media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename='writeup.docx')

@app.get("/")
async def root():
    return {"status": "CTF Writeup Generator API is running."}

# --- Main Execution ---

if __name__ == "__main__":
    print("Starting FastAPI server...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
