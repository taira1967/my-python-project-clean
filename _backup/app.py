from flask import Flask, render_template, request, send_file
import csv
import matplotlib.pyplot as plt
import io

app = Flask(__name__)

def read_csv(filename):
    data = []
    with open(filename, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            usage = float(row['使用量（kWh）'])
            price = float(row['単価（円/kWh）'])
            total = usage * price
            data.append({
                '年月': row['年月'],
                '使用量': usage,
                '単価': price,
                '電気代': total
            })
    return data

@app.route('/')
def index():
    records = read_csv('data.csv')
    return render_template('records.html', records=records)
@app.route('/graph')

def graph():
    records = read_csv('data.csv')
    months = [r['年月'] for r in records]
    totals = [r['電気代'] for r in records]

    plt.figure(figsize=(8, 4))
    plt.plot(months, totals, marker='o', color='green')
    plt.title('月別電気代の推移')
    plt.xlabel('年月')
    plt.ylabel('電気代（円）')
    plt.grid(True)

    img = io.BytesIO()
    plt.savefig(img, format='png')
    img.seek(0)
    return send_file(img, mimetype='image/png')
    

plans = {
    '標準プラン': 27.0,
    '夜間割引プラン': 23.5,
    'エコプラン': 25.0
}
@app.route('/compare')
def compare():
    records = read_csv('data.csv')
    results = []

    for record in records:
        usage = record['使用量']
        monthly = {'年月': record['年月']}
        for name, rate in plans.items():
            monthly[name] = usage * rate
        results.append(monthly)

    return render_template('compare.html', results=results)
@app.route('/stats')
def stats():
    records = read_csv('data.csv')
    stats_result = {}

    for name, rate in plans.items():
        costs = [r['使用量'] * rate for r in records]
        stats_result[name] = {
            '平均': round(sum(costs) / len(costs), 2),
            '最大': round(max(costs), 2),
            '最小': round(min(costs), 2)
        }

    return render_template('stats.html', stats=stats_result)

if __name__ == '__main__':
    app.run(debug=True, port=5001)
  