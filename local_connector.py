import os
import subprocess
from fastapi import FastAPI, HTTPException, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

app = FastAPI(title="AI-OS Local Connector")

# Simple security
API_KEY = os.getenv("LOCAL_CONNECTOR_KEY", "default-dev-key")
api_key_header = APIKeyHeader(name="X-API-Key")

def get_api_key(api_key: str = Security(api_key_header)):
    if api_key != API_KEY:
        raise HTTPException(status_code=403, detail="Could not validate credentials")
    return api_key

class CommandRequest(BaseModel):
    command: str
    args: list[str] = []
    cwd: str = "."

@app.get("/health")
def health():
    return {"status": "ok", "service": "ai-os-local-connector"}

@app.post("/execute")
def execute_command(req: CommandRequest, key: str = Security(get_api_key)):
    """
    Executes a safe subset of local commands on behalf of the AI-OS backend.
    WARNING: In a production setup, this must be strictly sandboxed.
    """
    allowed_commands = {"ls", "echo", "git", "npm", "python"}
    if req.command not in allowed_commands:
        raise HTTPException(status_code=400, detail=f"Command {req.command} not allowed")

    try:
        result = subprocess.run(
            [req.command, *req.args],
            cwd=req.cwd,
            capture_output=True,
            text=True,
            timeout=30
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Run with: uvicorn local_connector:app --reload --port 8000
