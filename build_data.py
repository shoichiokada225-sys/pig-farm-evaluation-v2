# build_data.py — data-work/final-*.json を検証して works-v2.js を生成する
# 使い方: python build_data.py
# 検証: 各作業ちょうど5 aspects / 必須キー / levels 5要素 / 翻訳キー欠落ゼロ / id一意
import json, io, sys, glob, datetime, unicodedata

CATS = [
    ("feeding", "飼養管理"), ("hygiene", "衛生管理"), ("breeding", "繁殖管理"),
    ("farrowing", "分娩管理"), ("facility", "施設管理"), ("record", "記録管理"),
    ("shipping", "出荷管理"),
]
LANGS = ["en", "vi", "id"]

def fail(msg):
    print("NG:", msg); sys.exit(1)

def main():
    works = []
    for cat, _ in CATS:
        path = f"data-work/final-{cat}.json"
        try:
            data = json.load(io.open(path, encoding="utf-8"))
        except FileNotFoundError:
            fail(f"{path} がありません")
        except json.JSONDecodeError as e:
            fail(f"{path} JSON構文エラー: {e}")
        if not isinstance(data, list) or not data:
            fail(f"{path} が空です")
        for w in data:
            for k in ("id", "category", "no", "name", "gyomu", "aspects"):
                if k not in w:
                    fail(f"{path} {w.get('id','?')} に {k} がない")
            if w["category"] != cat:
                fail(f"{path} {w['id']} category不一致: {w['category']}")
            if len(w["aspects"]) != 5:
                fail(f"{path} {w['id']} aspectsが{len(w['aspects'])}個（5個必須）")
            aids = [a.get("id") for a in w["aspects"]]
            if len(set(aids)) != 5:
                fail(f"{path} {w['id']} aspect id重複: {aids}")
            for a in w["aspects"]:
                for k in ("id", "name", "kanten", "levels"):
                    if not a.get(k):
                        fail(f"{path} {w['id']}/{a.get('id','?')} に {k} がない")
                if len(a["levels"]) != 5:
                    fail(f"{path} {w['id']}/{a['id']} levelsが{len(a['levels'])}要素")
                for lg in LANGS:
                    if not a.get(f"name_{lg}") or not a.get(f"kanten_{lg}"):
                        fail(f"{path} {w['id']}/{a['id']} {lg}訳欠落(name/kanten)")
                    lv = a.get(f"levels_{lg}")
                    if not isinstance(lv, list) or len(lv) != 5 or not all(lv):
                        fail(f"{path} {w['id']}/{a['id']} levels_{lg} 不備")
            for lg in LANGS:
                if not w.get(f"name_{lg}"):
                    fail(f"{path} {w['id']} name_{lg} 欠落")
        works += data

    ids = [w["id"] for w in works]
    if len(set(ids)) != len(ids):
        fail("作業id重複: " + str([i for i in ids if ids.count(i) > 1]))

    # 試験区分（2026-10-11 キムさん選定）: 区分を選ぶと作業一式が入る。名簿の作業欄に区分名を書いても同じ
    presets = json.load(io.open("data-work/presets.json", encoding="utf-8"))
    names = {w["name"] for w in works}
    for p in presets:
        for k in ("id", "name", "works"):
            if not p.get(k):
                fail(f"presets {p.get('id','?')} に {k} がない")
        for lg in LANGS:
            if not p.get(f"name_{lg}"):
                fail(f"presets {p['id']} name_{lg} 欠落")
        nk = lambda v: unicodedata.normalize("NFKC", str(v)).replace(" ", "").replace("\u3000", "").lower()
        if nk(p["name"]) in {nk(x) for x in names} | {nk(w["no"]).replace("no.", "").lstrip("0") for w in works} | set(ids):
            fail(f"presets {p['id']} の名前が作業名・No.・IDと同じ: {p['name']}")
        miss = [x for x in p["works"] if x not in ids]
        if miss:
            fail(f"presets {p['id']} に無い作業id: {miss}")
        if len(set(p["works"])) != len(p["works"]) or len(p["works"]) > 8:
            fail(f"presets {p['id']} の作業が重複または8件超")
    if len({p["id"] for p in presets}) != len(presets) or len({p["name"] for p in presets}) != len(presets):
        fail("presets の id/name 重複")

    payload = {
        "version": datetime.date.today().isoformat(),
        "categories": [{"id": c, "name": n} for c, n in CATS],
        "works": works,
        "presets": presets,
    }
    js = ("/* works-v2.js — 自動生成: build_data.py（正本= data-work/final-*.json）。直接編集禁止 */\n"
          "const WORKDATA_V2=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n")
    io.open("works-v2.js", "w", encoding="utf-8", newline="\n").write(js)
    total_aspects = sum(len(w["aspects"]) for w in works)
    print(f"OK: {len(works)} works / {total_aspects} aspects -> works-v2.js ({len(js)//1024}KB)")

if __name__ == "__main__":
    main()
