import urllib.request
import urllib.error
import json
import uuid
import time

BASE_URL = "http://127.0.0.1:3000"
HEADERS = {"Origin": "http://127.0.0.1:3000", "Content-Type": "application/json"}

def req(method, path, data=None, cookie=None):
    url = f"{BASE_URL}{path}"
    req_headers = dict(HEADERS)
    if cookie:
        req_headers["Cookie"] = cookie
    
    body = json.dumps(data).encode("utf-8") if data else None
    request = urllib.request.Request(url, data=body, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except:
            return e.code, {"error": "unparseable"}
    except Exception as e:
        return 0, {"error": str(e)}

print("--- ATTACK SIMULATION START ---")

print("\n1. Testing Cookie Rotation Spam (POST /api/reviews)")
print("Attempting to bypass rate limits by simulating session clears...")
# Warm up a valid session by getting a cookie first
status, res = req("GET", f"/api/reviews?unitCode=DATA1001")

# The server requires a signed cookie. If we just send a random cookie, it's age=0 and rejected.
print("Trying with a forged/random session cookie...")
fake_cookie = f"session_id={uuid.uuid4()}"
status, res = req("POST", "/api/reviews", {
    "unitCode": "DATA1001",
    "title": "Spam Review", "coordinatorName": "A", "lecturerName": "B", 
    "year": 2026, "content": "Spam content "*5, "grade": "P",
    "ratingContent": 3, "ratingWorkload": 3, "ratingExamDifficulty": 3, "ratingFinalResult": 3
}, cookie=fake_cookie)
print(f"Status: {status} -> {res.get('error', 'Success')}")

print("\n2. Testing Summarize Flood (GET /api/reviews/summarize)")
print("Attempting to request 15 summaries rapidly with the same IP...")
successes, rate_limits = 0, 0
for i in range(15):
    s, r = req("GET", f"/api/reviews/summarize?unitCode=DATA1001")
    if s == 200: successes += 1
    elif s == 429: rate_limits += 1

print(f"Results: {successes} successful, {rate_limits} rate limited.")

print("\n3. Testing Admin Brute Force (POST /api/admin/reviews/hide)")
print("Attempting 25 rapid password guesses...")
admin_successes, admin_401s, admin_429s = 0, 0, 0
for i in range(25):
    url = f"{BASE_URL}/api/admin/reviews/hide"
    request = urllib.request.Request(url, data=b'{"reviewId":"00000000-0000-0000-0000-000000000000","hidden":true}', headers={"Origin": "http://127.0.0.1:3000", "Content-Type": "application/json", "Authorization": f"Bearer guess{i}"}, method="POST")
    try:
        with urllib.request.urlopen(request) as response:
            admin_successes += 1
    except urllib.error.HTTPError as e:
        if e.code == 401: admin_401s += 1
        elif e.code == 429: admin_429s += 1
print(f"Results: {admin_successes} successful, {admin_401s} Unauthorized, {admin_429s} Rate Limited.")

print("\n--- ATTACK SIMULATION COMPLETE ---")
