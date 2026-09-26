"""Validate contracts/fixtures/*.json against the schemas, and check that every number said in a
user-facing string is backed by a fact in the same fixture. Needs only the jsonschema package.

    python contracts/validate.py
"""
import json, pathlib, re, sys

from jsonschema import Draft7Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT7

HERE = pathlib.Path(__file__).resolve().parent
SCHEMAS = {p.name.removesuffix(".schema.json"): json.loads(p.read_text()) for p in sorted(HERE.glob("*.schema.json"))}
REGISTRY = Registry().with_resources((s["$id"], Resource(s, specification=DRAFT7)) for s in SCHEMAS.values())
SPOKEN = {"text", "details", "summary", "warnings", "differences", "unknown"}
NUM = re.compile(r"(?<![\w.])\d[\d,]*(?:\.\d+)?(?!\w|\s*o'clock)")


def walk(node, key=None):
    """Yield (key, value) for every value in a JSON tree."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, k)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v, key)
    else:
        yield key, node


def norm(tok):
    tok = tok.replace(",", "")
    return str(int(float(tok))) if float(tok).is_integer() else str(float(tok))


def backed_numbers(doc):
    out = set()
    for k, facts in (kv for kv in _lists(doc) if kv[0] == "facts"):
        for f in facts:
            v = f["value"]
            if isinstance(v, bool) or v is None:
                continue
            out |= {norm(str(v))} if isinstance(v, (int, float)) else {norm(t) for t in NUM.findall(v)}
    return out


def _lists(node):
    if isinstance(node, dict):
        for k, v in node.items():
            if isinstance(v, list):
                yield k, v
            yield from _lists(v)
    elif isinstance(node, list):
        for v in node:
            yield from _lists(v)


def main():
    errors = 0
    for name, schema in SCHEMAS.items():
        Draft7Validator.check_schema(schema)
    fixtures = sorted((HERE / "fixtures").glob("*.json"))
    for f in fixtures:
        doc = json.loads(f.read_text())
        schema = SCHEMAS[f.name.split(".")[0]]
        problems = [f"{'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}"
                    for e in Draft7Validator(schema, registry=REGISTRY).iter_errors(doc)]
        backed = backed_numbers(doc)
        for key, val in walk(doc):
            if key in SPOKEN and isinstance(val, str):
                problems += [f"number {t!r} in {key!r} has no fact: {val[:60]}..." for t in NUM.findall(val) if norm(t) not in backed]
        errors += len(problems)
        print(("FAIL " if problems else "ok   ") + f.name)
        for p in problems:
            print("     " + p)
    print(f"{len(fixtures)} fixtures, {len(SCHEMAS)} schemas, {errors} problems")
    return 1 if errors or not fixtures else 0


if __name__ == "__main__":
    sys.exit(main())
