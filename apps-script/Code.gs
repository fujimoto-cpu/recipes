/**
 * レシピ図書館 — レシート／食材写真 → 食材抽出API
 * Google Apps Script + Gemini API(無料枠)  ※v5 自己修復型（候補を通るまで試す）
 *
 * 鍵が使える generateContent 対応モデルを ListModels で取得 → 2.0系(廃止)/pro/tts/image を除外し、
 * latestエイリアス→flash-lite→新バージョン順に「実際に叩いて200が返るまで」試す。
 * Googleがモデルを入れ替えてもコード変更不要で追従する。
 */

function listModels_(key) {
  var res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?key=' + key,
    { muteHttpExceptions: true });
  var data = JSON.parse(res.getContentText());
  return (data.models || []).filter(function (m) {
    return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0;
  }).map(function (m) { return m.name.replace('models/', ''); });
}

function orderedCandidates_(all) {
  var ok = all.filter(function (n) {
    if (n.indexOf('flash') < 0) return false;                 // flash系のみ（速い・無料枠が厚い）
    if (n.indexOf('image') >= 0 || n.indexOf('tts') >= 0) return false;
    if (n.indexOf('2.0') >= 0) return false;                  // 2.0系は廃止＝無料枠0
    return true;
  });
  function score(n) {
    var s = 0;
    if (n.indexOf('latest') >= 0) s += 1000;                  // エイリアス最優先（新規でも通る）
    if (n.indexOf('flash-lite') >= 0) s += 100;               // lite優先（無料枠が一番厚い）
    var mv = n.match(/(\d+(?:\.\d+)?)/); if (mv) s += parseFloat(mv[1]); // 3.1 > 2.5
    if (n.indexOf('preview') >= 0) s -= 5;
    return s;
  }
  ok.sort(function (a, b) { return score(b) - score(a); });
  return ok;
}

function extractItems_(key, model, prompt, imageBase64, mimeType) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key;
  var payload = {
    contents: [{ parts: [ { text: prompt }, { inlineData: { mimeType: mimeType, data: imageBase64 } } ] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' }
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var raw = res.getContentText();
  if (code !== 200) return { code: code, items: [] };
  var data; try { data = JSON.parse(raw); } catch (e0) { data = null; }
  var text = '';
  if (data && data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts) {
    var parts = data.candidates[0].content.parts;
    for (var i = 0; i < parts.length; i++) { if (parts[i].text) text += parts[i].text; }
  }
  var cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  var items = [];
  try { items = JSON.parse(cleaned).items || []; }
  catch (e1) { var m = cleaned.match(/\{[\s\S]*\}/); if (m) { try { items = JSON.parse(m[0]).items || []; } catch (e2) {} } }
  return { code: 200, items: items };
}

var PROMPT =
  'これはレシート、または食材・買い物の写真です。写っている「料理に使える食材・食品」を日本語で抽出してください。' +
  'レシートなら商品名の行から食材だけを拾う。金額・店名・合計・ポイント・レジ袋・日用品は無視。' +
  '一般的な食材名に正規化（例：豚バラ肉→豚肉、国産にんじん→にんじん、きゅうり3本→きゅうり）。' +
  'JSONのみを返す。形式は {"items":["にんじん","豚こま","きゅうり"]}。食材が無ければ {"items":[]}。';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var imageBase64 = body.image;
    var mimeType = body.mimeType || 'image/jpeg';
    if (!imageBase64) return json_({ error: 'no image' });

    var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!key) return json_({ error: 'GEMINI_API_KEY が未設定' });

    var cands = orderedCandidates_(listModels_(key));
    var tried = [];
    for (var i = 0; i < cands.length && i < 6; i++) {   // 上位6件まで実際に叩く
      var out = extractItems_(key, cands[i], PROMPT, imageBase64, mimeType);
      if (out.code === 200) {
        return json_({ items: out.items, _model: cands[i] });
      }
      tried.push(cands[i] + ':' + out.code);
    }
    return json_({ items: [], _diag: '全候補NG | ' + tried.join(' | ') });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

// 動作確認＋診断：URLを開くと 使えるモデル一覧＋候補順 が見える
function doGet() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return json_({ ok: true, note: 'no key yet' });
  try {
    var all = listModels_(key);
    return json_({ ok: true, candidates: orderedCandidates_(all).slice(0, 6), all: all });
  } catch (e) {
    return json_({ ok: true, error: String(e) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
