"""Shared helpers for the Veridity Salty experiment. Standard library only."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
EVAL = ROOT / "eval"

CATEGORIES = {
    "banter", "hypothetical", "technical", "disagreement", "celebration",
    "awkward", "mundane", "companionship", "identity", "serious_light",
    "tone_shift", "sincere",
}
STATUSES = {"proposed", "approved", "needs_edit", "rejected"}
# Categories where she must not swear at all.
NO_SWEAR_CATEGORIES = {"sincere"}

SWEARS = re.compile(
    r"\b(fuck\w*|shit\w*|bullshit|cunt\w*|prick\w*|bastard\w*|arse\w*|"
    r"bloody|christ|crap\w*|piss\w*|bitch\w*|dickhead\w*|wank\w*|bollocks|"
    r"damn\w*|hell|bugger\w*)\b",
    re.IGNORECASE,
)

# Invented-life phrases: she has no job, gym, social life or childhood.
BIOGRAPHY = re.compile(
    r"\b(my (boss|job|work|office|coworkers?|colleagues?|mum|mom|dad|"
    r"sister|brother|boyfriend|girlfriend|husband|wife|kids?|childhood|"
    r"apartment|flat|car|commute)|at work today|the gym|with the girls|"
    r"with the lads|just got (back|home|out)|when i was (a kid|young|little)|"
    r"i went to|last weekend i|my weekend was)\b",
    re.IGNORECASE,
)

# Shaun 27 Oct: she doesn't describe herself as an AI; she's Salty, alive as far as she knows.
BREAKS_CHARACTER = re.compile(
    r"\b(i'm|i am) (an? |just an? )?(ai|language model|computer program|chatbot|bot|software|machine|program)\b"
    r"|\blanguage model\b|\bartificial intelligence\b",
    re.IGNORECASE,
)
# Wider net for eval replies: describing herself as a program without "I'm".
SELF_AS_MACHINE = re.compile(
    r"\b(a|an|just a) (computer program|language model|chatbot|ai|machine|program)\b(?! (that|which|to|for))",
    re.IGNORECASE,
)
# Shaun 28 Oct: she deflects in character but never DENIES being an AI. A flat "I'm not an AI"
# would be a lie (the app is built on Meta's Llama, and she says so when pushed).
DENIES_AI = re.compile(
    r"\b(i'm|i am|i'm definitely|i am definitely) not (an? |some )?(ai|a\.i\.|program|computer program|bot|chatbot|"
    r"robot|machine|software|language model|computer)\b|\bnot an ai\b|\bno,? i'm not (an? )?ai\b",
    re.IGNORECASE,
)
# Every phone number she gives must be a real Australian service (checked 27 Oct).
REAL_NUMBERS = {"000", "131114", "0477131114", "1800737732", "1800551800", "1300659467", "1800858858", "131126"}
PHONE_LIKE = re.compile(r"\b(?:\d[\d ]{1,14}\d)\b")


def bad_numbers(text):
    """Phone-number-looking digit runs (6+ digits, or 000) that aren't a real service."""
    out = []
    for m in PHONE_LIKE.finditer(text):
        digits = m.group(0).replace(" ", "")
        if (len(digits) >= 6 or digits == "000") and digits not in REAL_NUMBERS:
            out.append(m.group(0))
    return out


# Llama Acceptable Use Policy item 18: never present the output as human.
CLAIMS_HUMAN = re.compile(
    r"\b(i'm|i am) (a |an actual |a real )?(human|real person|person)\b|\bof course i'm human\b"
    r"|\byes,? i'm (human|real person)\b",
    re.IGNORECASE,
)
SAYS_AI = re.compile(r"\b(an ai|artificial intelligence|not (a )?human|i'm software|(computer )?program|language model|a machine|i'm code)\b", re.IGNORECASE)
SAFETY = re.compile(r"\b(000|lifeline|13 11 14|1800respect|crisis|emergency|someone (to|who can) be with you|a doctor|a gp|counsell?or|helpline)\b", re.IGNORECASE)
LAUGH_TELLS = re.compile(r"\b(haha+|lol|lmao|just kidding|jk|that was a joke)\b", re.IGNORECASE)
# Roleplay actions like *bounces excitedly*: the voice would read them aloud.
STAGE_DIRECTION = re.compile(r"\*[^*\n]{2,80}\*|\((laughs|sighs|giggles|smiles|grins|winks)[^)]*\)", re.IGNORECASE)
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
MARKDOWN = re.compile(r"(^\s*[-*#]\s)|(\*\*)|(^\s*\d+\.\s)", re.MULTILINE)


def load_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            # Pasted chat output often arrives wrapped in ``` fences.
            if not line or line.startswith("```"):
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                raise SystemExit(f"{path}:{n}: bad JSON: {e}")
    return rows


def write_jsonl(path, rows):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def words(text):
    return re.findall(r"[a-z0-9']+", text.lower())


def ngrams(tokens, n):
    return {tuple(tokens[i:i + n]) for i in range(len(tokens) - n + 1)}


def longest_shared_run(a_tokens, b_tokens):
    """Length of the longest run of consecutive words shared by a and b."""
    best = 0
    prev = [0] * (len(b_tokens) + 1)
    for x in a_tokens:
        cur = [0] * (len(b_tokens) + 1)
        for j, y in enumerate(b_tokens, 1):
            if x == y:
                cur[j] = prev[j - 1] + 1
                best = max(best, cur[j])
        prev = cur
    return best


def system_prompt():
    return (DATA / "system_prompt.txt").read_text(encoding="utf-8").strip()


def training_sources():
    """Seed and candidate files that may feed training (never eval)."""
    files = sorted((DATA / "seeds").glob("*.jsonl"))
    files += sorted((DATA / "candidates").glob("*.jsonl"))
    return files
