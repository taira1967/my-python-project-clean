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
def process_ocr_image(image_path):
    """ジェミニ ＡＰＩを使用して画像から日本語データを抽出"""
    try:
        import google.generativeai as genai
        
        # ＡＰＩキーの設定（あなたのキーをここに記入してください）
        genai.configure(api_key="AIzaSyAdNcdglxNM0QcaUBrom-OePAcjBqwwu6A")
        
        # ＡＩのモデルを選択
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # 画像を読み込む
        with open(image_path, 'rb') as f:
            image_data = f.read()
            
        # ＡＩへの日本語での指示
        prompt = """
        この画像は電気代の検針票です。
        以下の３つの項目を日本語で探し、回答してください。
        回答は必ず以下の形式（JSON）だけにしてください。
        1. 年月（例：2025年1月）
        2. 使用量
        3. 単価
        """

        # ＡＩに解析させる
        response = model.generate_content([
            prompt,
            {'mime_type': 'image/jpeg', 'data': image_data}
        ])
        
        # 解析結果を整理する（ここでも日本語で処理します）
        import json
        text_result = response.text.strip().replace('', '').replace('```', '')
        electric_data = json.loads(text_result)
        
        return "成功", electric_data

    except Exception as e:
        return None, f"エラーが発生しました: {str(e)}"

@app.route('/upload', methods=['POST'])
def upload_file():
    # 画像が送られてきたか確認
    if 'file' not in request.files:
        return redirect(url_for('index'))
    file = request.files['file']
    if file.filename == '':
        return redirect(url_for('index'))
    
    # 保存する場所を作る
    upload_folder = 'uploads'
    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder)
    
    # 画像を一時的に保存
    file_path = os.path.join(upload_folder, file.filename)
    file.save(file_path)
    
    # ＡＩ（ジェミニ）に解析を頼む
    status, result = process_ocr_image(file_path)
    
    # 結果を画面に表示する
    if status == "成功":
        flash(f"解析に成功しました: {result}")
    else:
        flash(f"解析に失敗しました: {result}")
        
    return redirect(url_for('index'))

# プログラムを起動する
if __name__ == '__main__':
    app.run(debug=True, port=5003)