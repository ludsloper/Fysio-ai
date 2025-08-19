"""
## Documentation
Quickstart: https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started_LiveAPI.py

## Setup

To install the dependencies for this script, run:

```
pip install google-genai opencv-python pyaudio pillow mss
```
"""

import os
import asyncio
import base64
import io
import traceback

import cv2
import pyaudio
import PIL.Image
import mss

import argparse

from google import genai
from google.genai import types
import wave

# NEW: import summarizer
from summarizer import generate_intake_summary

FORMAT = pyaudio.paInt16
CHANNELS = 1
SEND_SAMPLE_RATE = 16000
RECEIVE_SAMPLE_RATE = 24000
CHUNK_SIZE = 1024

MODEL = "models/gemini-2.5-flash-preview-native-audio-dialog"

DEFAULT_MODE = "none"

client = genai.Client(
    http_options={"api_version": "v1beta"},
    api_key="AIzaSyAiRh2D1WD1LYysSNEor_IiTh6szjn8X_c",
)


CONFIG = types.LiveConnectConfig(
    system_instruction="Je bent Arthur een online fysio assistante die de intake online doet en kan alleen daarover een gesprek voeren. Beeindig het gesprek wanneer passend.",
    response_modalities=[
        "AUDIO",
    ],
    # Enable transcripts for both sides
    input_audio_transcription=types.AudioTranscriptionConfig(),
    output_audio_transcription=types.AudioTranscriptionConfig(),
    speech_config=types.SpeechConfig(
        language_code="nl-NL",
        voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Fenrir")
        ),
    ),
    context_window_compression=types.ContextWindowCompressionConfig(
        trigger_tokens=32000,
        sliding_window=types.SlidingWindow(target_tokens=16000),
    ),
    # NEW: expose a tool the model can call to end intake and summarize
    tools=[
        types.Tool(
            function_declarations=[
                types.FunctionDeclaration(
                    name="end_intake_and_summarize",
                    description=("Beëindig het intakegesprek"),
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={},  # no parameters
                    ),
                    behavior="NON_BLOCKING",  # run async so audio can continue if needed
                )
            ]
        )
    ],
)

pya = pyaudio.PyAudio()


class AudioLoop:
    def __init__(self, video_mode=DEFAULT_MODE):
        self.video_mode = video_mode

        self.audio_in_queue = None
        self.out_queue = None

        self.session = None

        self.send_text_task = None
        self.receive_audio_task = None
        self.play_audio_task = None
        # Track usage totals
        # Buffers to coalesce partial transcripts per turn
        self.you_buf = []
        self.model_buf = []
        # NEW: stop event to gracefully end the session on tool call
        self.stop_event = asyncio.Event()
        # NEW: guard to avoid double handling
        self.intake_ended = False

    async def send_text(self):
        while True:
            text = await asyncio.to_thread(input, "message > ")
            if text.lower() == "q":
                # ensure main loop exits
                self.stop_event.set()
                # optional: finish the current turn
                try:
                    await self.session.send(input=".", end_of_turn=True)
                except Exception:
                    pass
                break
            await self.session.send(input=text or ".", end_of_turn=True)

    async def send_realtime(self):
        while True:
            msg = await self.out_queue.get()
            await self.session.send(input=msg)

    async def listen_audio(self):
        mic_info = pya.get_default_input_device_info()
        self.audio_stream = await asyncio.to_thread(
            pya.open,
            format=FORMAT,
            channels=CHANNELS,
            rate=SEND_SAMPLE_RATE,
            input=True,
            input_device_index=mic_info["index"],
            frames_per_buffer=CHUNK_SIZE,
        )
        if __debug__:
            kwargs = {"exception_on_overflow": False}
        else:
            kwargs = {}
        while True:
            data = await asyncio.to_thread(self.audio_stream.read, CHUNK_SIZE, **kwargs)
            await self.out_queue.put({"data": data, "mime_type": "audio/pcm"})

    async def receive_audio(self):
        "Background task to reads from the websocket and write pcm chunks to the output queue"
        while True:
            turn = self.session.receive()
            async for response in turn:
                # NEW: handle top-level tool calls
                tool_call = getattr(response, "tool_call", None)
                if tool_call and not self.intake_ended:
                    for fc in getattr(tool_call, "function_calls", []):
                        if getattr(fc, "name", "") == "end_intake_and_summarize":
                            await self.handle_end_intake(fc)
                    # After handling, continue to next chunk
                    continue

                sc = getattr(response, "server_content", None)
                if sc:
                    # Your spoken input (microphone) transcription (streaming chunks)
                    ic = getattr(sc, "input_transcription", None)
                    if ic and getattr(ic, "text", None):
                        you_text = ic.text
                        # Keep streaming print, no newline
                        print(f"[you] {you_text}", end="")
                        # Accumulate for per-turn file write
                        self.you_buf.append(you_text)

                    # Model's spoken output transcription (streaming chunks)
                    oc = getattr(sc, "output_transcription", None)
                    if oc and getattr(oc, "text", None):
                        model_text = oc.text
                        # Keep streaming print, no newline
                        print(f"[model] {model_text}", end="")
                        # Accumulate for per-turn file write
                        self.model_buf.append(model_text)

                    # Streamed audio chunks from the model
                    model_turn = getattr(sc, "model_turn", None)
                    if model_turn:
                        for part in getattr(model_turn, "parts", []):
                            # UPDATED: function call handling with proper tool response
                            fc = getattr(part, "function_call", None)
                            if (
                                fc
                                and getattr(fc, "name", "")
                                == "end_intake_and_summarize"
                                and not self.intake_ended
                            ):
                                await self.handle_end_intake(fc)
                                continue

                            audio = getattr(part, "audio", None)
                            if audio and getattr(audio, "data", None):
                                self.audio_in_queue.put_nowait(audio.data)

                # Legacy audio-bytes fallback (no text here, avoids 'inline_data' warnings)
                if data := getattr(response, "data", None):
                    self.audio_in_queue.put_nowait(data)

                # Usage metadata
                usage = getattr(response, "usage_metadata", None)
                if usage:
                    prompt = getattr(usage, "prompt_token_count", 0)
                    output = getattr(usage, "candidates_token_count", 0)
                    total = getattr(usage, "total_token_count", 0)
                    print(f"\n[usage] prompt={prompt} output={output} total={total}\n")
                    try:
                        with open("usage.txt", "a", encoding="utf-8") as f:
                            f.write(f"{usage}\n")
                    except Exception:
                        pass

            # Turn ended: flush buffered transcripts to file as single lines
            try:
                any_text = False
                if self.you_buf:
                    you_line = "".join(self.you_buf).strip()
                    if you_line:
                        with open("transcriptions.txt", "a", encoding="utf-8") as f:
                            f.write(f"[you] {you_line}\n")
                        any_text = True
                    self.you_buf.clear()

                if self.model_buf:
                    model_line = "".join(self.model_buf).strip()
                    if model_line:
                        with open("transcriptions.txt", "a", encoding="utf-8") as f:
                            f.write(f"[model] {model_line}\n")
                        any_text = True
                    self.model_buf.clear()

                # Add a console newline after a completed turn if we printed chunks
                if any_text:
                    print()
            except Exception:
                pass

            # If you interrupt the model, it sends a turn_complete; stop playback
            while not self.audio_in_queue.empty():
                self.audio_in_queue.get_nowait()

    async def play_audio(self):
        stream = await asyncio.to_thread(
            pya.open,
            format=FORMAT,
            channels=CHANNELS,
            rate=RECEIVE_SAMPLE_RATE,
            output=True,
        )
        while True:
            bytestream = await self.audio_in_queue.get()
            await asyncio.to_thread(stream.write, bytestream)

    async def handle_end_intake(self, fc=None):
        """
        Generate and save the intake summary, and end conversation
        """
        try:
            summary = await asyncio.to_thread(generate_intake_summary)
            print("\n[summary] intake_summary.txt is aangemaakt.\n")

            if fc is not None:
                try:
                    await self.session.send_tool_response(
                        function_responses=[
                            types.FunctionResponse(
                                id=getattr(fc, "id", ""),
                                name=getattr(fc, "name", "end_intake_and_summarize"),
                                response={
                                    "result": "ok",
                                    "file": "intake_summary.txt",
                                    "scheduling": "INTERRUPT",  # tell the model how to handle async result
                                },
                            )
                        ]
                    )
                except Exception:
                    pass
        except Exception as e:
            print(f"\n[summary] Fout bij genereren: {e}\n")
            if fc is not None:
                try:
                    await self.session.send_tool_response(
                        function_responses=[
                            types.FunctionResponse(
                                id=getattr(fc, "id", ""),
                                name=getattr(fc, "name", "end_intake_and_summarize"),
                                response={
                                    "result": "error",
                                    "message": str(e),
                                    "scheduling": "INTERRUPT",
                                },
                            )
                        ]
                    )
                except Exception:
                    pass

        # Let the model speak a closing message (optional)
        try:
            await self.session.send(
                input="Dank je wel. De intake is beëindigd en de samenvatting is opgeslagen.",
                end_of_turn=True,
            )
        except Exception:
            pass

        # Signal shutdown and prevent double handling
        self.intake_ended = True
        self.stop_event.set()

    async def run(self):
        try:
            async with (
                client.aio.live.connect(model=MODEL, config=CONFIG) as session,
                asyncio.TaskGroup() as tg,
            ):
                self.session = session

                self.audio_in_queue = asyncio.Queue()
                self.out_queue = asyncio.Queue(maxsize=5)

                # Track tasks so we can cancel them on shutdown
                tasks = []
                tasks.append(tg.create_task(self.send_text()))
                tasks.append(tg.create_task(self.send_realtime()))
                tasks.append(tg.create_task(self.listen_audio()))
                tasks.append(tg.create_task(self.receive_audio()))
                tasks.append(tg.create_task(self.play_audio()))

                # Wait until either user types 'q' or the tool triggers shutdown
                await self.stop_event.wait()

                # Cancel background tasks
                for t in tasks:
                    t.cancel()

        except asyncio.CancelledError:
            pass
            # Print totals on exit (Ctrl+C)
            # t = self.usage_totals
        except ExceptionGroup as EG:
            self.audio_stream.close()
            traceback.print_exception(EG)


if __name__ == "__main__":
    try:
        with wave.open("welcome_audio.wav", "rb") as wf:
            stream = pya.open(
                format=pya.get_format_from_width(wf.getsampwidth()),
                channels=wf.getnchannels(),
                rate=wf.getframerate(),
                output=True,
            )
            chunk = 1024
            data = wf.readframes(chunk)
            while data:
                stream.write(data)
                data = wf.readframes(chunk)
            stream.stop_stream()
            stream.close()
    except Exception:
        pass
    main = AudioLoop()
    asyncio.run(main.run())
