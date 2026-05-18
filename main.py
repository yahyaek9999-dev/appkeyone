import os
import uuid
import time
import asyncio
import threading
import json
import re
from typing import Optional
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware


API_SECRET_KEY = os.getenv("API_SECRET_KEY", "change-secret-key-2026")


class AsyncBrowserThread(threading.Thread):
    """
    Keeps a single persistent ChatGPT tab open and reuses it across requests.
    Detects when assistant generation is finished by watching the Stop button.
    Performs a "New chat" via JS click every N requests to avoid accumulating
    long conversation context (which slows ChatGPT down over time).
    """

    NEW_CHAT_EVERY = 20  # start a fresh chat every N requests to avoid context bloat

    def __init__(self):
        super().__init__(daemon=True)
        self.loop = asyncio.new_event_loop()
        self.ready_event = threading.Event()
        self.playwright = None
        self.context = None
        self.page = None
        self._lock = None
        self._request_count = 0

    def run(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_until_complete(self._start_browser())
        self.ready_event.set()
        print("[LITE-SERVER] ready")
        self.loop.run_forever()

    async def _start_browser(self):
        # CloakBrowser: stealth Chromium with C++ patches that bypass Cloudflare,
        # FingerprintJS, and bot-detection systems. Drop-in replacement for Playwright.
        from cloakbrowser import launch_persistent_context_async
        profile_dir = os.getenv("CHROME_PROFILE_DIR", os.path.join(os.getcwd(), "chrome-profile"))
        os.makedirs(profile_dir, exist_ok=True)
        self.context = await launch_persistent_context_async(
            profile_dir,
            headless=True,
            humanize=True,
        )
        self._lock = asyncio.Lock()
        await self._open_chat_tab()

    async def _open_chat_tab(self):
        if self.page is not None:
            try:
                await self.page.close()
            except Exception:
                pass
        self.page = await self.context.new_page()
        self.page.set_default_timeout(90000)
        await self.page.goto("https://chatgpt.com/", wait_until="domcontentloaded")
        try:
            await self.page.wait_for_selector('#prompt-textarea', timeout=45000)
            print("[LITE-SERVER] chat tab ready")
        except Exception as e:
            print(f"[LITE-SERVER] open_chat_tab wait_for_selector failed: {e}")
            await self._dump_diag("open_chat_tab")

    async def _dump_diag(self, tag: str):
        """Save screenshot + HTML + URL/title to ./diag/ for debugging selector failures."""
        try:
            diag_dir = os.path.join(os.getcwd(), "diag")
            os.makedirs(diag_dir, exist_ok=True)
            ts = int(time.time())
            base = os.path.join(diag_dir, f"{ts}-{tag}")
            try:
                url = self.page.url
            except Exception:
                url = "?"
            try:
                title = await self.page.title()
            except Exception:
                title = "?"
            try:
                html = await self.page.content()
            except Exception:
                html = ""
            try:
                await self.page.screenshot(path=f"{base}.png", full_page=True)
            except Exception as se:
                print(f"[LITE-SERVER] diag screenshot failed: {se}")
            with open(f"{base}.html", "w", encoding="utf-8") as f:
                f.write(f"<!-- url={url} title={title} -->\n")
                f.write(html)
            # Probe known selectors so we can see at-a-glance what's present
            probes = {
                "#prompt-textarea": False,
                'div[contenteditable="true"]': False,
                'textarea[name="prompt-textarea"]': False,
                '[data-testid="login-button"]': False,
                'button:has-text("Log in")': False,
                'button:has-text("Stay logged out")': False,
                '#challenge-form': False,
                '[data-cf-beacon]': False,
            }
            for sel in list(probes.keys()):
                try:
                    el = await self.page.query_selector(sel)
                    probes[sel] = el is not None
                except Exception:
                    probes[sel] = False
            print(f"[LITE-SERVER] DIAG {tag}: url={url} title={title!r}")
            print(f"[LITE-SERVER] DIAG probes: {probes}")
            print(f"[LITE-SERVER] DIAG saved: {base}.png  {base}.html")
        except Exception as e:
            print(f"[LITE-SERVER] diag dump failed: {e}")

    async def _new_chat(self):
        """Start a fresh chat. Try JS click first; fall back to fast SPA navigation."""
        try:
            method = await self.page.evaluate(
                """() => {
                    const sels = [
                        '[data-testid="create-new-chat-button"]',
                        'a[href="/"][aria-label*="New"]',
                        'button[aria-label*="New chat" i]',
                    ];
                    for (const s of sels) {
                        const el = document.querySelector(s);
                        if (el) { el.click(); return s; }
                    }
                    window.history.pushState({}, '', '/');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                    return 'history-push';
                }"""
            )
            # Wait briefly for assistant messages to clear OR composer to be ready
            ts = time.time()
            while time.time() - ts < 5:
                msgs = await self.page.query_selector_all('[data-message-author-role="assistant"]')
                if len(msgs) == 0:
                    return True
                await asyncio.sleep(0.15)
            # If old conversation didn't clear via JS, do a fast reload
            await self.page.goto("https://chatgpt.com/", wait_until="domcontentloaded", timeout=20000)
            await self.page.wait_for_selector('#prompt-textarea', timeout=15000)
            return True
        except Exception as e:
            print(f"[LITE-SERVER] new_chat error: {e}; reopening tab")
            await self._open_chat_tab()
            return False

    async def _send_and_wait(self, prompt: str):
        page = self.page
        # remember how many assistant messages exist BEFORE we send
        msgs = await page.query_selector_all('[data-message-author-role="assistant"]')
        prev = len(msgs)

        # Make sure composer is ready
        try:
            await page.wait_for_selector('#prompt-textarea', timeout=30000)
        except Exception as e:
            await self._dump_diag("send_wait_composer")
            raise

        # Inject text via JS (instant) instead of humanized char-by-char typing.
        # ChatGPT's composer is a contenteditable ProseMirror, so we use the
        # InputEvent API to make React register the change.
        await page.evaluate(
            """(text) => {
                const el = document.querySelector('#prompt-textarea');
                el.focus();
                // clear existing content
                el.innerHTML = '';
                // insert text using the InputEvent path React listens to
                document.execCommand('insertText', false, text);
                el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
            }""",
            prompt,
        )
        await page.keyboard.press('Enter')

        # Wait for new assistant bubble
        deadline = time.time() + 60
        while time.time() < deadline:
            msgs = await page.query_selector_all('[data-message-author-role="assistant"]')
            if len(msgs) > prev:
                break
            await asyncio.sleep(0.1)
        else:
            raise Exception("timeout waiting for new assistant message")

        # End-of-generation detection via Stop button
        stop_sel = 'button[data-testid="stop-button"], [aria-label*="Stop"]'
        last = ""
        stable = 0
        end_deadline = time.time() + 90
        while time.time() < end_deadline:
            stop_btn = await page.query_selector(stop_sel)
            msgs = await page.query_selector_all('[data-message-author-role="assistant"]')
            cur = (await msgs[-1].inner_text()) if msgs else ""
            if not stop_btn and cur.strip() and cur == last:
                stable += 1
                if stable >= 2:
                    return cur.strip()
            else:
                last = cur
                stable = 0
            await asyncio.sleep(0.15)
        return last.strip() or "..."

    async def _talk_to_chatgpt(self, prompt: str):
        async with self._lock:
            self._request_count += 1
            # periodically start a new chat to keep ChatGPT fast
            if self._request_count > 1 and (self._request_count - 1) % self.NEW_CHAT_EVERY == 0:
                await self._new_chat()
            try:
                return await self._send_and_wait(prompt)
            except Exception as e:
                print(f"[LITE-SERVER] error, recovering: {e}")
                try:
                    await self._new_chat()
                except Exception:
                    await self._open_chat_tab()
                return await self._send_and_wait(prompt)

    def process_request(self, prompt: str):
        if not self.ready_event.wait(timeout=60):
            raise Exception("Error From Browser")
        future = asyncio.run_coroutine_threadsafe(self._talk_to_chatgpt(prompt), self.loop)
        return future.result(timeout=150)

browser_engine = AsyncBrowserThread()
browser_engine.start()

# ====================================================================
# Smart Prompt Builder
# ====================================================================
def format_prompt(messages, tools=None):
    parts = []
    system_parts = []
    has_tool_results = False
    user_question = ""
    
    for msg in messages:
        role = msg.get("role", "")
        msg_type = msg.get("type", "")
        content = msg.get("content", "")
        
        if isinstance(content, list):
            text_parts = []
            for item in content:
                if isinstance(item, dict):
                    text_parts.append(item.get("text", item.get("content", str(item))))
                else:
                    text_parts.append(str(item))
            content = "\n".join(text_parts)
        
        if role == "system":
            system_parts.append(content)
        elif role == "tool":
            has_tool_results = True
            tool_name = msg.get("name", "tool")
            parts.append(f"[TOOL RESULT from '{tool_name}']:\n{content}")
        elif msg_type == "function_call_output":
            has_tool_results = True
            call_id = msg.get("call_id", "")
            output_content = msg.get("output", content)
            parts.append(f"[TOOL RESULT (call_id: {call_id})]:\n{output_content}")
        elif msg_type == "function_call":
            func_name = msg.get("name", "?")
            func_args = msg.get("arguments", "{}")
            parts.append(f"[PREVIOUS TOOL CALL: Called '{func_name}' with arguments: {func_args}]")
        elif role == "assistant":
            assistant_content = content if content else ""
            tool_calls_in_msg = msg.get("tool_calls", [])
            if tool_calls_in_msg:
                tc_descriptions = []
                for tc in tool_calls_in_msg:
                    func = tc.get("function", {})
                    tc_descriptions.append(f"Called '{func.get('name', '?')}' with: {func.get('arguments', '{}')}")
                assistant_content += "\n[Previous tool calls: " + "; ".join(tc_descriptions) + "]"
            if assistant_content.strip():
                parts.append(f"[Assistant]: {assistant_content}")
        elif role == "user" or (msg_type == "message" and role != "system"):
            user_question = content
            parts.append(content)
            has_tool_results = False
        elif content:
            parts.append(content)
    
    final = ""
    
    if system_parts:
        if tools and not has_tool_results:
            final += "=== YOUR ROLE ===\n"
            final += "\n\n".join(system_parts)
            final += "\n=== END OF ROLE ===\n\n"
        else:
            final += "=== SYSTEM INSTRUCTIONS (FOLLOW STRICTLY) ===\n"
            final += "\n\n".join(system_parts)
            final += "\n=== END OF INSTRUCTIONS ===\n\n"
    
    if tools and not has_tool_results:
        final += format_tools_instruction(tools, user_question)
    
    if has_tool_results:
        final += "=== CONTEXT FROM TOOLS ===\n"
        final += "The following information was retrieved by the tools you requested.\n"
        final += "Use ONLY this information to answer the user's question.\n\n"
    
    if parts:
        final += "\n".join(parts)
    
    if has_tool_results:
        final += "\n\n=== INSTRUCTION ===\n"
        final += "Now answer the user's question based ONLY on the tool results above.\n"
    
    return final

def format_tools_instruction(tools, user_question=""):
    instruction = "\n=== MANDATORY TOOL USAGE ===\n"
    instruction += "You MUST use one of the tools below to answer this question.\n"
    instruction += "Do NOT answer directly. Do NOT say you don't have information.\n"
    instruction += "You MUST respond with ONLY a JSON object to call the tool.\n\n"
    
    instruction += "RESPONSE FORMAT - respond with ONLY this JSON, nothing else:\n"
    instruction += '{"tool_calls": [{"name": "TOOL_NAME", "arguments": {"param": "value"}}]}\n\n'
    
    instruction += "RULES:\n"
    instruction += "- Your ENTIRE response must be valid JSON only\n"
    instruction += "- No markdown, no code blocks, no explanation\n"
    instruction += "- No text before or after the JSON\n\n"
    
    instruction += "Available tools:\n\n"
    
    for tool in tools:
        func = tool.get("function", tool)
        name = func.get("name", "unknown")
        desc = func.get("description", "No description")
        params = func.get("parameters", {})
        
        instruction += f"Tool: {name}\n"
        instruction += f"Description: {desc}\n"
        
        if params.get("properties"):
            instruction += "Parameters:\n"
            required_params = params.get("required", [])
            for param_name, param_info in params["properties"].items():
                param_type = param_info.get("type", "string")
                param_desc = param_info.get("description", "")
                is_required = "required" if param_name in required_params else "optional"
                instruction += f"  - {param_name} ({param_type}, {is_required}): {param_desc}\n"
        instruction += "\n"
    
    instruction += "=== END OF TOOLS ===\n\n"
    
    first_tool = tools[0] if tools else {}
    first_func = first_tool.get("function", first_tool)
    first_name = first_func.get("name", "tool")
    
    instruction += f'EXAMPLE: If the user asks a question, respond with:\n'
    instruction += '{"tool_calls": [{"name": "' + first_name + '", "arguments": {"input": "the user question here"}}]}\n\n'
    
    instruction += "Now respond with the JSON to call the appropriate tool:\n\n"
    return instruction

def parse_tool_calls(response_text):
    cleaned = response_text.strip()
    if "```" in cleaned:
        code_block_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?\s*```', cleaned, re.DOTALL)
        if code_block_match:
            cleaned = code_block_match.group(1).strip()
    
    json_candidates = [cleaned]
    json_match = re.search(r'\{[\s\S]*"tool_calls"[\s\S]*\}', cleaned)
    if json_match:
        json_candidates.append(json_match.group(0))
    
    for candidate in json_candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict) and "tool_calls" in parsed:
                raw_calls = parsed["tool_calls"]
                if isinstance(raw_calls, list) and len(raw_calls) > 0:
                    formatted_calls = []
                    for call in raw_calls:
                        tool_name = call.get("name", "")
                        arguments = call.get("arguments", {})
                        if isinstance(arguments, dict):
                            arguments_str = json.dumps(arguments, ensure_ascii=False)
                        else:
                            arguments_str = str(arguments)
                        
                        formatted_calls.append({
                            "id": f"call_{uuid.uuid4().hex[:24]}",
                            "type": "function",
                            "function": {
                                "name": tool_name,
                                "arguments": arguments_str
                            }
                        })
                    return formatted_calls
        except (json.JSONDecodeError, TypeError, KeyError):
            continue
    return None

# ====================================================================
# FastAPI App
# ====================================================================
app = FastAPI(title="mse_ai_api for n8n")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
if os.path.isdir(_WEB_DIR):
    app.mount("/chat", StaticFiles(directory=_WEB_DIR, html=True), name="chat")

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):

    try:
        data = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": {"message": "Invalid JSON payload"}})
    
    authorization = request.headers.get("authorization", "")

    if not authorization or authorization.replace("Bearer ", "").strip() != API_SECRET_KEY:
        return JSONResponse(status_code=401, content={"error": {"message": "Invalid API Key"}})

    messages = data.get("messages", [])
    if not messages:
        return JSONResponse(status_code=400, content={"error": {"message": "messages field is required"}})
        
    try:
        tools = data.get("tools", None)
        prompt = format_prompt(messages, tools=tools)
        
        start_time = time.time()
        print(f"[LITE-SERVER]..... ({len(prompt)} len)")
        
        response_text = browser_engine.process_request(prompt)
        
        p_tokens = len(prompt.split())
        c_tokens = len(response_text.split())
        
        tool_calls = None
        if tools:
            tool_calls = parse_tool_calls(response_text)

        if tool_calls:
            return {
                "id": f"chatcmpl-{uuid.uuid4().hex[:29]}",
                "object": "chat.completion",
                "created": int(start_time),
                "model": data.get("model", "gpt-4o-mini"),
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": tool_calls
                    },
                    "finish_reason": "tool_calls"
                }],
                "usage": {
                    "prompt_tokens": p_tokens,
                    "completion_tokens": c_tokens,
                    "total_tokens": p_tokens + c_tokens
                }
            }
        else:
            return {
                "id": f"chatcmpl-{uuid.uuid4().hex[:29]}",
                "object": "chat.completion",
                "created": int(start_time),
                "model": data.get("model", "gpt-4o-mini"),
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": response_text},
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": p_tokens,
                    "completion_tokens": c_tokens,
                    "total_tokens": p_tokens + c_tokens
                }
            }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/v1/responses")
async def responses(request: Request):

    try:
        data = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": {"message": "Invalid JSON payload"}})
        
    authorization = request.headers.get("authorization", "")
    if not authorization or authorization.replace("Bearer ", "").strip() != API_SECRET_KEY:
        return JSONResponse(status_code=401, content={"error": {"message": "Invalid API Key"}})

    input_data = data.get("input", "")
    if isinstance(input_data, str):
        messages = [{"role": "user", "content": input_data}]
    elif isinstance(input_data, list):
        messages = input_data
    else:
        messages = data.get("messages", [])

    if not messages:
        return JSONResponse(status_code=400, content={"error": {"message": "input field is required"}})

    try:
        tools = data.get("tools", None)
        instructions = data.get("instructions", "")
        if instructions:
            messages.insert(0, {"role": "system", "content": instructions})
            
        prompt = format_prompt(messages, tools=tools)
        start_time = time.time()
        
        response_text = browser_engine.process_request(prompt)
        p_tokens = len(prompt.split())
        c_tokens = len(response_text.split())

        tool_calls = None
        if tools:
            tool_calls = parse_tool_calls(response_text)

        if tool_calls:
            output_items = []
            for tc in tool_calls:
                output_items.append({
                    "type": "function_call",
                    "id": tc["id"],
                    "call_id": tc["id"],
                    "name": tc["function"]["name"],
                    "arguments": tc["function"]["arguments"],
                    "status": "completed"
                })
            
            return {
                "id": f"resp-{uuid.uuid4().hex[:29]}",
                "object": "response",
                "created_at": int(start_time),
                "model": data.get("model", "gpt-4o-mini"),
                "status": "completed",
                "output": output_items,
                "usage": {
                    "input_tokens": p_tokens,
                    "output_tokens": c_tokens,
                    "total_tokens": p_tokens + c_tokens
                }
            }
        else:
            return {
                "id": f"resp-{uuid.uuid4().hex[:29]}",
                "object": "response",
                "created_at": int(start_time),
                "model": data.get("model", "gpt-4o-mini"),
                "status": "completed",
                "output": [
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "output_text", "text": response_text}]
                    }
                ],
                "usage": {
                    "input_tokens": p_tokens,
                    "output_tokens": c_tokens,
                    "total_tokens": p_tokens + c_tokens
                }
            }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/v1/models")
async def list_models():

    return {
        "object": "list",
        "data": [{"id": "gpt-4o-mini", "object": "model", "owned_by": "mse_ai_api"}]
    }

@app.get("/")
async def health_check():
    return {"status": "running", "message": "mse_ai_api Server is active!"}


_BOOT_TS = time.time()

@app.get("/healthz")
async def healthz():
    # Cheap liveness/readiness probe that does NOT touch Playwright.
    # Returns 200 only when uvicorn is serving AND the background browser
    # thread has signaled ready_event. When the browser worker is dead or
    # still initializing, returns 503 so a watchdog can act on it.
    browser_ready = False
    try:
        browser_ready = bool(
            browser_engine is not None
            and browser_engine.ready_event is not None
            and browser_engine.ready_event.is_set()
            and browser_engine.is_alive()
        )
    except Exception:
        browser_ready = False

    body = {
        "status": "ok" if browser_ready else "degraded",
        "browser_ready": browser_ready,
        "uptime_s": int(time.time() - _BOOT_TS),
    }
    return JSONResponse(status_code=200 if browser_ready else 503, content=body)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7777)
