from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Preformatted

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "THRESHOLD_GUIDE.md"
OUTPUT = ROOT / "THRESHOLD_GUIDE.pdf"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="GuideTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=25, leading=31, alignment=TA_CENTER, textColor=colors.HexColor("#102a43"), spaceAfter=12))
styles.add(ParagraphStyle(name="GuideSubtitle", parent=styles["Normal"], fontName="Helvetica", fontSize=12, leading=17, alignment=TA_CENTER, textColor=colors.HexColor("#486581"), spaceAfter=22))
styles.add(ParagraphStyle(name="H1Guide", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=18, leading=23, textColor=colors.HexColor("#0b7285"), spaceBefore=16, spaceAfter=8))
styles.add(ParagraphStyle(name="H2Guide", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=colors.HexColor("#102a43"), spaceBefore=11, spaceAfter=5))
styles.add(ParagraphStyle(name="BodyGuide", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=14, textColor=colors.HexColor("#243b53"), spaceAfter=6))
styles.add(ParagraphStyle(name="BulletGuide", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=14, leftIndent=15, firstLineIndent=-8, bulletIndent=4, textColor=colors.HexColor("#243b53"), spaceAfter=3))
styles.add(ParagraphStyle(name="CodeGuide", parent=styles["Code"], fontName="Courier", fontSize=7.7, leading=10, leftIndent=8, rightIndent=8, borderColor=colors.HexColor("#d9e2ec"), borderWidth=0.5, borderPadding=7, backColor=colors.HexColor("#f5f7fa"), textColor=colors.HexColor("#102a43"), spaceBefore=4, spaceAfter=8))


def inline(text):
    text = escape(text)
    text = text.replace("**", "")
    text = text.replace("`", "")
    return text


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d9e2ec"))
    canvas.line(18 * mm, 14 * mm, 192 * mm, 14 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#829ab1"))
    canvas.drawString(18 * mm, 9 * mm, "Threshold project guide")
    canvas.drawRightString(192 * mm, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_story():
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    story = [Spacer(1, 20 * mm), Paragraph("Threshold", styles["GuideTitle"]), Paragraph("A plain-language guide to the project, the payment flow, and the demo", styles["GuideSubtitle"]), Paragraph("Read this once before presenting. It is written for understanding, not for impressing people with jargon.", styles["BodyGuide"]), PageBreak()]
    in_code = False
    code_lines = []
    for raw in lines:
        line = raw.rstrip()
        if line.startswith("```"):
            if in_code:
                story.append(Preformatted("\n".join(code_lines), styles["CodeGuide"]))
                code_lines = []
                in_code = False
            else:
                in_code = True
            continue
        if in_code:
            code_lines.append(line)
            continue
        if not line:
            story.append(Spacer(1, 3))
        elif line.startswith("# "):
            story.append(Paragraph(inline(line[2:]), styles["H1Guide"]))
        elif line.startswith("## "):
            story.append(Paragraph(inline(line[3:]), styles["H1Guide"]))
        elif line.startswith("### "):
            story.append(Paragraph(inline(line[4:]), styles["H2Guide"]))
        elif line.startswith("- "):
            story.append(Paragraph("• " + inline(line[2:]), styles["BulletGuide"]))
        elif line[0:2].isdigit() and line[2:4] == ". ":
            story.append(Paragraph(inline(line), styles["BulletGuide"]))
        else:
            story.append(Paragraph(inline(line), styles["BodyGuide"]))
    return story


doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm, topMargin=16 * mm, bottomMargin=19 * mm, title="Threshold Explained Like a Friend", author="Threshold")
doc.build(build_story(), onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
