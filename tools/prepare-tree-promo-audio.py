"""Generate neural pt-BR narration, word timing, original music and mixed audio."""
import asyncio
import hashlib
import json
import subprocess
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tmp/promo-python'))
import edge_tts
import imageio_ffmpeg
import numpy as np

OUT = ROOT / 'artifacts/videos/solicitacao-de-mudas-v3'
ASSETS = OUT / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
RATE = 48000
LINES = [
    'Uma muda hoje… e Floresta ganha mais sombra e mais vida!',
    'No Trombone Cidadão, você solicita mudas ou pede apoio pro plantio!',
    'É rapidinho: informe o local, escolha a espécie e a quantidade!',
    'Enviou? Acompanhe tudo em Meus pedidos!',
    'Sujeito à avaliação e disponibilidade. Baixe o app Trombone Cidadão e adote uma árvore!',
]
VOICE = 'pt-BR-FranciscaNeural'
SPEECH_RATE = '-8%'
SPEECH_PITCH = '+2Hz'
CONFIG = {'voice': VOICE, 'rate': SPEECH_RATE, 'pitch': SPEECH_PITCH, 'lines': LINES, 'trim': 'waveform-v2'}
CACHE = hashlib.sha256(json.dumps(CONFIG, ensure_ascii=False).encode()).hexdigest()


def run(*args):
    return subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)], check=True, capture_output=True)


def write_wav(file, samples):
    samples = np.asarray(samples)
    with wave.open(str(file), 'wb') as out:
        out.setnchannels(1 if samples.ndim == 1 else samples.shape[1])
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes((np.clip(samples, -.99, .99) * 32767).astype('<i2').tobytes())


async def narration():
    previous = ASSETS / 'speech-cache.json'
    if previous.exists():
        saved = json.loads(previous.read_text(encoding='utf8'))
        if saved['hash'] == CACHE and all((ASSETS / f'voice-{i}.wav').exists() for i in range(5)):
            return saved['scenes']
    scenes, current = [], 0
    for index, line in enumerate(LINES):
        chunks, words = [], []
        communicate = edge_tts.Communicate(line, VOICE, rate=SPEECH_RATE, pitch=SPEECH_PITCH, boundary='WordBoundary', connect_timeout=20, receive_timeout=40)
        async for chunk in communicate.stream():
            if chunk['type'] == 'audio':
                chunks.append(chunk['data'])
            elif chunk['type'] == 'WordBoundary':
                words.append({'text': chunk['text'], 'start': chunk['offset'] / 10000000, 'duration': chunk['duration'] / 10000000})
        if not chunks or not words:
            raise RuntimeError('Neural TTS did not return audio and word timings')
        mp3 = ASSETS / f'voice-{index}.mp3'
        mp3.write_bytes(b''.join(chunks))
        wav_file = ASSETS / f'voice-{index}.wav'
        full_wav = ROOT / f'.tmp/promo-voice-{index}-full.wav'
        run('-i', mp3, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=7', '-ar', RATE, '-ac', 1, '-c:a', 'pcm_s16le', full_wav)
        with wave.open(str(full_wav), 'rb') as data:
            signal = np.frombuffer(data.readframes(data.getnframes()), dtype='<i2').astype(float)/32768
        # Service word boundaries can end before the last consonant/reverb.
        # Trim against the actual waveform, preserving the full spoken ending.
        blocks = len(signal)//960
        rms = np.sqrt(np.mean(signal[:blocks*960].reshape(blocks,960)**2,axis=1))
        active = np.flatnonzero(rms > .005)
        if not len(active):
            raise RuntimeError('Empty neural voice waveform')
        trim = max(0, active[0]*.02-.04)
        end = min(len(signal)/RATE,(active[-1]+1)*.02+.12)
        write_wav(wav_file, signal[round(trim*RATE):round(end*RATE)])
        with wave.open(str(wav_file), 'rb') as data:
            duration = data.getnframes() / RATE
        words = [{**word, 'start': max(0, word['start'] - trim)} for word in words]
        scene = {'index': index, 'text': line, 'start': current, 'speechDuration': duration, 'duration': duration + .25, 'words': words}
        scenes.append(scene)
        current += scene['duration']
        print(f'Neural narration {index+1}/5: {duration:.2f}s', flush=True)
    previous.write_text(json.dumps({'hash': CACHE, 'scenes': scenes}, ensure_ascii=False, indent=2), encoding='utf8')
    return scenes


def soundtrack(scenes):
    # Let each screen settle before speaking, then hold it briefly afterward.
    current = 0
    for scene in scenes:
        scene['start'] = current
        scene['speechOffset'] = .35
        scene['interactionScale'] = 1.12/.92
        scene['pauseAfter'] = 1.5 if scene['index'] == 4 else .55
        scene['duration'] = scene['speechOffset'] + scene['speechDuration'] + scene['pauseAfter']
        current += scene['duration']
    duration = sum(scene['duration'] for scene in scenes)
    frames = int(np.ceil(duration * RATE))
    voice = np.zeros(frames, dtype=np.float64)
    for scene in scenes:
        with wave.open(str(ASSETS / f"voice-{scene['index']}.wav"), 'rb') as data:
            signal = np.frombuffer(data.readframes(data.getnframes()), dtype='<i2').astype(float) / 32768
        start = round((scene['start'] + scene['speechOffset']) * RATE)
        voice[start:start+len(signal)] += signal
    write_wav(ASSETS / 'narracao.wav', voice)
    bed = np.zeros((frames, 2), dtype=np.float64)
    effects = np.zeros_like(bed)
    rng = np.random.default_rng(6821)
    beat = 60/112

    def note(at, midi, length, volume, pan=0, bass=False):
        start = round(at * RATE)
        count = min(round(length*RATE), frames-start)
        if count <= 0:
            return
        t = np.arange(count)/RATE
        frequency = 440 * 2 ** ((midi-69)/12)
        signal = np.sin(2*np.pi*frequency*t)
        if not bass:
            signal += .25*np.sin(2*np.pi*frequency*2*t) + .09*np.sin(2*np.pi*frequency*3*t)
        envelope = (1-np.exp(-t*140)) * np.exp(-t*(5.5 if not bass else 2.9))
        signal *= envelope * volume
        bed[start:start+count, 0] += signal * np.sqrt((1-pan)/2)
        bed[start:start+count, 1] += signal * np.sqrt((1+pan)/2)

    # Original bright marimba / soft bass accompaniment, not a downloaded song.
    chords = [[62,66,69,73], [59,62,66,69], [55,59,62,66], [57,61,64,69]]
    for step in range(int(duration/(beat/2))+1):
        at = step*beat/2
        chord = chords[(step//16) % 4]
        note(at, chord[[0,2,1,3,2,1,3,2][step % 8]]+12, .7, .038, (-.35 if step%2 else .35))
        if step%4 == 0:
            note(at, chord[0]-24, 1.1, .065, bass=True)
        # Quiet shaker with deterministic noise.
        start = round(at*RATE)
        count = min(round(.055*RATE), frames-start)
        if count > 0:
            t=np.arange(count)/RATE
            noise = rng.normal(0,1,count)
            noise = np.diff(noise, prepend=0)*np.exp(-t*80)*.003
            bed[start:start+count] += noise[:,None]
    for scene in scenes:
        at=scene['start']
        start=max(0,round((at-.15)*RATE))
        count=min(round(.31*RATE),frames-start)
        t=np.arange(count)/RATE
        noise=rng.normal(0,1,count)
        noise=np.convolve(noise,np.ones(11)/11,mode='same')
        whoosh=noise*np.sin(np.pi*t/max(t[-1],.001))**2*.05
        effects[start:start+count,0]+=whoosh*.8
        effects[start:start+count,1]+=whoosh
        for offset in {0:[.35],1:[.65,1.8,3.1],2:[1.4],3:[.9],4:[.35]}[scene['index']]:
            start=round((at+scene['speechOffset']+offset*scene['interactionScale'])*RATE)
            count=min(round(.11*RATE),frames-start)
            if count <= 0:
                continue
            t=np.arange(count)/RATE
            pop=np.sin(2*np.pi*(670*t-1600*t*t))*np.exp(-t*46)*.037
            effects[start:start+count]+=pop[:,None]
    fade=np.minimum(np.arange(frames)/RATE/.5,1)*np.minimum((frames-np.arange(frames))/RATE/1.0,1)
    bed*=fade[:,None]
    write_wav(ASSETS / 'trilha-original.wav', bed)
    write_wav(ASSETS / 'efeitos.wav', effects)
    # Compress only the bed with the narration sidechain; preserve the voice.
    filters='[0:a]asplit=2[voice][side];[1:a][side]sidechaincompress=threshold=0.025:ratio=6:attack=12:release=180[ducked];[voice][ducked][2:a]amix=inputs=3:normalize=0:duration=longest,alimiter=limit=0.92:level=0[out]'
    run('-i', ASSETS/'narracao.wav', '-i', ASSETS/'trilha-original.wav', '-i', ASSETS/'efeitos.wav', '-filter_complex', filters, '-map', '[out]', '-ar', RATE, '-ac', 2, ASSETS/'mix.wav')
    manifest={'voice':VOICE,'rate':SPEECH_RATE,'pitch':SPEECH_PITCH,'duration':duration,'scenes':scenes,'website':'https://trombonecidadao.com.br','music':'Original procedural score, 112 BPM','wordTiming':'Neural service WordBoundary'}
    (ASSETS/'timing.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    (OUT/'roteiro.txt').write_text('\n\n'.join(LINES)+'\n',encoding='utf8')
    (ROOT/'.tmp/promo-ffmpeg-path.txt').write_text(FFMPEG,encoding='utf8')
    print(json.dumps({'voice':VOICE,'duration':duration,'ffmpeg':FFMPEG}),flush=True)


if __name__ == '__main__':
    soundtrack(asyncio.run(narration()))
