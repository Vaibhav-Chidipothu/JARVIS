import os
from pathlib import Path

import requests
from flask import Flask, jsonify, request, send_from_directory

from prompt import AGENT_INSTRUCTION

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__, static_folder=str(BASE_DIR))


def ask_gemini(message: str) -> str:
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        return "Backend connected, Sir. Add GOOGLE_API_KEY to .env for live Gemini replies."

    response = requests.post(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        params={"key": api_key},
        json={
            "system_instruction": {"parts": [{"text": AGENT_INSTRUCTION}]},
            "contents": [{"role": "user", "parts": [{"text": message}]}],
            "generationConfig": {"temperature": 0.9, "maxOutputTokens": 300},
        },
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    return data["candidates"][0]["content"]["parts"][0]["text"].strip()


@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "jarvis.html")


@app.get("/jarvis.css")
def stylesheet():
    return send_from_directory(BASE_DIR, "jarvis .css")


@app.get("/jarvis.js")
def javascript():
    return send_from_directory(BASE_DIR, "jarvis.js")


@app.get("/arc_reactor.png")
def reactor_image():
    return send_from_directory(BASE_DIR, "arc_reactor.png")


@app.get("/api/weather")
def weather():
    city = request.args.get("city", "Chennai").strip() or "Chennai"
    try:
        response = requests.get(
            "https://wttr.in/" + requests.utils.quote(city) + "?format=j1",
            headers={"User-Agent": "JARVIS/1.0"},
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        current = data["current_condition"][0]
        area = data["nearest_area"][0]
        return jsonify({
            "city": f'{area["areaName"][0]["value"]}, {area["country"][0]["value"]}',
            "temperature": current["temp_C"],
            "feels_like": current["FeelsLikeC"],
            "description": current["weatherDesc"][0]["value"],
            "humidity": current["humidity"],
            "wind": current["windspeedKmph"],
        })
    except (requests.RequestException, ValueError, KeyError, IndexError, TypeError):
        app.logger.exception("Weather request failed")
        return jsonify({"error": "Weather service is unavailable."}), 502


@app.get("/api/health")
def health():
    return jsonify({"status": "online", "model_configured": bool(os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"))})


@app.post("/api/chat")
def chat():
    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message", "")).strip()
    if not message:
        return jsonify({"error": "Message is required."}), 400
    try:
        return jsonify({"reply": ask_gemini(message)})
    except requests.RequestException:
        app.logger.exception("Gemini request failed")
        return jsonify({"error": "The AI service could not be reached."}), 502
    except (KeyError, IndexError, TypeError, ValueError):
        app.logger.exception("Unexpected Gemini response")
        return jsonify({"error": "The AI service returned an invalid response."}), 502


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=True)
