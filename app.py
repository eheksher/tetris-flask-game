from flask import Flask, render_template, jsonify, request
import os
import psycopg2
import psycopg2.extras

app = Flask(__name__)

# --- DB helpers -------------------------------------------------

def get_db_conn():
    url = os.environ.get("DATABASE_URL")
    if url is None:
        # עבודה מקומית בלי DB
        return None
    # Render דורש sslmode=require
    if "sslmode" not in url:
        url = url + ("?sslmode=require" if "?" not in url else "&sslmode=require")
    return psycopg2.connect(url)

def init_db():
    """
    יוצר טבלה אם לא קיימת:
    scores(id, name, score, created_at)
    """
    conn = get_db_conn()
    if conn is None:
        return
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS scores (
                        id SERIAL PRIMARY KEY,
                        name TEXT NOT NULL,
                        score INTEGER NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                    """
                )
    finally:
        conn.close()

# נקרא פעם אחת בעלייה
init_db()

# --- Routes -----------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")

@app.get("/api/scores")
def api_get_scores():
    """
    מחזיר את 10 התוצאות הגבוהות ביותר מהשרת
    בפורמט JSON: [{name, score, created_at}, ...]
    """
    conn = get_db_conn()
    if conn is None:
        # אם אין DB (למשל מקומית בלי הגדרה) מחזירים ריק
        return jsonify([])
    try:
        with conn:
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                cur.execute(
                    """
                    SELECT name, score, created_at
                    FROM scores
                    ORDER BY score DESC, created_at ASC
                    LIMIT 10
                    """
                )
                rows = cur.fetchall()
                data = [
                    {"name": r["name"], "score": r["score"], "created_at": r["created_at"].isoformat()}
                    for r in rows
                ]
                return jsonify(data)
    finally:
        conn.close()

@app.post("/api/scores")
def api_post_score():
    """
    מקבל JSON: { "name": "...", "score": 1234 }
    שומר בבסיס הנתונים ומחזיר {"ok": true}
    """
    payload = request.get_json() or {}
    name = (payload.get("name") or "שחקן").strip() or "שחקן"
    try:
        score = int(payload.get("score") or 0)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "invalid score"}), 400

    conn = get_db_conn()
    if conn is None:
        # אין DB - מדמים הצלחה
        return jsonify({"ok": True, "warning": "no database configured"})

    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO scores (name, score) VALUES (%s, %s);",
                    (name, score),
                )
        return jsonify({"ok": True})
    finally:
        conn.close()


if __name__ == "__main__":
    # הרצה מקומית
    app.run(debug=True)
