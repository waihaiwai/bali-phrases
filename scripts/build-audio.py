# -*- coding: utf-8 -*-
"""listen-scripts.json から MP3 エピソードを生成する。
使い方: python scripts/build-audio.py [ep-id ...]
  引数なし: 全エピソード生成 / 引数あり: 指定IDのみ再生成（他は既存ファイルを保持）
出力: audio/<id>.mp3 と data/episodes.json
同一ビットレートCBRのセグメントをバイナリ結合する（ブラウザ再生は問題なし）。
"""
import asyncio, json, io, os, sys

import edge_tts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICES = {
    "narrator": "ja-JP-NanamiNeural",
    "staff": "en-US-JennyNeural",
    "staff2": "en-US-AriaNeural",
    "you": "en-US-GuyNeural",
}
SLOW = "-25%"
BYTES_PER_SEC = 6000  # 48kbps CBR

_cache = {}
_silence_cache = {}

def silence(sec):
    """リピート用の無音ギャップ（edge-ttsと同じ24kHz/48kbps monoで生成し結合互換にする）"""
    if sec not in _silence_cache:
        import lameenc
        enc = lameenc.Encoder()
        enc.set_bit_rate(48)
        enc.set_in_sample_rate(24000)
        enc.set_channels(1)
        enc.set_quality(2)
        pcm = b"\x00\x00" * int(24000 * sec)
        _silence_cache[sec] = bytes(enc.encode(pcm)) + bytes(enc.flush())
    return _silence_cache[sec]

async def tts(text, voice, rate=None):
    key = (text, voice, rate)
    if key in _cache:
        return _cache[key]
    kwargs = {"rate": rate} if rate else {}
    com = edge_tts.Communicate(text, voice, **kwargs)
    buf = io.BytesIO()
    async for chunk in com.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    data = buf.getvalue()
    if not data:
        raise RuntimeError(f"empty audio: {text[:40]}")
    _cache[key] = data
    return data

async def build_episode(ep):
    segs = []
    async def add(text, voice, rate=None):
        segs.append(await tts(text, voice, rate))

    await add(ep["intro"], VOICES["narrator"])
    for line in ep["convo"]:
        await add(line["en"], VOICES[line["v"]])
    await add("キーフレーズを確認しましょう。聞こえたら、続く間で真似して声に出してみてください。", VOICES["narrator"])
    for k in ep["keys"]:
        await add(k["en"], VOICES["you"], SLOW)
        segs.append(silence(3))  # 真似して声に出すためのギャップ
        await add(k["ja"], VOICES["narrator"])
        await add(k["en"], VOICES["you"], SLOW)
        segs.append(silence(3))
    await add("それでは、もう一度通しで聞いてみましょう。", VOICES["narrator"])
    for line in ep["convo"]:
        await add(line["en"], VOICES[line["v"]])
    await add(f"以上、「{ep['title']}」でした。", VOICES["narrator"])
    return b"".join(segs)

async def main():
    with open(os.path.join(ROOT, "scripts", "listen-scripts.json"), encoding="utf-8") as f:
        episodes = json.load(f)
    os.makedirs(os.path.join(ROOT, "audio"), exist_ok=True)
    only = set(sys.argv[1:])
    meta = []
    for i, ep in enumerate(episodes, 1):
        path = os.path.join(ROOT, "audio", ep["id"] + ".mp3")
        if only and ep["id"] not in only and os.path.exists(path):
            with open(path, "rb") as f:
                data = f.read()  # 既存ファイルを保持してメタだけ再計算
        else:
            data = await build_episode(ep)
            with open(path, "wb") as f:
                f.write(data)
        dur = round(len(data) / BYTES_PER_SEC)
        meta.append({
            "id": ep["id"],
            "title": ep["title"],
            "file": "audio/" + ep["id"] + ".mp3",
            "duration": dur,
            "lines": len(ep["convo"]),
        })
        print(f"[{i}/{len(episodes)}] {ep['id']}: {len(data)//1024}KB ~{dur//60}:{dur%60:02d}")
    with open(os.path.join(ROOT, "data", "episodes.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write("\n")
    total = sum(m["duration"] for m in meta)
    print(f"done: {len(meta)} episodes, total ~{total//60}min")

if __name__ == "__main__":
    asyncio.run(main())
