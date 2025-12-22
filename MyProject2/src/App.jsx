import React, { useState } from 'react';

const App = () => {
  const [message, setMessage] = useState('');

  return (
    <div className="container">
      <header className="header">
        <h1>💡 電気料金管理システム - React版</h1>
        <p>ジェミニ2.5PROで作成された試作品をReactで実装</p>
      </header>

      <main>
        <div className="form-section">
          <h2>📸 OCR機能: 検針票の画像をアップロード</h2>
          <p>電気の検針票の画像をアップロードし、OCR解析を実行することで、フォームに自動入力されます。</p>
          
          <div className="form-group">
            <label>画像ファイルを選択:</label>
            <input type="file" accept="image/*" />
          </div>
          
          <button className="btn" onClick={() => setMessage('OCR機能はFirebaseとGemini APIの設定後に利用可能です')}>
            OCR解析を実行する
          </button>
        </div>

        <div className="form-section">
          <h2>📝 検針票データの登録・編集</h2>
          <form>
            <div className="form-group">
              <label>記録名 (必須):</label>
              <input type="text" placeholder="例: 自宅_低圧電力α, オフィス_灯季時別" />
            </div>
            
            <div className="form-group">
              <label>料金月分:</label>
              <input type="text" placeholder="例: R7 6月分" />
            </div>
            
            <div className="form-group">
              <label>使用量 (kWh):</label>
              <input type="number" placeholder="例: 350.5" step="0.01" />
            </div>
            
            <div className="form-group">
              <label>合計料金 (円):</label>
              <input type="number" placeholder="例: 12500" step="1" />
            </div>
            
            <div className="form-group">
              <label>日数 (日):</label>
              <input type="number" placeholder="例: 30" step="1" />
            </div>
            
            <div className="form-group">
              <label>メモ/備考:</label>
              <textarea placeholder="エアコン使用状況や季節変動など..." rows="3"></textarea>
            </div>
            
            <button className="btn" onClick={() => setMessage('データ登録機能はFirebase設定後に利用可能です')}>
              データを登録する
            </button>
          </form>
        </div>

        <div className="form-section">
          <h2>📋 登録履歴</h2>
          <p>データはFirebase設定後に表示されます。</p>
          
          <div className="form-group">
            <label>契約種別フィルタ:</label>
            <select>
              <option>全ての記録 (パターン0)</option>
              <option>低圧電力α (パターン1)</option>
              <option>灯季時別 (パターン2)</option>
              <option>低圧電力α / 灯季時別 合算 (パターン3)</option>
            </select>
          </div>
        </div>

        {message && (
          <div className={`message ${message.includes('エラー') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}
      </main>

      <footer style={{backgroundColor: '#374151', color: 'white', padding: '20px', textAlign: 'center', marginTop: 'auto'}}>
        <div className="container">
          <p style={{margin: 0}}>
            <strong style={{color: '#fbbf24'}}>✅ App ID:</strong> Firebase設定後に表示
          </p>
          <p style={{margin: '4px 0 0 0'}}>
            <strong style={{color: '#fbbf24'}}>👤 User ID:</strong> Firebase設定後に表示
          </p>
          <p style={{fontSize: '0.75rem', margin: '8px 0 0 0', opacity: 0.7}}>
            データはFirebase Firestoreに保存されます
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App