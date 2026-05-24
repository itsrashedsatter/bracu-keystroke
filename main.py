from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import csv, os, json
from datetime import datetime

app = Flask(__name__, static_folder='.')
CORS(app)  # allow requests from any browser

DATA_DIR = 'data'
os.makedirs(DATA_DIR, exist_ok=True)

# ── Serve the frontend ──────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('static', filename)

# ── Receive & save keystrokes ────────────────────────────────
@app.route('/save', methods=['POST'])
def save():
    try:
        data       = request.json
        user_id    = str(data.get('user_id', 'unknown')).strip()
        session_id = str(data.get('session_id', ''))
        trial      = data.get('trial', 1)
        device     = data.get('device', 'desktop')
        keylog     = data.get('keylog', [])

        # One CSV file per user
        filename   = os.path.join(DATA_DIR, f'user_{user_id}.csv')
        file_exists = os.path.exists(filename)

        press_times  = {}
        prev_release = None
        prev_press   = None
        rows         = []

        for event in keylog:
            etype = event.get('type')
            ekey  = event.get('key', '')
            etime = event.get('time', 0)

            if etype == 'keydown':
                press_times[ekey] = etime
                flight  = round(etime - prev_release, 4) if prev_release else None
                dd_time = round(etime - prev_press,   4) if prev_press   else None
                prev_press = etime

            elif etype == 'keyup':
                p    = press_times.get(ekey)
                hold = round(etime - p, 4) if p else None
                prev_release = etime

                rows.append({
                    'user_id'     : user_id,
                    'session_id'  : session_id,
                    'trial'       : trial,
                    'device'      : device,
                    'key'         : ekey,
                    'hold_time'   : hold,
                    'flight_time' : flight  if 'flight'  in dir() else None,
                    'DD_time'     : dd_time if 'dd_time' in dir() else None,
                    'press_time'  : round(p, 4)    if p    else None,
                    'release_time': round(etime, 4),
                    'timestamp'   : datetime.utcnow().isoformat(),
                })

        if rows:
            with open(filename, 'a', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=rows[0].keys())
                if not file_exists:
                    writer.writeheader()
                writer.writerows(rows)

        return jsonify({'status': 'ok', 'rows_saved': len(rows)})

    except Exception as e:
        print('ERROR /save:', e)
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ── Download all data as one merged CSV ──────────────────────
@app.route('/download')
def download_all():
    all_rows = []
    headers  = None

    for fname in os.listdir(DATA_DIR):
        if not fname.endswith('.csv'):
            continue
        fpath = os.path.join(DATA_DIR, fname)
        with open(fpath, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            if headers is None:
                headers = reader.fieldnames
            for row in reader:
                all_rows.append(row)

    if not all_rows:
        return 'No data collected yet.', 404

    from io import StringIO
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()
    writer.writerows(all_rows)

    from flask import Response
    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=BRACU_KSD_dataset.csv'}
    )


# ── Live stats (how many users collected) ───────────────────
@app.route('/stats')
def stats():
    users       = []
    total_rows  = 0
    for fname in os.listdir(DATA_DIR):
        if not fname.endswith('.csv'):
            continue
        fpath = os.path.join(DATA_DIR, fname)
        with open(fpath, newline='', encoding='utf-8') as f:
            rows = list(csv.DictReader(f))
            uid  = fname.replace('user_', '').replace('.csv', '')
            users.append({'user': uid, 'keystrokes': len(rows)})
            total_rows += len(rows)
    return jsonify({
        'total_users'      : len(users),
        'total_keystrokes' : total_rows,
        'users'            : sorted(users, key=lambda x: x['user'])
    })


if __name__ == '__main__':
    # Replit needs host='0.0.0.0' and reads PORT from environment
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
