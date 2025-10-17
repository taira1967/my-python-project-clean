from flask import Flask, render_template, request, send_file, redirect, url_for, flash
import csv
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import io
import os
import platform

app = Flask(__name__)
app.secret_key = 'myproject2-secret-key-2025'

# 日本語フォントの設定
def setup_japanese_font():
    """日本語フォントを設定"""
    try:
        if platform.system() == 'Windows':
            font_paths = [
                'C:/Windows/Fonts/msgothic.ttc',
                'C:/Windows/Fonts/meiryo.ttc',
                'C:/Windows/Fonts/yuanti.ttc',
            ]
            
            for font_path in font_paths:
                if os.path.exists(font_path):
                    plt.rcParams['font.family'] = fm.FontProperties(fname=font_path).get_name()
                    break
            else:
                plt.rcParams['font.family'] = 'DejaVu Sans'
        else:
            plt.rcParams['font.family'] = 'DejaVu Sans'
    except Exception as e:
        print(f"フォント設定エラー: {e}")
        plt.rcParams['font.family'] = 'DejaVu Sans'

setup_japanese_font()

def read_csv(filename):
    """CSVファイルを読み込む"""
    data = []
    if not os.path.exists(filename):
        return data
        
    with open(filename, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row_num, row in enumerate(reader, start=2):  # ヘッダー行を考慮して2から開始
            try:
                # 空の値をチェック
                if not row['年月'] or not row['使用量（kWh）'] or not row['単価（円/kWh）']:
                    print(f"行{row_num}: 空の値が含まれています。スキップします。")
                    continue
                
                usage = float(row['使用量（kWh）'])
                price = float(row['単価（円/kWh）'])
                total = usage * price
                data.append({
                    '年月': row['年月'],
                    '使用量': usage,
                    '単価': price,
                    '電気代': total
                })
            except (ValueError, KeyError) as e:
                print(f"行{row_num}: データ読み込みエラー: {e} - スキップします")
                continue
    return data

# ルート定義
@app.route('/')
def index():
    records = read_csv('data.csv')
    return render_template('index.html', records=records)

@app.route('/graph')
def graph():
    records = read_csv('data.csv')
    if not records:
        return "データがありません", 404
        
    months = [r['年月'] for r in records]
    totals = [r['電気代'] for r in records]

    plt.figure(figsize=(10, 6))
    plt.plot(months, totals, marker='o', color='green', linewidth=2, markersize=8)
    plt.title('月別電気代の推移', fontsize=16, fontweight='bold')
    plt.xlabel('年月', fontsize=12)
    plt.ylabel('電気代（円）', fontsize=12)
    plt.grid(True, alpha=0.3)
    plt.xticks(rotation=45)
    plt.tight_layout()

    img = io.BytesIO()
    plt.savefig(img, format='png', dpi=150, bbox_inches='tight')
    img.seek(0)
    plt.close()
    return send_file(img, mimetype='image/png')

if __name__ == '__main__':
    app.run(debug=True, port=5003)
    if __name__ == "__main__":
    app.run(debug=True)

# 表示確認済み！2025年10月17日 by taira1967
