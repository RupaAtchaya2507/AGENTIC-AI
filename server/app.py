from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from zapv2 import ZAPv2
import validators
import time
import os
from collections import defaultdict
import google.generativeai as genai
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from io import BytesIO
import textwrap
from datetime import datetime

# -------------------------------
# Config
# -------------------------------
ZAP_HOST = os.environ.get('ZAP_HOST', '127.0.0.1')
ZAP_PORT = os.environ.get('ZAP_PORT', '8080')
ZAP_PROXY = f'http://{ZAP_HOST}:{ZAP_PORT}'
ZAP_API_KEY = os.environ.get('ZAP_API_KEY', None)

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")  # Gemini API key
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)

# instantiate ZAP client (include apikey if provided)
if ZAP_API_KEY:
    zap = ZAPv2(apikey=ZAP_API_KEY, proxies={'http': ZAP_PROXY, 'https': ZAP_PROXY})
else:
    zap = ZAPv2(proxies={'http': ZAP_PROXY, 'https': ZAP_PROXY})

app = Flask(__name__)
CORS(app)

# store last scan result for generating PDFs / context
last_scan = {}

# -------------------------------
# Utilities
# -------------------------------
def risk_to_score(risk):
    mapping = {"High": 9, "Medium": 6, "Low": 3, "Informational": 1, "Critical": 10}
    return mapping.get(risk, 0)

CUSTOM_SUGGESTIONS = {
    "Cross Site Scripting": "Validate and sanitize inputs. Use CSP headers and avoid inline JS.",
    "SQL Injection": "Use parameterized queries/ORM. Never concatenate user input into SQL.",
    "Insecure Cookies": "Enable HttpOnly, Secure, SameSite attributes on cookies.",
    "CSP": "Add strong Content-Security-Policy headers to block inline scripts.",
    "CORS": "Restrict allowed origins to trusted domains and avoid '*'."
}

def enrich_suggestions(alert):
    # attach a short custom suggestion when the alert name matches
    for key, suggestion in CUSTOM_SUGGESTIONS.items():
        if key.lower() in (alert.get('name') or "").lower():
            alert['extra_suggestion'] = suggestion
            break
    return alert

def simplify_alerts(alerts):
    """
    Group alerts by name and collect unique urls/params, preserving description/solution/reference.
    Works with variations in ZAP alert keys.
    """
    grouped = defaultdict(lambda: {"urls": [], "params": [], "risk": None, "description": "", "solution": "", "reference": ""})
    for a in alerts:
        name = a.get('alert') or a.get('name') or "Unknown"
        risk = a.get('risk') or a.get('riskdesc') or a.get('severity') or "Informational"
        desc = a.get('description') or a.get('desc') or a.get('evidence') or a.get('url') or ""
        solution = a.get('solution') or a.get('solutions') or ""
        reference = a.get('reference') or a.get('references') or ""

        grouped[name]["risk"] = risk
        if desc:
            grouped[name]["description"] = desc
        if solution:
            grouped[name]["solution"] = solution
        if reference:
            grouped[name]["reference"] = reference

        url = a.get('url') or a.get('uri')
        if url:
            grouped[name]["urls"].append(url)
        param = a.get('param')
        if param:
            grouped[name]["params"].append(param)

    simplified = []
    for name, info in grouped.items():
        simplified.append({
            "name": name,
            "risk": info["risk"],
            "urls": list(dict.fromkeys(info["urls"])),     # dedupe while preserving order
            "params": list(dict.fromkeys(info["params"])),
            "description": info["description"],
            "solution": info["solution"],
            "reference": info["reference"]
        })
    return simplified

# -------------------------------
# Scanning helpers
# -------------------------------
def spider_and_get_alerts(target, max_urls=10, timeout=60):
    if not target.startswith('http'):
        target = 'http://' + target
    zap.urlopen(target)
    time.sleep(1)

    spider_id = zap.spider.scan(target)
    start = time.time()
    while True:
        try:
            status = int(zap.spider.status(spider_id))
        except Exception:
            status = 0
        # stop if spider finished or timed out
        if status >= 100 or (time.time() - start) > timeout:
            break
        time.sleep(1)

    # allow ZAP to process discovered urls
    time.sleep(1)
    return zap.core.alerts(baseurl=target)

# -------------------------------
# AI helpers
# -------------------------------
def ai_analyze(findings, target, level):
    # take top findings and send to Gemini to get plain English summary + prioritized advice
    try:
        trimmed = findings[:10]
        findings_text = "\n".join([f"- {f['name']} ({f.get('risk','')}) : {f.get('description','')}" for f in trimmed])
        prompt = f"""
You are a concise security analyst. A web scan was performed on {target} with level {level}.
Findings:
{findings_text}

Please:
1) Prioritize the most severe 3 issues and explain their real-world impact in simple language.
2) Give short, practical remediation steps (show code snippets only when relevant).
3) Suggest which issues an attacker would try first.
Keep the answer short and actionable.
"""
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(prompt)
        # response.text contains the generated text
        return response.text
    except Exception as e:
        return f"[AI summary unavailable: {e}]"

# -------------------------------
# API Routes
# -------------------------------
@app.route('/api/scan', methods=['POST'])
def scan():
    data = request.get_json() or {}
    target = data.get('url', '').strip()
    level = int(data.get('level', 1))

    if not target or not validators.url(target):
        return jsonify({'error': 'Invalid or missing URL. Please include http:// or https://'}), 400

    try:
        # Spider to collect pages and alerts
        alerts = spider_and_get_alerts(target, max_urls=10, timeout=60)

        # If level >= 2, run active scan (ascan)
        ascan_id = None
        if level >= 2:
            ascan_id = zap.ascan.scan(target)
            start = time.time()
            while int(zap.ascan.status(ascan_id)) < 100:
                if time.time() - start > 90:  # avoid indefinite block
                    break
                time.sleep(1)
            # refresh alerts
            alerts = zap.core.alerts(baseurl=target)

        # level 3 extra synthetic check (e.g., WAF headers)
        if level == 3:
            alerts.append({
                "alert": "Missing WAF/Firewall headers",
                "risk": "Medium",
                "url": target,
                "param": None,
                "evidence": None,
                "description": "Response lacks typical WAF headers indicating a web application firewall.",
                "solution": "Deploy a WAF or reverse proxy and add relevant headers.",
                "reference": "https://owasp.org/www-project-top-ten/"
            })

        simplified = simplify_alerts(alerts)
        final = []
        for a in simplified:
            a['score'] = risk_to_score(a.get('risk', ''))
            final.append(enrich_suggestions(a))

        grouped = {
            "Critical": [v for v in final if v['score'] >= 9],
            "High": [v for v in final if 6 <= v['score'] < 9],
            "Medium": [v for v in final if 3 <= v['score'] < 6],
            "Low": [v for v in final if v['score'] < 3]
        }

        ai_summary = ai_analyze(final, target, level)

        report = {
            'target': target,
            'level': level,
            'summary': {k: len(v) for k, v in grouped.items()},
            'vulnerabilities': final,
            'ai_summary': ai_summary,
            'timestamp': datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
            'ascan_id': ascan_id
        }

        # save to global last_scan for PDF & contextual chat
        last_scan.clear()
        last_scan.update(report)

        return jsonify(report)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/progress/<scan_id>', methods=['GET'])
def get_progress(scan_id):
    try:
        status = int(zap.ascan.status(scan_id))
        return jsonify({"progress": status})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    """
    Chat assistant endpoint. Accepts {"message": "...", "include_scan": true/false}
    If include_scan is true and a last_scan exists, the latest findings will be appended to the prompt.
    """
    data = request.get_json() or {}
    message = data.get("message", "").strip()
    include_scan = bool(data.get("include_scan", False))

    if not message:
        return jsonify({"error": "Message cannot be empty"}), 400

    try:
        system_prompt = "You are a helpful security assistant. Answer concisely and clearly."

        prompt = system_prompt + "\nUser: " + message

        # if requested, append latest scan summary as context
        if include_scan and last_scan:
            brief = f"\n\nLatest scan target: {last_scan.get('target')}\nSummary counts: {last_scan.get('summary')}\nTop findings:\n"
            for v in (last_scan.get('vulnerabilities') or [])[:8]:
                brief += f"- {v.get('name')} ({v.get('risk')}): {v.get('description')}\n"
            prompt = prompt + brief

        model = genai.GenerativeModel("gemini-1.5-flash")
        resp = model.generate_content(prompt)
        return jsonify({"reply": resp.text})

    except Exception as e:
        return jsonify({"error": f"AI Chat unavailable: {e}"}), 500

# -------------------------------
# PDF Report generation
# -------------------------------
def draw_wrapped_text(c, x, y, text, max_width, leading=14, font_name="Helvetica", font_size=10):
    """
    Helper to draw wrapped lines and return new y position.
    """
    c.setFont(font_name, font_size)
    wrapped = textwrap.wrap(text, width=100)  # width tuned for A4 and font size; fine for basic usage
    for line in wrapped:
        c.drawString(x, y, line)
        y -= leading
    return y

@app.route('/api/report/pdf', methods=['GET'])
def download_report():
    if not last_scan:
        return jsonify({"error": "No report available"}), 400

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    left_margin = 50
    y = height - 50

    c.setFont("Helvetica-Bold", 18)
    c.drawString(left_margin, y, "Security Scan Report")
    y -= 28

    c.setFont("Helvetica", 11)
    c.drawString(left_margin, y, f"Target: {last_scan.get('target', 'Unknown')}")
    y -= 16
    c.drawString(left_margin, y, f"Generated: {last_scan.get('timestamp', '')}")
    y -= 22

    # Summary counts
    c.setFont("Helvetica-Bold", 12)
    c.drawString(left_margin, y, "Summary:")
    y -= 16
    c.setFont("Helvetica", 11)
    for k, v in (last_scan.get('summary') or {}).items():
        c.drawString(left_margin + 10, y, f"{k}: {v}")
        y -= 14
    y -= 8

    # Vulnerabilities
    c.setFont("Helvetica-Bold", 12)
    c.drawString(left_margin, y, "Vulnerabilities:")
    y -= 18
    c.setFont("Helvetica", 10)

    for v in (last_scan.get('vulnerabilities') or []):
        title = f"• {v.get('name')} (Risk: {v.get('risk')})"
        # if not enough room for title + content, new page
        if y < 120:
            c.showPage()
            y = height - 50
            c.setFont("Helvetica", 10)

        c.setFont("Helvetica-Bold", 11)
        c.drawString(left_margin + 4, y, title)
        y -= 14

        desc = v.get('description') or ""
        if desc:
            y = draw_wrapped_text(c, left_margin + 18, y, "Description: " + desc, max_width=width - left_margin * 2, leading=12, font_name="Helvetica", font_size=10)
            y -= 4
        sol = v.get('solution') or ""
        if sol:
            y = draw_wrapped_text(c, left_margin + 18, y, "Solution: " + sol, max_width=width - left_margin * 2, leading=12, font_name="Helvetica", font_size=10)
            y -= 6
        extra = v.get('extra_suggestion')
        if extra:
            y = draw_wrapped_text(c, left_margin + 18, y, "Suggestion: " + extra, max_width=width - left_margin * 2, leading=12, font_name="Helvetica", font_size=10)
            y -= 8

        urls = v.get('urls') or []
        if urls:
            y = draw_wrapped_text(c, left_margin + 18, y, "URLs: " + ", ".join(urls), max_width=width - left_margin * 2, leading=12, font_name="Helvetica", font_size=10)
            y -= 8

    # AI summary
    ai_text = last_scan.get('ai_summary')
    if ai_text:
        if y < 150:
            c.showPage()
            y = height - 50
        c.setFont("Helvetica-Bold", 12)
        c.drawString(left_margin, y, "AI Security Summary:")
        y -= 16
        c.setFont("Helvetica", 10)
        y = draw_wrapped_text(c, left_margin + 10, y, ai_text, max_width=width - left_margin * 2, leading=12, font_name="Helvetica", font_size=10)

    c.showPage()
    c.save()
    buffer.seek(0)

    return send_file(buffer, as_attachment=True, download_name="scan_report.pdf", mimetype="application/pdf")


# -------------------------------
# Run app
# -------------------------------
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 5000)), debug=True)
