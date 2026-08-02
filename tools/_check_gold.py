import json, ssl
ssl._create_default_https_context = ssl._create_unverified_context
from urllib.request import Request, urlopen
from datetime import datetime, timezone

url = 'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d'
req = Request(url, headers={'User-Agent':'smc-icm/1.0'})
with urlopen(req, timeout=15) as resp: data = json.loads(resp.read())
ts = data['chart']['result'][0]['timestamp']
q = data['chart']['result'][0]['indicators']['quote'][0]
candles = []
for i in range(len(ts)):
    o, h, l, c = q['open'][i], q['high'][i], q['low'][i], q['close'][i]
    if o and c and o > 0:
        t = datetime.fromtimestamp(ts[i], timezone.utc)
        ny_t = (t.hour - 4) % 24
        candles.append({
            'time': int(ts[i])*1000,
            'open': float(o),
            'high': float(h or o),
            'low': float(l or o),
            'close': float(c),
            'volume': 0,
            't': str(ny_t).zfill(2) + ':' + str(t.minute).zfill(2)
        })

import os
root_dir = os.environ.get("WORKSPACE_ROOT", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
out_path = os.path.join(root_dir, "shared", "2026-07-28", "GOLD", "candles_1m.json")
with open(out_path, 'w') as f:
    json.dump(candles, f)

# Show last 20
recent = candles[-20:]
print('Last 20 1m closes:')
for c in recent:
    print('  ' + c['t'] + ' NY | C=' + str(round(c['close'],2)))

# Find peak and drop
last20 = recent
hi_idx = max(range(len(last20)), key=lambda i: last20[i]['high'])
hi = last20[hi_idx]['high']
lo_after = min(c['low'] for c in last20[hi_idx:])
peak_time = last20[hi_idx]['t']

print()
print('Peak: ' + str(round(hi,2)) + ' at ' + peak_time + ' NY')
print('After peak low: ' + str(round(lo_after,2)))
print('Drop from peak: $' + str(round(hi - lo_after, 2)))
print('Current: ' + str(round(last20[-1]['close'],2)))
print('Net from peak: $' + str(round(last20[-1]['close'] - hi, 2)))

# Broader session
all_session = [c for c in candles if c['t'] >= '02:00']
if all_session:
    session_hi = max(c['high'] for c in all_session)
    session_lo = min(c['low'] for c in all_session)
    print()
    print('Session (since 02:00): Hi=' + str(round(session_hi,2)) + ' Lo=' + str(round(session_lo,2)))
    print('Likely HOD: ' + str(round(session_hi,2)))
