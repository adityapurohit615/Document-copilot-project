import re
from html.parser import HTMLParser
from html import unescape


class SECFilingsHTMLParser(HTMLParser):
    """Strips HTML tags, styles, and scripts from SEC EDGAR filings,
    preserving structural newlines and headers.
    """

    def __init__(self) -> None:
        super().__init__()
        self.pieces: list[str] = []
        self._skip = False
        self._block_tags = {"p", "div", "tr", "table", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "br"}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        # Skip content inside script and style tags
        if tag in ("script", "style", "head"):
            self._skip = True
        elif tag in ("h1", "h2", "h3"):
            self.pieces.append("\n\n## ")
        elif tag in self._block_tags:
            self.pieces.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "head"):
            self._skip = False
        elif tag in self._block_tags:
            self.pieces.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self.pieces.append(data)


def parse_sec_html(html_content: str) -> str:
    """Takes raw SEC filing HTML and returns clean, normalized text."""
    parser = SECFilingsHTMLParser()
    parser.feed(html_content)
    raw_text = "".join(parser.pieces)

    # 1. Unescape HTML entities like &nbsp;, &#160;, &amp;
    text = unescape(raw_text)

    # 2. Replace non-breaking spaces with standard spaces
    text = text.replace("\xa0", " ").replace("\u200b", "")

    # 3. Collapse multiple spaces on the same line
    text = re.sub(r"[ \t]+", " ", text)

    # 4. Collapse 3+ consecutive newlines into 2 (paragraphs)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()