<<<<<<< Updated upstream
<<<<<<< Updated upstream
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
=======
=======
>>>>>>> Stashed changes
console.log("HELLO");
import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, query, onSnapshot, addDoc, orderBy, serverTimestamp, where, deleteDoc, doc } from 'firebase/firestore';

/**
 * 環境変数の取得
 */
const getEnv = (key) => import.meta.env[key] || "";

const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY'),
  authDomain: "my-p1-bcbe8.firebaseapp.com",
  projectId: "my-p1-bcbe8",
  storageBucket: "my-p1-bcbe8.firebasestorage.app",
  messagingSenderId: "21917026577",
  appId: "1:21917026577:web:d9bf69c31ececa8a0a24b0",
  measurementId: "G-98NCZQCEPM"
};

// --- ユーティリティ: 日付の正規化 ---
const normalizeBillingDate = (rawDate) => {
  if (!rawDate) return '';
  let n = rawDate.trim().replace(/令和/g, 'R').replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
  n = n.replace(/R\s*(\d+)\s*(\d+月分)/g, 'R$1 $2');
  const match = n.match(/R(\d+)\s+(\d+)月分/) || n.match(/R(\d+)(\d+)月分/);
  return match ? `R${match[1]} ${match[2]}月分` : rawDate;
};

// --- UIコンポーネント: 読み込み中 ---
const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-screen bg-gray-100">
    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600"></div>
    <p className="ml-4 text-2xl text-indigo-700 font-semibold">準備中です...</p>
  </div>
);

// --- UIコンポーネント: ログイン画面 ---
const LoginScreen = ({ onLogin, loginError }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <h1 className="text-3xl font-bold text-indigo-600 text-center">💡 電気料金比較表</h1>
        <form onSubmit={(e) => { e.preventDefault(); onLogin(email, password); }} className="space-y-6">
          <input type="email" placeholder="メールアドレス" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-4 py-3 border rounded-lg" />
          <input type="password" placeholder="パスワード" value={password} onChange={e => setPassword(e.target.value)} required className="w-full px-4 py-3 border rounded-lg" />
          {loginError && <p className="text-red-600 bg-red-100 p-3 rounded-lg text-sm">{loginError}</p>}
          <button type="submit" className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition">ログイン</button>
        </form>
      </div>
    </div>
  );
};

// --- メインアプリケーション ---
const MainApp = ({ currentUser, onLogout, db, userId, appId }) => {
  const [bills, setBills] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedImageBase64, setUploadedImageBase64] = useState(null);
  const [message, setMessage] = useState('');
  const [filterMode, setFilterMode] = useState('All');

  const [newBillData, setNewBillData] = useState({
    recorderName: currentUser, contractType: '', billingDate: '', usageKwh: '', totalCost: '', periodDays: '', notes: ''
  });

  useEffect(() => {
    if (!db || !userId) return;
    const q = query(collection(db, `artifacts/${appId}/energy_bills`), where('authorId', '==', userId), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (s) => {
      setBills(s.docs.map(d => ({ id: d.id, ...d.data() })));
    }, e => setMessage(`データ取得失敗: ${e.message}`));
  }, [db, userId, appId]);

  const fetchRetry = async (url, opts, retries = 5) => {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, opts);
        if (res.ok || (res.status !== 429 && res.status < 500)) return res;
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000 + Math.random() * 1000));
      } catch (e) { if (i === retries - 1) throw e; }
    }
  };

  const handleOCR = async () => {
    const apiKey = getEnv('VITE_GEMINI_API_KEY');
    if (!apiKey) return setMessage('APIキーが設定されていません');
    setIsProcessing(true);
    setMessage('AI解析中...');

    const base64Data = uploadedImageBase64.split(',')[1];
    // 最新の安定版URLに固定しました
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{
        role: "user", parts: [
          { text: "電気検針票から JSONで抽出。項目: usageKwh(数値), totalCost(数値), periodDays(数値), billingDate(R7 6月分 形式), contractName(文字列)" },
          { inlineData: { mimeType: "image/jpeg", data: base64Data } }
        ]
      }],
      generationConfig: { responseMimeType: "application/json" }
    };

    try {
      const res = await fetchRetry(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      const parsed = JSON.parse(result.candidates[0].content.parts[0].text);

      setNewBillData(prev => ({
        ...prev,
        usageKwh: String(parsed.usageKwh || ''),
        totalCost: String(parsed.totalCost || ''),
        periodDays: String(parsed.periodDays || ''),
        billingDate: normalizeBillingDate(parsed.billingDate || ''),
        contractType: parsed.contractName || ''
      }));
      setMessage('✅ 解析完了。内容を確認してください。');
    } catch (e) {
      setMessage(`OCRエラー: ${e.message}`);
    } finally { setIsProcessing(false); }
  };

  const processedBills = useMemo(() => {
    let list = bills.map(b => ({ ...b, dailyCost: b.totalCost / (b.periodDays || 30) }));
    if (filterMode === 'Combined') {
      const grouped = list.reduce((acc, b) => {
        if (!b.billingDate) return acc;
        if (!acc[b.billingDate]) acc[b.billingDate] = { ...b, usageKwh: 0, totalCost: 0, types: [] };
        acc[b.billingDate].usageKwh += Number(b.usageKwh);
        acc[b.billingDate].totalCost += Number(b.totalCost);
        acc[b.billingDate].types.push(b.contractType);
        return acc;
      }, {});
      return Object.values(grouped).map(b => ({ ...b, contractType: `合算: ${[...new Set(b.types)].join(' + ')}`, dailyCost: b.totalCost / (b.periodDays || 30) }));
    }
    return list;
  }, [bills, filterMode]);

  const stats = useMemo(() => {
    if (processedBills.length < 2) return null;
    const latest = processedBills[0].dailyCost;
    const avg = processedBills.slice(1).reduce((s, b) => s + b.dailyCost, 0) / (processedBills.length - 1);
    return { diff: latest - avg, percent: ((latest - avg) / avg) * 100 };
  }, [processedBills]);

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-indigo-600 text-white p-4 flex justify-between shadow-md">
        <h1 className="text-xl font-bold">💡 電気料金比較表</h1>
        <button onClick={onLogout} className="text-sm bg-red-500 px-3 py-1 rounded">ログアウト</button>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {message && <div className="p-4 bg-white border-l-4 border-indigo-500 shadow-sm rounded font-bold">{message}</div>}

        {stats && (
          <div className={`p-6 rounded-2xl shadow-lg border-4 ${stats.diff < 0 ? 'bg-green-100 border-green-400' : 'bg-red-100 border-red-400'}`}>
            <h2 className="text-lg font-bold">📊 最新の診断結果</h2>
            <p className="text-3xl font-black">
              過去平均より {Math.abs(stats.diff).toFixed(1)}円/日 ({Math.abs(stats.percent).toFixed(1)}%) {stats.diff < 0 ? '節約中！' : '高いです'}
            </p>
          </div>
        )}

        <section className="bg-white p-6 rounded-2xl shadow border">
          <h2 className="text-xl font-bold mb-4">📸 画像で自動入力</h2>
          <input type="file" accept="image/*" onChange={e => {
            const reader = new FileReader();
            reader.onload = (ev) => setUploadedImageBase64(ev.target.result);
            reader.readAsDataURL(e.target.files[0]);
          }} className="mb-4 block w-full text-sm" />
          {uploadedImageBase64 && (
            <button onClick={handleOCR} disabled={isProcessing} className="w-full py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700">
              {isProcessing ? 'AI解析中...' : '解析を実行する'}
            </button>
          )}
        </section>

        <section className="bg-white p-6 rounded-2xl shadow border-4 border-yellow-300">
          <h2 className="text-xl font-bold mb-4">📝 データ登録 (大文字)</h2>
          <form onSubmit={async (e) => {
            e.preventDefault();
            await addDoc(collection(db, `artifacts/${appId}/energy_bills`), { ...newBillData, usageKwh: Number(newBillData.usageKwh), totalCost: Number(newBillData.totalCost), periodDays: Number(newBillData.periodDays), timestamp: serverTimestamp(), authorId: userId });
            setNewBillData({ recorderName: currentUser, contractType: '', billingDate: '', usageKwh: '', totalCost: '', periodDays: '', notes: '' });
            setMessage('登録しました！');
          }} className="space-y-4">
            <input type="text" placeholder="契約種別" value={newBillData.contractType} onChange={e => setNewBillData({ ...newBillData, contractType: e.target.value })} className="w-full p-4 border-2 rounded-xl text-2xl font-bold" required />
            <div className="grid grid-cols-2 gap-4">
              <input type="text" placeholder="年月" value={newBillData.billingDate} onChange={e => setNewBillData({ ...newBillData, billingDate: normalizeBillingDate(e.target.value) })} className="p-4 border-2 rounded-xl text-2xl font-bold" />
              <input type="number" placeholder="料金 (円)" value={newBillData.totalCost} onChange={e => setNewBillData({ ...newBillData, totalCost: e.target.value })} className="p-4 border-2 rounded-xl text-2xl font-bold text-red-600" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <input type="number" placeholder="使用量 (kWh)" value={newBillData.usageKwh} onChange={e => setNewBillData({ ...newBillData, usageKwh: e.target.value })} className="p-4 border-2 rounded-xl text-2xl font-bold text-green-600" required />
              <input type="number" placeholder="日数" value={newBillData.periodDays} onChange={e => setNewBillData({ ...newBillData, periodDays: e.target.value })} className="p-4 border-2 rounded-xl text-2xl font-bold" required />
            </div>
            <button type="submit" className="w-full py-5 bg-indigo-600 text-white text-2xl font-black rounded-2xl shadow-xl hover:bg-indigo-700">データを登録する</button>
          </form>
        </section>

        <div className="flex gap-2">
          <button onClick={() => setFilterMode('All')} className={`flex-1 py-2 rounded-lg font-bold ${filterMode === 'All' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>個別表示</button>
          <button onClick={() => setFilterMode('Combined')} className={`flex-1 py-2 rounded-lg font-bold ${filterMode === 'Combined' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>低圧合算</button>
        </div>

        <div className="space-y-3">
          {processedBills.map(b => (
            <div key={b.id} className="bg-white p-4 rounded-xl shadow border flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-500">{b.billingDate}</p>
                <p className="font-bold text-lg">{b.contractType}</p>
                <p className="text-indigo-600 font-bold">{b.totalCost.toLocaleString()}円 / {b.usageKwh}kWh</p>
              </div>
              <button onClick={() => deleteDoc(doc(db, `artifacts/${appId}/energy_bills`, b.id))} className="text-red-400">削除</button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

const App = () => {
  const [state, setState] = useState({ db: null, auth: null, userId: null, isLoggedIn: false, loading: true, error: '' });
  useEffect(() => {
    try {
      const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
      const auth = getAuth(app);
      onAuthStateChanged(auth, (u) => {
        setState(s => ({ ...s, db: getFirestore(app), auth, userId: u?.uid, isLoggedIn: !!u, loading: false }));
      });
    } catch (e) { setState(s => ({ ...s, error: e.message, loading: false })); }
  }, []);
  if (state.loading) return <LoadingSpinner />;
  if (state.error) return <div className="p-10 text-red-600">初期化失敗: {state.error}</div>;
  return state.isLoggedIn ?
    <MainApp currentUser={getAuth().currentUser?.email} onLogout={() => signOut(state.auth)} db={state.db} userId={state.userId} appId="default-app" /> :
    <LoginScreen onLogin={(e, p) => signInWithEmailAndPassword(state.auth, e, p)} loginError={state.error} />;
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
};
export default App;