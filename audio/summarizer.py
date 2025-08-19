import os
from typing import Optional

from google import genai

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def generate_intake_summary(
    transcript_path: Optional[str] = None,
    output_path: Optional[str] = None,
    language: str = "nl",
) -> str:
    """
    Reads the complete transcript and generates a concise, structured summary
    for a physiotherapist. Writes the summary to intake_summary.txt.

    - transcript_path: path to transcriptions.txt (defaults to project path)
    - output_path: path to write intake_summary.txt (defaults to project path)
    - language: 'nl' (Dutch) by default
    """
    transcript_path = transcript_path or os.path.join(BASE_DIR, "transcriptions.txt")
    output_path = output_path or os.path.join(BASE_DIR, "intake_summary.txt")

    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript = f.read().strip()
    except FileNotFoundError:
        transcript = ""
    except Exception as e:
        transcript = ""

    # If no transcript, write a placeholder and return early.
    if not transcript:
        summary = (
            "Geen transcript gevonden. Er kon geen samenvatting worden gegenereerd."
        )
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(summary)
        return summary

    # Build a lightweight client. Uses GOOGLE_API_KEY from environment if set.
    client = genai.Client(
        api_key="AIzaSyAiRh2D1WD1LYysSNEor_IiTh6szjn8X_c",
    )

    # Instruction in Dutch for a physiotherapy intake summary.
    instruction_nl = (
        "Maak een beknopte, gestructureerde samenvatting van dit intakegesprek "
        "voor een fysiotherapeut. Gebruik puntsgewijze secties en houd het zakelijk. "
        "Neem indien beschikbaar het volgende op:\n"
        "- Patiëntprofiel (leeftijd/geslacht indien genoemd)\n"
        "- Hulpvraag & hoofdklacht\n"
        "- Ontstaanswijze & beloop (duur, triggers, verlichtende factoren)\n"
        "- Pijn (locatie, aard, intensiteit/schaal, verloop)\n"
        "- Rode vlaggen/gele vlaggen (indien genoemd)\n"
        "- Functionele beperkingen & participatie\n"
        "- Relevante voorgeschiedenis/medicatie/werk/sport\n"
        "- Hypothese/werkdiagnose (indien naar voren komt)\n"
        "- Behandelplan & adviezen (oefeningen, educatie, load management)\n"
        "- Meetbehoefte voor objectief onderzoek (indien passend)\n"
        "Wees kort, helder en zonder persoonlijke bewoordingen."
    )

    instruction = (
        instruction_nl
        if language.lower().startswith("nl")
        else (
            "Produce a concise, structured physiotherapy intake summary in bullet points."
        )
    )

    prompt = (
        f"{instruction}\n\n"
        f"Transcript (inclusief vragen/antwoorden van zowel patiënt als therapeut):\n"
        f"{transcript}\n"
    )

    try:
        resp = client.models.generate_content(
            model="models/gemini-2.5-flash",
            contents=prompt,
        )
        summary = (getattr(resp, "text", None) or "").strip()
    except Exception:
        summary = ""

    if not summary:
        # Fallback: minimal extraction if model call fails.
        summary = "Samenvatting kon niet worden gegenereerd. Zie volledige transcript in transcriptions.txt."

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(summary)

    return summary
