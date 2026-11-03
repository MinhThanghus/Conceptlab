"""Safe math expression parser/evaluator (mirror of ``frontend/src/lib/expr.js``).

Grammar (no attribute access, no Python ``eval``)::

    expr   := term (('+' | '-') term)*
    term   := unary (('*' | '/' | '×' | '·' | '÷' | <implicit>) unary)*
    unary  := ('-' | '+') unary | power
    power  := primary ('^' unary)?            # right-associative, -2^2 = -4
    primary:= NUMBER | IDENT | IDENT '(' args ')' | '(' expr ')'

* Implicit multiplication: ``2x``, ``2(x+1)``, ``2pi``, ``(a+b)(a-b)``.
* Constants ``pi``/``π``, ``e``, ``deg`` (= π/180) unless shadowed by a variable.
* Numbers use ``.`` as the decimal separator (``,`` separates function arguments).
* Results follow IEEE/JavaScript semantics: ``1/0 = inf``, ``sqrt(-1) = nan``.

Shared test vectors live in ``shared/expr_cases.json`` (used by pytest and vitest).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Callable

MAX_LENGTH = 400
# Nesting budget (brackets, unary signs, chained powers). Real formulas stay far below it;
# without it ``((((…))))`` within 400 characters exhausts Python's recursion limit.
MAX_DEPTH = 60


class ExprError(ValueError):
    def __init__(self, code: str, message: str, position: int | None = None):
        super().__init__(message)
        self.code = code
        self.position = position


def _safe(fn: Callable[..., float]) -> Callable[..., float]:
    def wrapper(*args: float) -> float:
        try:
            return float(fn(*args))
        except (ValueError, ZeroDivisionError):
            return math.nan
        except OverflowError:
            return math.inf

    return wrapper


def _log(x: float, base: float | None = None) -> float:
    def ln(v: float) -> float:
        if v == 0:
            return -math.inf
        if v < 0 or math.isnan(v):
            return math.nan
        if math.isinf(v):
            return math.inf
        return math.log(v)

    if base is None:
        return ln(x) / math.log(10)
    return ln(x) / ln(base)


def _ln(x: float) -> float:
    if x == 0:
        return -math.inf
    if x < 0 or math.isnan(x):
        return math.nan
    if math.isinf(x):
        return math.inf
    return math.log(x)


def _pow(a: float, b: float) -> float:
    # Mirrors JavaScript Math.pow / ** semantics.
    if math.isnan(b):
        return math.nan
    if b == 0:
        return 1.0
    if math.isnan(a):
        return math.nan
    if a == 0 and b < 0:
        return math.inf
    try:
        return math.pow(a, b)
    except ValueError:  # negative ** fractional
        return math.nan
    except OverflowError:
        if a < 0 and float(b).is_integer() and int(b) % 2 == 1:
            return -math.inf
        return math.inf


def _min(*args: float) -> float:
    return math.nan if any(math.isnan(a) for a in args) else min(args)


def _max(*args: float) -> float:
    return math.nan if any(math.isnan(a) for a in args) else max(args)


def _round(x: float) -> float:
    # JavaScript Math.round: half rounds toward +infinity
    if math.isnan(x) or math.isinf(x):
        return x
    return float(math.floor(x + 0.5))


def _sign(x: float) -> float:
    if math.isnan(x):
        return math.nan
    return float((x > 0) - (x < 0))


def _cbrt(x: float) -> float:
    return math.copysign(abs(x) ** (1.0 / 3.0), x)


FUNCTIONS: dict[str, tuple[Callable[..., float], int, int]] = {
    # name: (fn, min_args, max_args)
    "sin": (_safe(math.sin), 1, 1),
    "cos": (_safe(math.cos), 1, 1),
    "tan": (_safe(math.tan), 1, 1),
    "asin": (_safe(math.asin), 1, 1),
    "acos": (_safe(math.acos), 1, 1),
    "atan": (_safe(math.atan), 1, 1),
    "atan2": (_safe(math.atan2), 2, 2),
    "sinh": (_safe(math.sinh), 1, 1),
    "cosh": (_safe(math.cosh), 1, 1),
    "tanh": (_safe(math.tanh), 1, 1),
    "sqrt": (_safe(math.sqrt), 1, 1),
    "cbrt": (_safe(_cbrt), 1, 1),
    "exp": (_safe(math.exp), 1, 1),
    "ln": (_ln, 1, 1),
    "log": (_log, 1, 2),
    "log10": (lambda x: _log(x), 1, 1),
    "log2": (lambda x: _log(x, 2.0), 1, 1),
    "abs": (lambda x: abs(x), 1, 1),
    "floor": (_safe(lambda x: math.floor(x) if math.isfinite(x) else x), 1, 1),
    "ceil": (_safe(lambda x: math.ceil(x) if math.isfinite(x) else x), 1, 1),
    "round": (_round, 1, 1),
    "sign": (_sign, 1, 1),
    "min": (_min, 1, 16),
    "max": (_max, 1, 16),
    "pow": (_pow, 2, 2),
    "hypot": (_safe(math.hypot), 1, 16),
}

CONSTANTS: dict[str, float] = {"pi": math.pi, "π": math.pi, "e": math.e, "deg": math.pi / 180.0}


# --------------------------------------------------------------------------- tokenizer
@dataclass
class Token:
    kind: str  # num, id, op, lp, rp, comma, end
    value: str
    pos: int


_OPS = {"+": "+", "-": "-", "−": "-", "*": "*", "×": "*", "·": "*", "/": "/", "÷": "/", "^": "^"}


def _is_ident_start(ch: str) -> bool:
    return ch.isalpha() or ch == "_"


def _is_ident_char(ch: str) -> bool:
    return ch.isalnum() or ch == "_"


DIGITS = "0123456789"


def normalize(src: str) -> str:
    """Accept common textbook notation: x² → x^2, x³ → x^3, √(…) → sqrt(…)."""
    return src.replace("²", "^2").replace("³", "^3").replace("√", " sqrt")


def tokenize(src: str) -> list[Token]:
    if len(src) > MAX_LENGTH:
        raise ExprError("too_long", "Expression is too long")
    src = normalize(src)
    tokens: list[Token] = []
    i, n = 0, len(src)
    while i < n:
        ch = src[i]
        if ch.isspace():
            i += 1
            continue
        if ch in DIGITS or (ch == "." and i + 1 < n and src[i + 1] in DIGITS):
            start = i
            while i < n and (src[i] in DIGITS or src[i] == "."):
                i += 1
            if i < n and src[i] in "eE" and i + 1 < n and (
                src[i + 1] in DIGITS or (src[i + 1] in "+-" and i + 2 < n and src[i + 2] in DIGITS)
            ):
                i += 2
                while i < n and src[i] in DIGITS:
                    i += 1
            text = src[start:i]
            if text.count(".") > 1:
                raise ExprError("bad_number", f"Invalid number '{text}'", start)
            tokens.append(Token("num", text, start))
            continue
        if ch == "π":  # always a standalone constant: 2πr = 2*π*r
            tokens.append(Token("id", "π", i))
            i += 1
            continue
        if _is_ident_start(ch):
            start = i
            while i < n and _is_ident_char(src[i]) and src[i] != "π":
                i += 1
            tokens.append(Token("id", src[start:i], start))
            continue
        if ch in _OPS:
            tokens.append(Token("op", _OPS[ch], i))
        elif ch == "(":
            tokens.append(Token("lp", ch, i))
        elif ch == ")":
            tokens.append(Token("rp", ch, i))
        elif ch == ",":
            tokens.append(Token("comma", ch, i))
        else:
            raise ExprError("unexpected_char", f"Unexpected character '{ch}'", i)
        i += 1
    tokens.append(Token("end", "", n))
    return tokens


# --------------------------------------------------------------------------- AST
# Nodes are tuples: ("num", v) | ("var", name) | ("neg", a) | ("bin", op, a, b) | ("call", name, [args])


class _Parser:
    def __init__(self, tokens: list[Token]):
        self.tokens = tokens
        self.i = 0
        self.depth = 0

    def _nested(self, parse: Callable[[], tuple]) -> tuple:
        self.depth += 1
        try:
            if self.depth > MAX_DEPTH:
                pos = self.peek().pos
                raise ExprError("unexpected_token", f"Too many nested brackets or signs at position {pos}", pos)
            return parse()
        finally:
            self.depth -= 1

    def peek(self) -> Token:
        return self.tokens[self.i]

    def take(self) -> Token:
        tok = self.tokens[self.i]
        self.i += 1
        return tok

    def expect(self, kind: str) -> Token:
        tok = self.take()
        if tok.kind != kind:
            raise ExprError("unexpected_token", f"Expected {kind} at position {tok.pos}", tok.pos)
        return tok

    def parse(self) -> tuple:
        if self.peek().kind == "end":
            raise ExprError("empty", "Expression is empty", 0)
        node = self.expr()
        tok = self.peek()
        if tok.kind != "end":
            raise ExprError("unexpected_token", f"Unexpected '{tok.value}' at position {tok.pos}", tok.pos)
        return node

    def expr(self) -> tuple:
        return self._nested(self._expr)

    def _expr(self) -> tuple:
        node = self.term()
        while self.peek().kind == "op" and self.peek().value in "+-":
            op = self.take().value
            node = ("bin", op, node, self.term())
        return node

    def term(self) -> tuple:
        node = self.unary()
        while True:
            tok = self.peek()
            if tok.kind == "op" and tok.value in "*/":
                self.take()
                node = ("bin", tok.value, node, self.unary())
            elif tok.kind in ("num", "id", "lp"):
                node = ("bin", "*", node, self.power())
            else:
                return node

    def unary(self) -> tuple:
        return self._nested(self._unary)

    def _unary(self) -> tuple:
        tok = self.peek()
        if tok.kind == "op" and tok.value in "+-":
            self.take()
            operand = self.unary()
            return ("neg", operand) if tok.value == "-" else operand
        return self.power()

    def power(self) -> tuple:
        base = self.primary()
        if self.peek().kind == "op" and self.peek().value == "^":
            self.take()
            return ("bin", "^", base, self.unary())
        return base

    def primary(self) -> tuple:
        tok = self.take()
        if tok.kind == "num":
            try:
                return ("num", float(tok.value))
            except ValueError as exc:
                raise ExprError("bad_number", f"Invalid number '{tok.value}'", tok.pos) from exc
        if tok.kind == "id":
            # A known function name followed by '(' is a call; any other identifier
            # followed by '(' is a variable times a parenthesised factor: x(x+1).
            if self.peek().kind == "lp" and tok.value.lower() in FUNCTIONS:
                name = tok.value.lower()
                self.take()
                args: list[tuple] = []
                if self.peek().kind != "rp":
                    args.append(self.expr())
                    while self.peek().kind == "comma":
                        self.take()
                        args.append(self.expr())
                self.expect("rp")
                _fn, lo, hi = FUNCTIONS[name]
                if not (lo <= len(args) <= hi):
                    raise ExprError("bad_arity", f"Wrong number of arguments for {name}", tok.pos)
                return ("call", name, args)
            return ("var", tok.value)
        if tok.kind == "lp":
            node = self.expr()
            self.expect("rp")
            return node
        raise ExprError("unexpected_token", f"Unexpected '{tok.value or 'end'}' at position {tok.pos}", tok.pos)


@dataclass
class Compiled:
    source: str
    ast: tuple

    def evaluate(self, variables: dict[str, float] | None = None) -> float:
        return _eval(self.ast, variables or {})

    @property
    def variables(self) -> set[str]:
        return free_variables(self.ast)


def compile_expr(source: str) -> Compiled:
    return Compiled(source, _Parser(tokenize(source or "")).parse())


def _eval(node: tuple, env: dict[str, float]) -> float:
    kind = node[0]
    if kind == "num":
        return node[1]
    if kind == "var":
        name = node[1]
        if name in env:
            return float(env[name])
        if name in CONSTANTS:
            return CONSTANTS[name]
        raise ExprError("unknown_variable", f"Unknown variable '{name}'")
    if kind == "neg":
        return -_eval(node[1], env)
    if kind == "bin":
        op, a, b = node[1], _eval(node[2], env), _eval(node[3], env)
        if op == "+":
            return a + b
        if op == "-":
            return a - b
        if op == "*":
            return a * b
        if op == "/":
            if b == 0:
                if a == 0 or math.isnan(a):
                    return math.nan
                return math.copysign(math.inf, a) * (math.copysign(1.0, b))
            return a / b
        if op == "^":
            return _pow(a, b)
    if kind == "call":
        fn, _lo, _hi = FUNCTIONS[node[1]]
        return fn(*[_eval(arg, env) for arg in node[2]])
    raise ExprError("bad_node", "Invalid expression")  # pragma: no cover


def free_variables(node: tuple) -> set[str]:
    kind = node[0]
    if kind == "var":
        return {node[1]}
    if kind == "neg":
        return free_variables(node[1])
    if kind == "bin":
        return free_variables(node[2]) | free_variables(node[3])
    if kind == "call":
        out: set[str] = set()
        for arg in node[2]:
            out |= free_variables(arg)
        return out
    return set()


def evaluate(source: str, variables: dict[str, float] | None = None) -> float:
    return compile_expr(source).evaluate(variables)


def unknown_variables(source: str, known: set[str]) -> set[str]:
    """Free identifiers that are neither ``known`` nor built-in constants."""
    return {v for v in compile_expr(source).variables if v not in known and v not in CONSTANTS}


def to_jsonable(value: float) -> Any:
    if math.isnan(value):
        return "nan"
    if math.isinf(value):
        return "inf" if value > 0 else "-inf"
    return value
